"""
Generates a PDF of a Photos page drawing with waypoint markers deep-linked
into the matching Public Link viewer, for active photos matching a date
filter (all dates, one date, or a custom set of dates). Additive to the
Photos page; does not modify any existing photo, drawing, or waypoint
endpoint.
"""

import io

from flask import Blueprint, g, jsonify, request, send_file

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import ROLE_ORDER, require_role
from app.services.photo_pdf_service import PhotoPdfExportError, build_photo_pdf_export

bp = Blueprint("photo_pdf_exports_v1", __name__)
VIEW_ROLES = set(ROLE_ORDER)
ALLOWED_CAPTURE_METHODS = {"drone", "360_camera"}


def _current_user_id():
    user = getattr(g, "current_user", None) or {}
    return user.get("id")


@bp.route("/api/v1/photo-pdf-exports", methods=["POST"])
@jwt_required
def create_photo_pdf_export():
    """Generate a Photos PDF export and return it as a downloadable attachment."""
    user_id = _current_user_id()
    if not user_id:
        return (
            jsonify({"error": "forbidden", "message": "Authentication required"}),
            401,
        )

    body = request.get_json(silent=True) or {}
    project_id = (body.get("project_id") or "").strip()
    drawing_id = (body.get("drawing_id") or "").strip() or None
    capture_method = (body.get("capture_method") or "").strip()
    date_mode = body.get("date_mode")
    dates = body.get("dates")

    if not project_id or not capture_method:
        return (
            jsonify({"error": "project_id and capture_method are required"}),
            400,
        )
    if capture_method not in ALLOWED_CAPTURE_METHODS:
        return jsonify({"error": "capture_method must be drone or 360_camera"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status = permission
        return jsonify(payload), status

    try:
        pdf_bytes, filename, _export_record = build_photo_pdf_export(
            project_id=project_id,
            drawing_id=drawing_id,
            capture_method=capture_method,
            date_mode_input=date_mode,
            dates_input=dates,
            user_id=user_id,
            request_url_root=request.url_root,
        )
    except PhotoPdfExportError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:  # pragma: no cover - unexpected failures
        return jsonify({"error": f"Failed to generate PDF: {exc}"}), 500

    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )
