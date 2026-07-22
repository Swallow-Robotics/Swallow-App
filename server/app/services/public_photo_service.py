"""
Public (token-gated, unauthenticated) access to a single active photo.

Photos are keyed by photo_id (see app/api_routes/v1/photos.py). This module
never exposes a project's full photo list — only the single record matching
an opaque public_token, and only while active_photo is true.
"""

import secrets
from typing import Any, Dict, Optional

from app.services.storage.supabase_client import supabase_client

PHOTOS_TABLE = "photos"
WAYPOINTS_TABLE = "waypoints"
DRAWINGS_TABLE = "drawings"
FLIGHTS_TABLE = "flights"


def ensure_public_token(photo_id: str) -> Optional[str]:
    """Return the photo's public_token, generating and persisting one if missing."""
    if not supabase_client.client or not photo_id:
        return None

    resp = (
        supabase_client.client.table(PHOTOS_TABLE)
        .select("public_token")
        .eq("photo_id", photo_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    existing = rows[0].get("public_token") if rows else None
    if existing:
        return existing

    token = secrets.token_urlsafe(16)
    supabase_client.client.table(PHOTOS_TABLE).update({"public_token": token}).eq(
        "photo_id", photo_id
    ).execute()
    return token


def _resolve_waypoint_and_project(waypoint_id: Optional[str]) -> Dict[str, Any]:
    """Look up waypoint_name and project_id via drawings (floor plan path)."""
    if not waypoint_id:
        return {"waypoint_name": None, "project_id": None}

    wp_resp = (
        supabase_client.client.table(WAYPOINTS_TABLE)
        .select("waypoint_name, drawing_id")
        .eq("waypoint_id", waypoint_id)
        .limit(1)
        .execute()
    )
    wp_rows = wp_resp.data or []
    if not wp_rows:
        return {"waypoint_name": None, "project_id": None}

    waypoint_name = wp_rows[0].get("waypoint_name")
    drawing_id = wp_rows[0].get("drawing_id")
    project_id = None
    if drawing_id:
        drw_resp = (
            supabase_client.client.table(DRAWINGS_TABLE)
            .select("project_id")
            .eq("drawing_id", drawing_id)
            .limit(1)
            .execute()
        )
        drw_rows = drw_resp.data or []
        if drw_rows:
            project_id = drw_rows[0].get("project_id")

    return {"waypoint_name": waypoint_name, "project_id": project_id}


def _resolve_project_via_flight(flight_id: Optional[str]) -> Optional[str]:
    """Look up project_id via flights (site plan / drone path)."""
    if not flight_id:
        return None
    resp = (
        supabase_client.client.table(FLIGHTS_TABLE)
        .select("project_id")
        .eq("flight_id", flight_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0].get("project_id") if rows else None


def get_active_photo_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Return a public-safe photo record for the given token, or None."""
    if not supabase_client.client or not token:
        return None

    resp = (
        supabase_client.client.table(PHOTOS_TABLE)
        .select("*")
        .eq("public_token", token)
        .eq("active_photo", True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None

    photo = rows[0]
    meta = _resolve_waypoint_and_project(photo.get("waypoint_id"))
    photo["waypoint_name"] = meta["waypoint_name"]
    photo["project_id"] = meta["project_id"] or _resolve_project_via_flight(
        photo.get("flight_id")
    )
    return photo
