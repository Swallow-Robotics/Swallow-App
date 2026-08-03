"""
Generates or reuses a Photos page Public Link: a snapshot of the active
photos for a project + capture method that match a date filter (all dates,
one date, or a custom set of dates), served read-only at a durable,
unauthenticated URL.

Client-supplied drawing hints and dates are treated as a proposal only: the
frozen drawing, the date filter, and included_items are always re-derived
and validated server-side via photos_export_shared — never trusted from the
client. Date filtering is represented in content_hash + the filtered
included_items snapshot; photos_link_export does not store date_mode columns.
Backed by public.photos_link_export (see
server/migrations/2026_07_29_photos_link_export.sql).
"""

from typing import Any, Dict, List, Optional

import secrets

from app.services.photos_export_shared import (
    ALLOWED_CAPTURE_METHODS,
    PhotosExportError,
    collect_active_items,
    compute_content_hash,
    resolve_frozen_drawing_id,
    validate_date_filter,
)
from app.services.storage.supabase_client import supabase_client
from app.utils.public_origin import get_public_app_origin

EXPORT_TABLE = "photos_link_export"

# Re-exported for callers (e.g. the API route) that only need the error type
# or the allowed capture methods from this module.
PhotosLinkExportError = PhotosExportError


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


def get_or_create_photos_link_row(
    project_id: str,
    capture_method: str,
    drawing_id: Optional[str],
    date_mode: str,
    dates: List[str],
    items: List[Dict[str, str]],
    user_id: str,
) -> Dict[str, Any]:
    """Create (or reuse) a photos_link_export row from an already-resolved
    drawing_id + item snapshot. Used directly by photo_pdf_service so the
    PDF and its Public Link are always built from identical inputs.

    Returns {export_id, token, content_hash}.
    """
    if not supabase_client.client:
        raise PhotosExportError("Database not configured.")

    content_hash = compute_content_hash(
        project_id, capture_method, drawing_id, date_mode, dates, items
    )

    existing = _find_existing_by_hash(content_hash)
    if existing:
        return {
            "export_id": existing["export_id"],
            "token": existing["token"],
            "content_hash": content_hash,
        }

    token = secrets.token_urlsafe(16)
    # Date filter is encoded in content_hash (and reflected in the filtered
    # included_items snapshot). No date_mode / selected_dates columns are
    # required on photos_link_export — those live on photos_pdf_export for
    # audit of the old single-day selected_date field they replace.
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
        inserted = (resp.data or [None])[0] or row
        return {
            "export_id": inserted.get("export_id"),
            "token": inserted.get("token", token),
            "content_hash": content_hash,
        }
    except Exception:
        # Unique content_hash race — another request just inserted this
        # exact snapshot. Reuse it instead of failing.
        existing = _find_existing_by_hash(content_hash)
        if not existing:
            raise
        return {
            "export_id": existing["export_id"],
            "token": existing["token"],
            "content_hash": content_hash,
        }


def get_or_create_photos_link(
    project_id: str,
    capture_method: str,
    requested_drawing_id: Optional[str],
    date_mode_input: Optional[str],
    dates_input: Optional[List[Any]],
    user_id: str,
    request_url_root: str,
) -> Dict[str, Any]:
    """Generate (or reuse) a Public Link for this project + capture method +
    date filter.

    Returns {export_id, token, url, date_mode, selected_dates}.
    """
    if not supabase_client.client:
        raise PhotosExportError("Database not configured.")
    if capture_method not in ALLOWED_CAPTURE_METHODS:
        raise PhotosExportError("capture_method must be drone or 360_camera.")

    date_mode, dates = validate_date_filter(date_mode_input, dates_input)

    drawing_id = resolve_frozen_drawing_id(
        project_id, capture_method, requested_drawing_id
    )
    items = collect_active_items(project_id, capture_method, drawing_id, date_mode, dates)
    if not items:
        raise PhotosExportError("No photos available to share yet.")

    result = get_or_create_photos_link_row(
        project_id, capture_method, drawing_id, date_mode, dates, items, user_id
    )

    public_origin = get_public_app_origin(request_url_root)
    return {
        "export_id": result["export_id"],
        "token": result["token"],
        "url": f"{public_origin}/public/photos-link/{result['token']}",
        "date_mode": date_mode,
        "selected_dates": dates,
    }
