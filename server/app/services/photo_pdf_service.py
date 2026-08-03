"""
Builds a PDF export of a Photos page drawing with waypoint markers deep-
linked into the matching Public Link viewer, for the active photos matching
a date filter (all dates, one date, or a custom set of dates).

Every input is re-derived server-side via photos_export_shared — the
project's active photos, the frozen/aligned drawing, and the date filter are
never trusted from the client. Every PDF export also creates or reuses the
matching photos_link_export row (same project, capture method, drawing
freeze, and date-filtered photo set) so marker hyperlinks always land in a
real, working Public Link experience instead of a dead end.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4
import hashlib

import fitz  # PyMuPDF

from app.services.photos_export_shared import (
    ALLOWED_CAPTURE_METHODS,
    PhotosExportError,
    collect_active_items,
    resolve_frozen_drawing_id,
    validate_date_filter,
)
from app.services.photos_link_export_service import get_or_create_photos_link_row
from app.services.storage.r2_client import r2_client
from app.services.storage.supabase_client import supabase_client
from app.utils.affine_transform import geo_to_pixel
from app.utils.pdf_pin import draw_waypoint_marker
from app.utils.public_origin import get_public_app_origin

EXPORT_TABLE = "photos_pdf_export"
EXPORT_KEY_TEMPLATE = "projects/{project_id}/photos-pdf-exports/{export_id}.pdf"
MARKER_LINK_PADDING = 6
# Bump when marker artwork or hyperlink URL shape changes so stale PDFs
# (wrong icons / wrong origin / missing ?photo=) are not reused.
PDF_RENDER_VERSION = "3"

# Same exception type as photos_export_shared/photos_link_export_service, so
# either module's validation failures are caught identically by the API route.
PhotoPdfExportError = PhotosExportError


def _get_drawing(drawing_id: str) -> Dict[str, Any]:
    resp = (
        supabase_client.client.table("drawings")
        .select("*")
        .eq("drawing_id", drawing_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise PhotoPdfExportError("Drawing not found.")
    return rows[0]


def _download_drawing_image(drawing: Dict[str, Any]) -> bytes:
    r2_path = drawing.get("r2_path")
    if not r2_path:
        raise PhotoPdfExportError("Drawing has no stored file.")
    image_bytes = r2_client.download_bytes(r2_path)
    if not image_bytes:
        raise PhotoPdfExportError("Unable to load drawing image from storage.")
    return image_bytes


def _fetch_waypoint_row(waypoint_id: str) -> Optional[Dict[str, Any]]:
    resp = (
        supabase_client.client.table("waypoints")
        .select("*")
        .eq("waypoint_id", waypoint_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def _resolve_site_pixel(
    waypoint: Dict[str, Any], drawing: Dict[str, Any]
) -> Optional[Tuple[float, float]]:
    lat, lng = waypoint.get("lat"), waypoint.get("lng")
    if lat is None or lng is None:
        return None
    return geo_to_pixel(drawing, float(lat), float(lng))


def _resolve_floor_pixel(
    waypoint: Dict[str, Any], drawing_id: str
) -> Optional[Tuple[float, float]]:
    if waypoint.get("drawing_id") != drawing_id:
        return None
    px, py = waypoint.get("pixel_x"), waypoint.get("pixel_y")
    if px is None or py is None:
        return None
    return float(px), float(py)


def _group_by_waypoint_with_newest_photo(
    items: List[Dict[str, str]]
) -> List[Dict[str, str]]:
    """Pick the newest active photo per waypoint — the marker's deep-link
    target — from the already date-filtered, active-photo item snapshot."""
    photo_ids = sorted({item["photo_id"] for item in items})
    if not photo_ids:
        return []
    resp = (
        supabase_client.client.table("photos")
        .select("photo_id, taken_at")
        .in_("photo_id", photo_ids)
        .execute()
    )
    taken_at_by_photo = {row["photo_id"]: row.get("taken_at") or "" for row in (resp.data or [])}

    newest_by_waypoint: Dict[str, Dict[str, str]] = {}
    for item in items:
        waypoint_id, photo_id = item["waypoint_id"], item["photo_id"]
        taken_at = taken_at_by_photo.get(photo_id, "")
        current = newest_by_waypoint.get(waypoint_id)
        if not current or taken_at > current["taken_at"]:
            newest_by_waypoint[waypoint_id] = {
                "waypoint_id": waypoint_id,
                "photo_id": photo_id,
                "taken_at": taken_at,
            }
    return list(newest_by_waypoint.values())


def _resolve_pixel_positions(
    waypoint_items: List[Dict[str, str]], drawing: Dict[str, Any], capture_method: str
) -> List[Dict[str, Any]]:
    """Re-derive each waypoint's marker position server-side from the
    drawing's affine transform (site plan) or stored pixel coords (floor
    plan) — never trusted from the client."""
    is_site_plan = capture_method == "drone"
    resolved: List[Dict[str, Any]] = []
    for item in waypoint_items:
        waypoint = _fetch_waypoint_row(item["waypoint_id"])
        if not waypoint:
            continue
        pixel = (
            _resolve_site_pixel(waypoint, drawing)
            if is_site_plan
            else _resolve_floor_pixel(waypoint, drawing["drawing_id"])
        )
        if not pixel:
            continue
        resolved.append(
            {
                "waypoint_id": item["waypoint_id"],
                "photo_id": item["photo_id"],
                "pixel_x": pixel[0],
                "pixel_y": pixel[1],
            }
        )
    if not resolved:
        raise PhotoPdfExportError("No valid waypoint photos found for the selected dates.")
    return resolved


def _render_pdf(
    image_bytes: bytes,
    items: List[Dict[str, Any]],
    capture_method: str,
    link_token: str,
    public_origin: str,
) -> bytes:
    """Draw the drawing image on a single PDF page, then overlay a circular
    waypoint marker and a clickable URI link for each included waypoint,
    deep-linking into the matching Public Link viewer's immersive photo view
    (not the dead-end single-photo public viewer)."""
    pixmap = fitz.Pixmap(image_bytes)
    size_basis = max(10.0, min(pixmap.width, pixmap.height) * 0.014)
    marker_diameter = size_basis * 2.0

    doc = fitz.open()
    page = doc.new_page(width=pixmap.width, height=pixmap.height)
    page.insert_image(fitz.Rect(0, 0, pixmap.width, pixmap.height), pixmap=pixmap)

    for item in items:
        marker_rect = draw_waypoint_marker(
            page, item["pixel_x"], item["pixel_y"], marker_diameter, capture_method
        )
        link_rect = fitz.Rect(
            marker_rect.x0 - MARKER_LINK_PADDING,
            marker_rect.y0 - MARKER_LINK_PADDING,
            marker_rect.x1 + MARKER_LINK_PADDING,
            marker_rect.y1 + MARKER_LINK_PADDING,
        )
        page.insert_link(
            {
                "kind": fitz.LINK_URI,
                "from": link_rect,
                "uri": f"{public_origin}/public/photos-link/{link_token}?photo={item['photo_id']}",
            }
        )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _upload_export_pdf(project_id: str, pdf_bytes: bytes) -> Tuple[str, str]:
    export_id = str(uuid4())
    r2_key = EXPORT_KEY_TEMPLATE.format(project_id=project_id, export_id=export_id)
    ok = r2_client.upload_bytes(pdf_bytes, r2_key, content_type="application/pdf")
    if not ok:
        raise PhotoPdfExportError("Failed to upload the generated PDF.")
    return export_id, r2_key


def _find_existing_pdf_by_hash(content_hash: str) -> Optional[Dict[str, Any]]:
    resp = (
        supabase_client.client.table(EXPORT_TABLE)
        .select("*")
        .eq("content_hash", content_hash)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def _pdf_reuse_hash(snapshot_hash: str, public_origin: str) -> str:
    """PDF-specific reuse key: same photo snapshot can still need a different
    PDF when the public origin or render version changes (baked-in links/icons)."""
    canonical = f"{snapshot_hash}|{public_origin}|{PDF_RENDER_VERSION}"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _insert_export_record(
    export_id: str,
    project_id: str,
    user_id: str,
    drawing_id: Optional[str],
    date_mode: str,
    dates: List[str],
    capture_method: str,
    r2_key: str,
    items: List[Dict[str, Any]],
    content_hash: str,
    link_export_id: Optional[str],
) -> Dict[str, Any]:
    included_items = [
        {"waypoint_id": item["waypoint_id"], "photo_id": item["photo_id"]} for item in items
    ]
    row = {
        "export_id": export_id,
        "project_id": project_id,
        "user_id": user_id,
        "drawing_id": drawing_id,
        "date_mode": date_mode,
        "selected_dates": dates,
        "capture_method": capture_method,
        "r2_path": r2_key,
        "r2_url": r2_client.get_file_url(r2_key),
        "included_items": included_items,
        "content_hash": content_hash,
        "link_export_id": link_export_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = supabase_client.client.table(EXPORT_TABLE).insert(row).execute()
    rows = resp.data or []
    return rows[0] if rows else row


def _build_filename(date_mode: str, dates: List[str]) -> str:
    if date_mode == "all":
        return "photos-all-dates.pdf"
    if date_mode == "single":
        return f"photos-{dates[0]}.pdf"
    if len(dates) <= 4:
        return f"photos-custom-{'_'.join(dates)}.pdf"
    return f"photos-custom-{len(dates)}-dates.pdf"


def build_photo_pdf_export(
    project_id: str,
    drawing_id: Optional[str],
    capture_method: str,
    date_mode_input: Optional[str],
    dates_input: Optional[List[Any]],
    user_id: str,
    request_url_root: str,
) -> Tuple[bytes, str, Dict[str, Any]]:
    """Generate (or reuse), store, and record a Photos PDF export, ensuring
    the matching Public Link exists first so PDF marker hyperlinks always
    resolve. Returns (pdf_bytes, filename, export_record)."""
    if not supabase_client.client:
        raise PhotoPdfExportError("Database not configured.")
    if not r2_client.client:
        raise PhotoPdfExportError("Storage not configured.")
    if capture_method not in ALLOWED_CAPTURE_METHODS:
        raise PhotoPdfExportError("capture_method must be drone or 360_camera.")

    date_mode, dates = validate_date_filter(date_mode_input, dates_input)

    resolved_drawing_id = resolve_frozen_drawing_id(project_id, capture_method, drawing_id)
    if capture_method == "drone" and not resolved_drawing_id:
        raise PhotoPdfExportError("Align this drawing before exporting a PDF.")

    items = collect_active_items(
        project_id, capture_method, resolved_drawing_id, date_mode, dates
    )
    if not items:
        raise PhotoPdfExportError("No photos available for the selected dates.")

    link_result = get_or_create_photos_link_row(
        project_id, capture_method, resolved_drawing_id, date_mode, dates, items, user_id
    )
    snapshot_hash = link_result["content_hash"]
    filename = _build_filename(date_mode, dates)
    public_origin = get_public_app_origin(request_url_root)
    pdf_hash = _pdf_reuse_hash(snapshot_hash, public_origin)

    existing_pdf = _find_existing_pdf_by_hash(pdf_hash)
    if existing_pdf and existing_pdf.get("r2_path"):
        pdf_bytes = r2_client.download_bytes(existing_pdf["r2_path"])
        if pdf_bytes:
            return pdf_bytes, filename, existing_pdf

    drawing = _get_drawing(resolved_drawing_id)
    newest_by_waypoint = _group_by_waypoint_with_newest_photo(items)
    resolved_items = _resolve_pixel_positions(newest_by_waypoint, drawing, capture_method)
    image_bytes = _download_drawing_image(drawing)

    pdf_bytes = _render_pdf(
        image_bytes, resolved_items, capture_method, link_result["token"], public_origin
    )

    export_id, r2_key = _upload_export_pdf(project_id, pdf_bytes)
    export_record = _insert_export_record(
        export_id,
        project_id,
        user_id,
        resolved_drawing_id,
        date_mode,
        dates,
        capture_method,
        r2_key,
        resolved_items,
        pdf_hash,
        link_result["export_id"],
    )

    return pdf_bytes, filename, export_record
