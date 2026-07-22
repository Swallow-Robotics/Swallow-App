"""
Builds a PDF export of a Photos page drawing with waypoint markers hyperlinked
to the public photo viewer, for one photo per waypoint on a selected date.

Client-selected {waypoint_id, photo_id} pairs are treated as a proposal only:
every item is re-validated against the database (active photo, matching
capture method, matching waypoint, matching project/drawing) and every marker
position is re-derived server-side from the drawing's affine transform or the
waypoint's stored pixel coordinates — never trusted from the client.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import fitz  # PyMuPDF

from app.services.public_photo_service import ensure_public_token
from app.services.storage.r2_client import r2_client
from app.services.storage.supabase_client import supabase_client
from app.utils.affine_transform import geo_to_pixel
from app.utils.public_origin import get_public_app_origin

EXPORT_TABLE = "photo_pdf_exports"
EXPORT_KEY_TEMPLATE = "projects/{project_id}/photo-pdf-exports/{export_id}.pdf"
MARKER_COLOR = (0.85, 0.2, 0.2)
MARKER_LINK_PADDING = 6


class PhotoPdfExportError(Exception):
    """Raised for user-correctable PDF export failures (surfaced as HTTP 400)."""


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


def _fetch_photo_row(photo_id: str) -> Optional[Dict[str, Any]]:
    resp = (
        supabase_client.client.table("photos")
        .select("*")
        .eq("photo_id", photo_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


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


def _photo_belongs_to_project(
    photo: Dict[str, Any], project_id: str, is_site_plan: bool
) -> bool:
    """Site plan photos are project-scoped via flights; floor plan ownership
    is enforced separately via the waypoint's drawing_id."""
    if not is_site_plan:
        return True
    flight_id = photo.get("flight_id")
    if not flight_id:
        return False
    resp = (
        supabase_client.client.table("flights")
        .select("project_id")
        .eq("flight_id", flight_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return bool(rows) and rows[0].get("project_id") == project_id


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


def _validate_and_collect_items(
    project_id: str,
    drawing: Dict[str, Any],
    capture_method: str,
    requested_items: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Re-validate client-proposed items and resolve each waypoint's pixel
    position on the given drawing. One entry per waypoint, at most."""
    is_site_plan = capture_method == "drone"
    if is_site_plan and not drawing.get("aligned"):
        raise PhotoPdfExportError("Align this drawing before exporting a PDF.")

    resolved: List[Dict[str, Any]] = []
    seen_waypoints = set()
    for item in requested_items:
        waypoint_id = (item or {}).get("waypoint_id")
        photo_id = (item or {}).get("photo_id")
        if not waypoint_id or not photo_id or waypoint_id in seen_waypoints:
            continue

        photo = _fetch_photo_row(photo_id)
        if (
            not photo
            or not photo.get("active_photo")
            or photo.get("capture_method") != capture_method
            or photo.get("waypoint_id") != waypoint_id
            or not _photo_belongs_to_project(photo, project_id, is_site_plan)
        ):
            continue

        waypoint = _fetch_waypoint_row(waypoint_id)
        if not waypoint:
            continue

        pixel = (
            _resolve_site_pixel(waypoint, drawing)
            if is_site_plan
            else _resolve_floor_pixel(waypoint, drawing["drawing_id"])
        )
        if not pixel:
            continue

        seen_waypoints.add(waypoint_id)
        resolved.append(
            {
                "waypoint_id": waypoint_id,
                "photo_id": photo_id,
                "pixel_x": pixel[0],
                "pixel_y": pixel[1],
            }
        )

    if not resolved:
        raise PhotoPdfExportError(
            "No valid waypoint photos found for the selected date."
        )
    return resolved


def _ensure_tokens(items: List[Dict[str, Any]]) -> Dict[str, str]:
    tokens: Dict[str, str] = {}
    for item in items:
        token = ensure_public_token(item["photo_id"])
        if token:
            tokens[item["photo_id"]] = token
    return tokens


def _render_pdf(
    image_bytes: bytes,
    items: List[Dict[str, Any]],
    tokens: Dict[str, str],
    public_origin: str,
) -> bytes:
    """Draw the drawing image on a single PDF page, then overlay a marker and
    a clickable URI link annotation for each included waypoint."""
    pixmap = fitz.Pixmap(image_bytes)
    radius = max(10.0, min(pixmap.width, pixmap.height) * 0.012)

    doc = fitz.open()
    page = doc.new_page(width=pixmap.width, height=pixmap.height)
    page.insert_image(fitz.Rect(0, 0, pixmap.width, pixmap.height), pixmap=pixmap)

    for item in items:
        token = tokens.get(item["photo_id"])
        if not token:
            continue
        center = fitz.Point(item["pixel_x"], item["pixel_y"])
        page.draw_circle(
            center, radius, color=MARKER_COLOR, fill=MARKER_COLOR, width=0
        )
        pad = radius + MARKER_LINK_PADDING
        link_rect = fitz.Rect(
            center.x - pad, center.y - pad, center.x + pad, center.y + pad
        )
        page.insert_link(
            {
                "kind": fitz.LINK_URI,
                "from": link_rect,
                "uri": f"{public_origin}/public/photos/{token}",
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


def _insert_export_record(
    export_id: str,
    project_id: str,
    user_id: str,
    drawing_id: str,
    date_key: str,
    capture_method: str,
    r2_key: str,
    items: List[Dict[str, Any]],
    tokens: Dict[str, str],
) -> Dict[str, Any]:
    included_items = [
        {
            "waypoint_id": item["waypoint_id"],
            "photo_id": item["photo_id"],
            "public_token": tokens.get(item["photo_id"]),
        }
        for item in items
    ]
    row = {
        "export_id": export_id,
        "project_id": project_id,
        "user_id": user_id,
        "drawing_id": drawing_id,
        "selected_date": date_key,
        "capture_method": capture_method,
        "r2_path": r2_key,
        "r2_url": r2_client.get_file_url(r2_key),
        "included_items": included_items,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = supabase_client.client.table(EXPORT_TABLE).insert(row).execute()
    rows = resp.data or []
    return rows[0] if rows else row


def build_photo_pdf_export(
    project_id: str,
    drawing_id: str,
    capture_method: str,
    date_key: str,
    requested_items: List[Dict[str, Any]],
    user_id: str,
    request_url_root: str,
) -> Tuple[bytes, str, Dict[str, Any]]:
    """Generate, store, and record a Photos PDF export.

    Returns (pdf_bytes, filename, export_record).
    """
    if not supabase_client.client:
        raise PhotoPdfExportError("Database not configured.")
    if not r2_client.client:
        raise PhotoPdfExportError("Storage not configured.")

    drawing = _get_drawing(drawing_id)
    if drawing.get("project_id") != project_id:
        raise PhotoPdfExportError("Drawing does not belong to this project.")

    items = _validate_and_collect_items(
        project_id, drawing, capture_method, requested_items
    )
    image_bytes = _download_drawing_image(drawing)

    tokens = _ensure_tokens(items)
    public_origin = get_public_app_origin(request_url_root)
    pdf_bytes = _render_pdf(image_bytes, items, tokens, public_origin)

    export_id, r2_key = _upload_export_pdf(project_id, pdf_bytes)
    export_record = _insert_export_record(
        export_id,
        project_id,
        user_id,
        drawing_id,
        date_key,
        capture_method,
        r2_key,
        items,
        tokens,
    )

    filename = f"photos-{date_key}.pdf"
    return pdf_bytes, filename, export_record
