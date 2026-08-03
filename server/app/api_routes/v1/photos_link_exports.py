"""
Generates or reuses a Photos page Public Link — a snapshot of the active
photos for a project and capture method matching a date filter (all dates,
one date, or a custom set of dates) at a durable, unauthenticated URL.
Additive to the Photos page; does not modify any existing photo, drawing, or
waypoint endpoint.
"""

from flask import Blueprint, g, jsonify, request

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import ROLE_ORDER, require_role
from app.services.photos_link_export_service import (
    PhotosLinkExportError,
    get_or_create_photos_link,
)

bp = Blueprint("photos_link_exports_v1", __name__)
VIEW_ROLES = set(ROLE_ORDER)
ALLOWED_CAPTURE_METHODS = {"drone", "360_camera"}


def _current_user_id():
    user = getattr(g, "current_user", None) or {}
    return user.get("id")


@bp.route("/api/v1/photos-link-exports", methods=["POST"])
@jwt_required
def create_photos_link_export():
    """Generate (or reuse) a Public Link and return its durable URL. Any
    project viewer who can use PDF export today may create Public Links."""
    user_id = _current_user_id()
    if not user_id:
        return (
            jsonify({"error": "forbidden", "message": "Authentication required"}),
            401,
        )

    body = request.get_json(silent=True) or {}
    project_id = (body.get("project_id") or "").strip()
    capture_method = (body.get("capture_method") or "").strip()
    drawing_id = (body.get("drawing_id") or "").strip() or None
    date_mode = body.get("date_mode")
    dates = body.get("dates")

    if not project_id or not capture_method:
        return jsonify({"error": "project_id and capture_method are required"}), 400
    if capture_method not in ALLOWED_CAPTURE_METHODS:
        return jsonify({"error": "capture_method must be drone or 360_camera"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status = permission
        return jsonify(payload), status

    try:
        result = get_or_create_photos_link(
            project_id=project_id,
            capture_method=capture_method,
            requested_drawing_id=drawing_id,
            date_mode_input=date_mode,
            dates_input=dates,
            user_id=user_id,
            request_url_root=request.url_root,
        )
    except PhotosLinkExportError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # pragma: no cover - unexpected failures
        return jsonify({"error": f"Failed to create Public Link: {exc}"}), 500

    return (
        jsonify(
            {
                "token": result["token"],
                "url": result["url"],
                "date_mode": result["date_mode"],
                "selected_dates": result["selected_dates"],
            }
        ),
        201,
    )
