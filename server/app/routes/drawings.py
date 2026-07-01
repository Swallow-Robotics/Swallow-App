"""
Drawing CRUD and alignment routes for the View → Drawings page.
"""

import json
import logging
import os
from uuid import UUID

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role, ROLE_ORDER
from app.services.storage.r2_client import r2_client
from app.services.plan_rasterizer import rasterize_to_png, RasterizeError
from app.services import drawing_service
from app.utils.affine_transform import AffineTransformError

drawings_bp = Blueprint("drawings", __name__, url_prefix="/api/v1/drawings")
VIEW_ROLES = set(ROLE_ORDER)
MANAGE_ROLES = {"Owner", "Administrator"}
ALLOWED_EXTENSIONS = {"pdf", "png", "jpeg", "jpg"}
MAX_DRAWING_BYTES = 50 * 1024 * 1024
PNG_MIME = "image/png"
logger = logging.getLogger(__name__)


def _require_auth():
    user = getattr(g, "current_user", None)
    user_id = None
    if isinstance(user, dict):
        user_id = user.get("id") or user.get("user_id") or user.get("sub")
    elif hasattr(user, "id"):
        user_id = getattr(user, "id")
    if not user_id:
        raise PermissionError("Authenticated user not found")
    return user_id


def _validate_project_id(project_id):
    UUID(project_id)


def _drawing_error(message, code="invalid_request", status=400):
    return jsonify({"error": code, "message": message}), status


def _ext_from_filename(filename, mime_type):
    _, ext = os.path.splitext(filename or "")
    cleaned = ext.lstrip(".").lower()
    if not cleaned and mime_type:
        part = (mime_type.split("/")[-1] if "/" in mime_type else mime_type).lower()
        if part in ALLOWED_EXTENSIONS:
            cleaned = part
    cleaned = "".join(c for c in cleaned if c.isalnum())
    if cleaned == "jpg":
        cleaned = "jpeg"
    return cleaned if cleaned in ("pdf", "png", "jpeg") else None


def _read_file_bytes(file_storage):
    stream = getattr(file_storage, "stream", None)
    if stream and hasattr(stream, "seek"):
        stream.seek(0)
        data = stream.read()
    else:
        data = file_storage.read()
    if not data:
        raise ValueError("File is empty")
    return data


def _serialize_drawing(record, include_control_points=False):
    if not record:
        return None
    r2_path = record.get("r2_path")
    signed_url = (
        r2_client.generate_presigned_url(r2_path, expires_in=600)
        if r2_path and r2_client.client
        else record.get("r2_url")
    )
    out = {
        "drawing_id": record.get("drawing_id"),
        "project_id": record.get("project_id"),
        "uploaded_by": record.get("uploaded_by"),
        "uploaded_at": record.get("uploaded_at"),
        "drawing_name": record.get("drawing_name"),
        "drawing_type": record.get("drawing_type") or "site_plan",
        "file_type": record.get("file_type"),
        "file_size": record.get("file_size"),
        "r2_path": r2_path,
        "r2_url": signed_url,
        "height": record.get("height"),
        "width": record.get("width"),
        "order": record.get("order"),
        "transform_a": record.get("transform_a"),
        "transform_b": record.get("transform_b"),
        "transform_c": record.get("transform_c"),
        "transform_d": record.get("transform_d"),
        "transform_e": record.get("transform_e"),
        "transform_f": record.get("transform_f"),
        "aligned": record.get("aligned", False),
        "aligned_at": record.get("aligned_at"),
    }
    if include_control_points:
        if record.get("control_points") is not None:
            out["control_points"] = record.get("control_points")
        else:
            out["control_points"] = drawing_service.get_control_points(
                record.get("drawing_id")
            )
    return out


