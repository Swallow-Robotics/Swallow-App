"""
Shared helpers for the Photos page's two exports — Public Link and PDF —
so both always agree on what "the same export" means: the same frozen
drawing, the same active-photo snapshot, and the same date filter.

Centralizes:
  - resolving (never trusting) the drawing to freeze for a capture method
  - validating the date filter (all | single | custom dates)
  - collecting the active {waypoint_id, photo_id} snapshot for that filter
  - the canonical content hash used to dedupe/reuse export rows

Only active_photo = true photos ever count, and every input here is
re-derived server-side — client-supplied ids/dates are validated, never
trusted as the final answer.
"""

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.services.storage.supabase_client import supabase_client

DRAWINGS_TABLE = "drawings"
WAYPOINTS_TABLE = "waypoints"
PHOTOS_TABLE = "photos"
FLIGHTS_TABLE = "flights"

ALLOWED_CAPTURE_METHODS = {"drone", "360_camera"}
ALLOWED_DATE_MODES = {"all", "single", "custom"}
_DATE_KEY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

ALIGNMENT_TRANSFORM_KEYS = (
    "transform_a",
    "transform_b",
    "transform_c",
    "transform_d",
    "transform_e",
    "transform_f",
)


class PhotosExportError(Exception):
    """Raised for user-correctable Photos export failures (surfaced as HTTP 400)."""


def get_drawing(drawing_id: str) -> Optional[Dict[str, Any]]:
    resp = (
        supabase_client.client.table(DRAWINGS_TABLE)
        .select("*")
        .eq("drawing_id", drawing_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def is_drawing_aligned(drawing: Dict[str, Any]) -> bool:
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


def resolve_frozen_drawing_id(
    project_id: str, capture_method: str, requested_drawing_id: Optional[str]
) -> Optional[str]:
    """Re-derive (never trust) the drawing to freeze for this export.

    360_camera always requires a floor-plan drawing. Drone freezes the
    requested site-plan drawing only if it exists, belongs to this project,
    and is aligned — otherwise the export is map-only (drawing_id = None).
    """
    if capture_method == "360_camera":
        if not requested_drawing_id:
            raise PhotosExportError("Select a drawing before exporting.")
        drawing = get_drawing(requested_drawing_id)
        if (
            not drawing
            or drawing.get("project_id") != project_id
            or drawing.get("drawing_type") != "floor_plan"
        ):
            raise PhotosExportError("Drawing not found for this project.")
        return drawing["drawing_id"]

    if not requested_drawing_id:
        return None
    drawing = get_drawing(requested_drawing_id)
    if (
        not drawing
        or drawing.get("project_id") != project_id
        or drawing.get("drawing_type") != "site_plan"
        or not is_drawing_aligned(drawing)
    ):
        return None
    return drawing["drawing_id"]


def validate_date_filter(
    date_mode: Optional[str], dates: Optional[List[Any]]
) -> Tuple[str, List[str]]:
    """Normalize and validate the date filter, returning (mode, sorted unique dates)."""
    mode = (date_mode or "all").strip()
    if mode not in ALLOWED_DATE_MODES:
        raise PhotosExportError("date_mode must be all, single, or custom.")

    raw_dates = [str(d).strip() for d in (dates or []) if str(d or "").strip()]
    for date_key in raw_dates:
        if not _DATE_KEY_RE.match(date_key):
            raise PhotosExportError("Dates must be in YYYY-MM-DD format.")
    unique_sorted = sorted(set(raw_dates))

    if mode == "all":
        return "all", []
    if mode == "single":
        if len(unique_sorted) != 1:
            raise PhotosExportError("Select exactly one date.")
        return "single", unique_sorted
    if not unique_sorted:
        raise PhotosExportError("Select at least one date.")
    return "custom", unique_sorted


def date_key_from_taken_at(taken_at: Optional[str]) -> Optional[str]:
    """UTC calendar-date bucket for a stored taken_at timestamp."""
    if not taken_at:
        return None
    value = taken_at.replace("Z", "+00:00") if isinstance(taken_at, str) else taken_at
    try:
        dt = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%d")


def _matches_date_filter(taken_at: Optional[str], date_mode: str, dates: List[str]) -> bool:
    if date_mode == "all":
        return True
    key = date_key_from_taken_at(taken_at)
    return bool(key) and key in dates


def collect_active_items(
    project_id: str,
    capture_method: str,
    drawing_id: Optional[str],
    date_mode: str,
    dates: List[str],
) -> List[Dict[str, str]]:
    """Snapshot every active {waypoint_id, photo_id} pair for this project,
    capture method, and date filter. Ignores inactive photos."""
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
            .select("waypoint_id, photo_id, taken_at")
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
            .select("waypoint_id, photo_id, taken_at")
            .in_("flight_id", flight_ids)
            .eq("active_photo", True)
            .eq("capture_method", "drone")
            .execute()
        )

    items: List[Dict[str, str]] = []
    for row in photo_resp.data or []:
        waypoint_id = row.get("waypoint_id")
        photo_id = row.get("photo_id")
        if not waypoint_id or not photo_id:
            continue
        if not _matches_date_filter(row.get("taken_at"), date_mode, dates):
            continue
        items.append({"waypoint_id": waypoint_id, "photo_id": photo_id})
    return items


def compute_content_hash(
    project_id: str,
    capture_method: str,
    drawing_id: Optional[str],
    date_mode: str,
    dates: List[str],
    items: List[Dict[str, str]],
) -> str:
    """Canonical, order-independent fingerprint of an export's content, so
    identical snapshots always resolve to the same row/token, and distinct
    date filters never collide even if their item sets happen to coincide."""
    sorted_items = sorted((item["waypoint_id"], item["photo_id"]) for item in items)
    canonical = json.dumps(
        {
            "project_id": project_id,
            "capture_method": capture_method,
            "drawing_id": drawing_id,
            "date_mode": date_mode,
            "dates": sorted(dates),
            "items": sorted_items,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
