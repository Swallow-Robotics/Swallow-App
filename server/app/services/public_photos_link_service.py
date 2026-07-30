"""
Public (token-gated, unauthenticated) read access to a Photos page Public
Link: the frozen drawing (if any) plus the still-active photos for every
waypoint captured in the link's snapshot at generation time.

This module never exposes a project's full photo list — only the waypoints
and photos recorded in included_items, and only while active_photo is still
true. Mirrors the read-only patterns in public_photo_service.py.
"""

from typing import Any, Dict, List, Optional

from app.services.storage.r2_client import r2_client
from app.services.storage.supabase_client import supabase_client

EXPORT_TABLE = "photos_link_export"
DRAWINGS_TABLE = "drawings"
WAYPOINTS_TABLE = "waypoints"
PHOTOS_TABLE = "photos"
DRAWING_TRANSFORM_KEYS = (
    "transform_a",
    "transform_b",
    "transform_c",
    "transform_d",
    "transform_e",
    "transform_f",
)


def _load_export(token: str) -> Optional[Dict[str, Any]]:
    if not supabase_client.client or not token:
        return None
    resp = (
        supabase_client.client.table(EXPORT_TABLE)
        .select("*")
        .eq("token", token)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def _project_name(project_id: Optional[str]) -> Optional[str]:
    if not project_id:
        return None
    try:
        return (supabase_client.get_project(project_id) or {}).get("project_name")
    except Exception:
        return None


def _serialize_drawing(
    drawing: Dict[str, Any], capture_method: str
) -> Optional[Dict[str, Any]]:
    r2_path = drawing.get("r2_path")
    signed_url = r2_client.generate_presigned_url(r2_path, expires_in=900) if r2_path else None
    if not signed_url:
        return None
    out: Dict[str, Any] = {
        "drawing_id": drawing.get("drawing_id"),
        "r2_url": signed_url,
        "width": drawing.get("width"),
        "height": drawing.get("height"),
    }
    if capture_method == "drone":
        for key in DRAWING_TRANSFORM_KEYS:
            out[key] = drawing.get(key)
    return out


def _valid_pairs(included_items: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    return [
        item
        for item in included_items or []
        if item.get("waypoint_id") and item.get("photo_id")
    ]


def get_public_link_view(token: str) -> Optional[Dict[str, Any]]:
    """Return the shell payload (project, capture method, drawing, waypoints
    with their still-active photos) for the public Photos Link viewer."""
    export = _load_export(token)
    if not export:
        return None

    project_id = export.get("project_id")
    capture_method = export.get("capture_method")
    drawing_id = export.get("drawing_id")
    included = _valid_pairs(export.get("included_items"))

    photo_to_waypoint = {item["photo_id"]: item["waypoint_id"] for item in included}
    photo_ids = list(photo_to_waypoint.keys())
    waypoint_ids = sorted({item["waypoint_id"] for item in included})

    drawing = None
    if drawing_id:
        drawing_row = (
            supabase_client.client.table(DRAWINGS_TABLE)
            .select("*")
            .eq("drawing_id", drawing_id)
            .limit(1)
            .execute()
        )
        drawing_row = (drawing_row.data or [None])[0]
        drawing = _serialize_drawing(drawing_row, capture_method) if drawing_row else None
        if capture_method == "360_camera" and not drawing:
            # The frozen drawing is required for 360; if it's gone, this
            # link can no longer be rendered at all.
            return None

    waypoint_rows: Dict[str, Dict[str, Any]] = {}
    if waypoint_ids:
        wp_resp = (
            supabase_client.client.table(WAYPOINTS_TABLE)
            .select("*")
            .in_("waypoint_id", waypoint_ids)
            .execute()
        )
        waypoint_rows = {w["waypoint_id"]: w for w in (wp_resp.data or [])}

    photos_by_waypoint: Dict[str, List[Dict[str, Any]]] = {}
    if photo_ids:
        photo_resp = (
            supabase_client.client.table(PHOTOS_TABLE)
            .select("*")
            .in_("photo_id", photo_ids)
            .eq("active_photo", True)
            .execute()
        )
        for record in photo_resp.data or []:
            waypoint_id = record.get("waypoint_id")
            if not waypoint_id:
                continue
            thumb_path = record.get("thumbnail_r2_path")
            thumb_url = (
                r2_client.generate_presigned_url(thumb_path, expires_in=900)
                if thumb_path
                else None
            )
            photos_by_waypoint.setdefault(waypoint_id, []).append(
                {
                    "photo_id": record.get("photo_id"),
                    "taken_at": record.get("taken_at"),
                    "thumbnail_r2_url": thumb_url,
                }
            )

    waypoints_out = []
    for waypoint_id, wp in waypoint_rows.items():
        photos = sorted(
            photos_by_waypoint.get(waypoint_id, []),
            key=lambda p: p.get("taken_at") or "",
            reverse=True,
        )
        if not photos:
            # Every photo for this waypoint went inactive since the link was
            # generated — omit the now-empty waypoint entirely.
            continue
        waypoints_out.append(
            {
                "waypoint_id": waypoint_id,
                "waypoint_name": wp.get("waypoint_name"),
                "lat": wp.get("lat"),
                "lng": wp.get("lng"),
                "pixel_x": wp.get("pixel_x"),
                "pixel_y": wp.get("pixel_y"),
                "photos": photos,
            }
        )

    return {
        "project_name": _project_name(project_id),
        "capture_method": capture_method,
        "drawing": drawing,
        "waypoints": waypoints_out,
    }


def get_public_link_photo(token: str, photo_id: str) -> Optional[Dict[str, Any]]:
    """Return a public-safe photo record for the given link + photo_id, or
    None if the photo isn't part of this link's snapshot or is inactive."""
    export = _load_export(token)
    if not export or not photo_id:
        return None

    included = _valid_pairs(export.get("included_items"))
    waypoint_id = next(
        (item["waypoint_id"] for item in included if item["photo_id"] == photo_id),
        None,
    )
    if not waypoint_id:
        return None

    resp = (
        supabase_client.client.table(PHOTOS_TABLE)
        .select("*")
        .eq("photo_id", photo_id)
        .eq("waypoint_id", waypoint_id)
        .eq("active_photo", True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    photo = rows[0]

    r2_path = photo.get("r2_path")
    signed_url = r2_client.generate_presigned_url(r2_path, expires_in=900) if r2_path else None
    if not signed_url:
        return None

    wp_resp = (
        supabase_client.client.table(WAYPOINTS_TABLE)
        .select("waypoint_name")
        .eq("waypoint_id", waypoint_id)
        .limit(1)
        .execute()
    )
    wp_rows = wp_resp.data or []
    waypoint_name = wp_rows[0].get("waypoint_name") if wp_rows else None

    return {
        "photo_id": photo.get("photo_id"),
        "waypoint_id": waypoint_id,
        "waypoint_name": waypoint_name,
        "taken_at": photo.get("taken_at"),
        "capture_method": photo.get("capture_method"),
        "project_name": _project_name(export.get("project_id")),
        "r2_url": signed_url,
    }