@drawings_bp.route("", methods=["GET"])
@jwt_required
def list_drawings():
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    project_id = (request.args.get("project_id") or "").strip()
    if not project_id:
        return _drawing_error("project_id is required")

    try:
        _validate_project_id(project_id)
    except ValueError:
        return _drawing_error("Invalid project_id")

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    drawing_type = (request.args.get("drawing_type") or "").strip() or None
    drawings = drawing_service.list_drawings_by_project(
        project_id, drawing_type=drawing_type
    )
    return jsonify(
        {"drawings": [_serialize_drawing(d) for d in drawings]}
    ), 200


@drawings_bp.route("/<drawing_id>", methods=["GET"])
@jwt_required
def get_drawing(drawing_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        drawing = drawing_service.get_drawing_with_control_points(drawing_id)
    except Exception as exc:
        logger.exception("get_drawing failed for %s: %s", drawing_id, exc)
        return _drawing_error("Unable to load drawing.", "database_error", 500)

    if not drawing:
        return _drawing_error("Drawing not found", "not_found", 404)

    project_id = drawing.get("project_id")
    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    return jsonify({"drawing": _serialize_drawing(drawing)}), 200


@drawings_bp.route("", methods=["PUT"])
@jwt_required
def save_drawings():
    """Batch save drawings for a project (create, update, delete)."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    project_id = (request.form.get("project_id") or "").strip()
    payload_raw = request.form.get("payload") or "[]"

    try:
        _validate_project_id(project_id)
    except ValueError:
        return _drawing_error("Invalid project_id")

    permission = require_role(project_id, MANAGE_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    try:
        entries = json.loads(payload_raw)
    except (TypeError, ValueError):
        return _drawing_error("Invalid payload JSON")

    if not isinstance(entries, list):
        return _drawing_error("Payload must be an array")

    if len(entries) > drawing_service.MAX_DRAWINGS_PER_PROJECT:
        return _drawing_error(
            f"Maximum {drawing_service.MAX_DRAWINGS_PER_PROJECT} drawings allowed."
        )

    for entry in entries:
        name = (entry.get("drawing_name") or "").strip()
        order = entry.get("order")
        dtype = (entry.get("drawing_type") or "").strip() or None
        if not name:
            return _drawing_error("Each drawing requires a name.")
        if order is None or not isinstance(order, int) or order < 1:
            return _drawing_error("Each drawing requires a valid order.")
        if dtype and dtype not in ("site_plan", "floor_plan"):
            return _drawing_error("drawing_type must be site_plan or floor_plan.")

    # Scope all operations to the drawing_type represented in this batch so
    # that drawings belonging to the other type are never touched.
    batch_drawing_type = next(
        (
            (e.get("drawing_type") or "").strip() or None
            for e in entries
            if (e.get("drawing_type") or "").strip()
        ),
        None,
    )
    existing = drawing_service.list_drawings_by_project(
        project_id, drawing_type=batch_drawing_type
    )
    existing_ids = {d["drawing_id"] for d in existing}
    submitted_ids = {
        e["drawing_id"] for e in entries if e.get("drawing_id")
    }

    for drawing_id in existing_ids - submitted_ids:
        drawing_service.delete_drawing(drawing_id)

    saved = []
    for entry in entries:
        drawing_id = entry.get("drawing_id")
        name = entry.get("drawing_name", "").strip()
        order = entry.get("order")
        file_key = entry.get("file_key")
        drawing_type = (entry.get("drawing_type") or "").strip() or None

        if drawing_id and drawing_id in existing_ids:
            record = drawing_service.update_drawing_metadata(
                drawing_id, name, order
            )
            if record:
                saved.append(record)
            continue

        if not file_key:
            return _drawing_error("New drawings require a file.")

        file_item = request.files.get(file_key)
        if not file_item or not getattr(file_item, "filename", None):
            return _drawing_error(f"Missing file for key {file_key}")

        mime = (getattr(file_item, "mimetype", "") or "").lower()
        ext = _ext_from_filename(file_item.filename, mime)
        if not ext:
            return _drawing_error("Files must be PDF, PNG, or JPEG.")

        if not r2_client.client:
            return _drawing_error("Storage is not configured.", "storage_not_configured", 500)

        try:
            file_bytes = _read_file_bytes(file_item)
        except ValueError as exc:
            return _drawing_error(str(exc))

        if len(file_bytes) > MAX_DRAWING_BYTES:
            return _drawing_error("File too large (max 50MB).", status=413)

        try:
            png_bytes, image_width, image_height = rasterize_to_png(
                file_bytes,
                filename_hint=file_item.filename or "",
                mime_hint=mime,
            )
        except RasterizeError as exc:
            return _drawing_error(exc.message, "rasterization_failed")

        from uuid import uuid4

        new_id = str(uuid4())
        r2_key = drawing_service.DRAWING_R2_KEY_TEMPLATE.format(
            project_id=project_id, drawing_id=new_id, ext="png"
        )

        try:
            ok = r2_client.upload_bytes(png_bytes, r2_key, content_type=PNG_MIME)
        except Exception:
            return _drawing_error("Failed to upload drawing.", "upload_failed", 500)

        if not ok:
            return _drawing_error("Failed to upload drawing.", "upload_failed", 502)

        r2_url = r2_client.generate_presigned_url(r2_key, expires_in=3600)
        record = drawing_service.create_drawing_record(
            project_id=project_id,
            user_id=user_id,
            drawing_name=name,
            order=order,
            file_type=ext,
            file_size=len(file_bytes),
            r2_path=r2_key,
            r2_url=r2_url,
            width=image_width,
            height=image_height,
            drawing_id=new_id,
            drawing_type=drawing_type,
        )
        if not record:
            r2_client.delete_file(r2_key)
            return _drawing_error("Failed to save drawing metadata.", "database_error", 500)

        saved.append(record)

    refreshed = drawing_service.list_drawings_by_project(
        project_id, drawing_type=batch_drawing_type
    )
    return jsonify(
        {"drawings": [_serialize_drawing(d) for d in refreshed]}
    ), 200


@drawings_bp.route("/<drawing_id>/alignment", methods=["POST"])
@jwt_required
def save_drawing_alignment(drawing_id):
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    drawing = drawing_service.get_drawing_by_id(drawing_id)
    if not drawing:
        return _drawing_error("Drawing not found", "not_found", 404)

    project_id = drawing.get("project_id")
    permission = require_role(project_id, MANAGE_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    payload = request.get_json(silent=True) or {}
    mode = (payload.get("mode") or "coordinates").strip().lower()
    control_points = payload.get("control_points") or []

    if not isinstance(control_points, list):
        return _drawing_error("control_points must be an array")

    min_points = 4 if mode == "map" else 3
    if len(control_points) < min_points:
        return _drawing_error(
            f"At least {min_points} control points are required."
        )

    normalized = []
    for i, pt in enumerate(control_points):
        try:
            normalized.append(
                {
                    "pixel_x": float(pt["pixel_x"]),
                    "pixel_y": float(pt["pixel_y"]),
                    "latitude": float(pt["latitude"]),
                    "longitude": float(pt["longitude"]),
                    "point_order": pt.get("point_order") or (i + 1),
                }
            )
        except (KeyError, TypeError, ValueError):
            return _drawing_error("Invalid control point data.")

    image_width = payload.get("width")
    image_height = payload.get("height")
    try:
        width = int(image_width) if image_width else None
        height = int(image_height) if image_height else None
    except (TypeError, ValueError):
        width = None
        height = None

    try:
        record = drawing_service.save_alignment(
            drawing_id,
            normalized,
            min_points=min_points,
            width=width,
            height=height,
        )
    except AffineTransformError as exc:
        return _drawing_error(str(exc), "invalid_geometry")

    if not record:
        return _drawing_error("Failed to save alignment.", "database_error", 500)

    try:
        full_record = drawing_service.get_drawing_with_control_points(drawing_id)
    except Exception as exc:
        logger.exception("Failed to reload drawing after alignment: %s", exc)
        full_record = record

    return jsonify(
        {"drawing": _serialize_drawing(full_record or record, include_control_points=True)}
    ), 200
