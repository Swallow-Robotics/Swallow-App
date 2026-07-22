"""
Public, unauthenticated read access to a single active photo by opaque
token. Backs the token-gated public photo viewer page and the hyperlinks
embedded in Photos PDF exports. Never exposes other photos or project data.
"""

from flask import Blueprint, jsonify

from app.services.public_photo_service import get_active_photo_by_token
from app.services.storage.r2_client import r2_client
from app.services.storage.supabase_client import supabase_client

bp = Blueprint("public_photos_v1", __name__)


def _not_found():
    return jsonify({"error": "not_found", "message": "Photo not found"}), 404


@bp.route("/api/v1/public/photos/<token>", methods=["GET"])
def get_public_photo(token: str):
    """Return sanitized metadata plus a fresh short-lived signed R2 URL."""
    photo = get_active_photo_by_token(token)
    if not photo:
        return _not_found()

    r2_path = photo.get("r2_path")
    signed_url = (
        r2_client.generate_presigned_url(r2_path, expires_in=900) if r2_path else None
    )
    if not signed_url:
        return _not_found()

    project_name = None
    project_id = photo.get("project_id")
    if project_id:
        try:
            project_name = (supabase_client.get_project(project_id) or {}).get(
                "project_name"
            )
        except Exception:
            project_name = None

    return jsonify(
        {
            "photo": {
                "waypoint_name": photo.get("waypoint_name"),
                "taken_at": photo.get("taken_at"),
                "capture_method": photo.get("capture_method"),
                "waypoint_action": photo.get("waypoint_action"),
                "project_name": project_name,
                "r2_url": signed_url,
            }
        }
    )
