"""
Generates or reuses a Photos page Public Link: a snapshot of every active
photo for a project + capture method (across all dates), served read-only at
a durable, unauthenticated URL.

Client-supplied drawing hints are treated as a proposal only: the frozen
drawing (or None for a map-only link) is always re-derived and validated
server-side, and included_items is always re-collected from the database —
never trusted from the client. Backed by public.photos_link_export (see
server/migrations/2026_07_29_photos_link_export.sql).
"""

import hashlib
import json
import secrets
from typing import Any, Dict, List, Optional, Tuple

from app.services.storage.supabase_client import supabase_client
from app.utils.public_origin import get_public_app_origin

EXPORT_TABLE = "photos_link_export"
DRAWINGS_TABLE = "drawings"
WAYPOINTS_TABLE = "waypoints"
PHOTOS_TABLE = "photos"
FLIGHTS_TABLE = "flights"
ALLOWED_CAPTURE_METHODS = {"drone", "360_camera"}
ALIGNMENT_TRANSFORM_KEYS = (
    "transform_a",
    "transform_b",
    "transform_c",
    "transform_d",
    "transform_e",
    "transform_f",
)


class PhotosLinkExportError(Exception):
    """Raised for user-correctable Public Link failures (surfaced as HTTP 400)."""


def _get_drawing(drawing_id: str) -> Optional[Dict[str, Any]]:
    resp = (
        supabase_client.client.table(DRAWINGS_TABLE)
        .select("*")
        .eq("drawing_id", drawing_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def _is_drawing_aligned(drawing: Dict[str, Any]) -> bool:
    if not drawing or not drawing.get("aligned"):
        return False
    for key in ALIGNMENT_TRANSFORM_KEYS:
        value = drawing.get(key)
        if value is None:
            return False
        try:
            float(value)
        except (TypeError, ValueError):
            return False
    return True


def _resolve_frozen_drawing_id(
    project_id: str, capture_method: str, requested_drawing_id: Optional[str]
) -> Optional[str]:
    """Re-derive (never trust) the drawing to freeze for this link."""
    if capture_method == "360_camera":
        if not requested_drawing_id:
            raise PhotosLinkExportError(
                "Select a drawing before creating a Public Link."
            )
        drawing = _get_drawing(requested_drawing_id)
        if (
            not drawing
            or drawing.get("project_id") != project_id
            or drawing.get("drawing_type") != "floor_plan"
        ):
            raise PhotosLinkExportError("Drawing not found for this project.")
        return drawing["drawing_id"]

    # Drone: freeze the drawing only if it exists, belongs to this project,
    # and is aligned — otherwise the link is map-only (drawing_id = None).
    if not requested_drawing_id:
        return None
    drawing = _get_drawing(requested_drawing_id)
    if (
        not drawing
        or drawing.get("project_id") != project_id
        or drawing.get("drawing_type") != "site_plan"
        or not _is_drawing_aligned(drawing)
    ):
        return None
    return drawing["drawing_id"]


def _collect_active_items(
    project_id: str, capture_method: str, drawing_id: Optional[str]
) -> List[Dict[str, str]]:
    """Snapshot every active {waypoint_id, photo_id} pair for this project and
    capture method, across all dates. Ignores inactive photos."""
    if capture_method == "360_camera":
        wp_resp = (
            supabase_client.client.table(WAYPOINTS_TABLE)
            .select("waypoint_id")
            .eq("drawing_id", drawing_id)
            .execute()
        )
        waypoint_ids = [w["waypoint_id"] for w in (wp_resp.data or [])]
        if not waypoint_ids:
            return []
        photo_resp = (
            supabase_client.client.table(PHOTOS_TABLE)
            .select("waypoint_id, photo_id")
            .in_("waypoint_id", waypoint_ids)
            .eq("active_photo", True)
            .eq("capture_method", "360_camera")
            .execute()
        )
    else:
        flights_resp = (
            supabase_client.client.table(FLIGHTS_TABLE)
            .select("flight_id")
            .eq("project_id", project_id)
            .execute()
        )
        flight_ids = [f["flight_id"] for f in (flights_resp.data or [])]
        if not flight_ids:
            return []
        photo_resp = (
            supabase_client.client.table(PHOTOS_TABLE)
            .select("waypoint_id, photo_id")
            .in_("flight_id", flight_ids)
            .eq("active_photo", True)
            .eq("capture_method", "drone")
            .execute()
        )

    items: List[Dict[str, str]] = []
    for row in photo_resp.data or []:
        waypoint_id = row.get("waypoint_id")
        photo_id = row.get("photo_id")
        if waypoint_id and photo_id:
            items.append({"waypoint_id": waypoint_id, "photo_id": photo_id})
    return items


def _content_hash(
    project_id: str,
    capture_method: str,
    drawing_id: Optional[str],
    items: List[Dict[str, str]],
) -> str:
    """Canonical, order-independent fingerprint of the link's content, so
    identical snapshots always resolve to the same token."""
    sorted_items = sorted((item["waypoint_id"], item["photo_id"]) for item in items)
    canonical = json.dumps(
        {
            "project_id": project_id,
            "capture_method": capture_method,
            "drawing_id": drawing_id,
            "items": sorted_items,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _find_existing_by_hash(content_hash: str) -> Optional[Dict[str, Any]]:
    resp = (
        supabase_client.client.table(EXPORT_TABLE)
        .select("*")
        .eq("content_hash", content_hash)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def get_or_create_photos_link(
    project_id: str,
    capture_method: str,
    requested_drawing_id: Optional[str],
    user_id: str,
    request_url_root: str,
) -> Tuple[str, str]:
    """Generate (or reuse) a Public Link for this project + capture method.

    Returns (token, public_url).
    """
    if not supabase_client.client:
        raise PhotosLinkExportError("Database not configured.")
    if capture_method not in ALLOWED_CAPTURE_METHODS:
        raise PhotosLinkExportError("capture_method must be drone or 360_camera.")

    drawing_id = _resolve_frozen_drawing_id(
        project_id, capture_method, requested_drawing_id
    )
    items = _collect_active_items(project_id, capture_method, drawing_id)
    if not items:
        raise PhotosLinkExportError("No photos available to share yet.")

    content_hash = _content_hash(project_id, capture_method, drawing_id, items)

    existing = _find_existing_by_hash(content_hash)
    if existing:
        token = existing["token"]
    else:
        token = secrets.token_urlsafe(16)
        row = {
            "token": token,
            "project_id": project_id,
            "user_id": user_id,
            "drawing_id": drawing_id,
            "capture_method": capture_method,
            "included_items": items,
            "content_hash": content_hash,
        }
        try:
            resp = supabase_client.client.table(EXPORT_TABLE).insert(row).execute()
            inserted = (resp.data or [None])[0]
            token = (inserted or row).get("token", token)
        except Exception:
            # Unique content_hash race — another request just inserted this
            # exact snapshot. Reuse it instead of failing.
            existing = _find_existing_by_hash(content_hash)
            if not existing:
                raise
            token = existing["token"]

    public_origin = get_public_app_origin(request_url_root)
    return token, f"{public_origin}/public/photos-link/{token}"
