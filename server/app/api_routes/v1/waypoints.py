"""
Floor plan waypoint CRUD endpoints.

Floor waypoints are stored in the waypoints table with:
  - plan_id = NULL  (no mission-plan involvement)
  - drawing_id = <the canvas drawing they belong to>
  - pixel_x / pixel_y = native image pixel coordinates

Photos for floor waypoints are linked by waypoint_id with capture_method='360_camera'
and flight_id=NULL.  The full data path is:

    drawings → waypoints → photos

No interaction with the flights, plans, drones, docks, or pilots tables.
"""

import logging
from uuid import UUID, uuid4

from flask import Blueprint, g, jsonify, request

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import ROLE_ORDER, require_role
from app.services.storage.r2_client import r2_client
from app.services.storage.supabase_client import supabase_client

bp = Blueprint("waypoints_v1", __name__)
VIEW_ROLES = set(ROLE_ORDER)
MANAGE_ROLES = {"Owner", "Administrator", "Editor"}
logger = logging.getLogger(__name__)


def _require_auth():
    user = getattr(g, "current_user", None)
    if isinstance(user, dict):
        uid = user.get("id") or user.get("user_id") or user.get("sub")
    elif hasattr(user, "id"):
        uid = getattr(user, "id")
    else:
        uid = None
    if not uid:
        raise PermissionError("Authenticated user not found")
    return uid


def _normalize_uuid(value):
    if not value:
        return None
    try:
        return str(UUID(str(value).strip()))
    except ValueError:
        return None


def _project_id_for_drawing(drawing_id: str):
    """Resolve project_id directly from the drawings table."""
    resp = (
        supabase_client.client.table("drawings")
        .select("project_id")
        .eq("drawing_id", drawing_id)
        .limit(1)
        .execute()
    )
    return resp.data[0]["project_id"] if resp.data else None


@bp.route("", methods=["GET"])
@jwt_required
def list_floor_waypoints():
    """List floor plan waypoints for a project or specific drawing.

    Waypoints are fetched directly from drawings, with no plan or flight lookup.
    Each waypoint includes its associated active 360-camera photos.

    Query params:
      project_id  — required
      drawing_id  — optional; filters to a single drawing
    """
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    project_id = _normalize_uuid(request.args.get("project_id"))
    if not project_id:
        return jsonify({"error": "project_id is required"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status = permission
        return jsonify(payload), status

    drawing_id = _normalize_uuid(request.args.get("drawing_id"))

    if not supabase_client.client:
        return jsonify({"error": "Database not configured"}), 500

    try:
        if drawing_id:
            # Fetch waypoints for one drawing
            wp_resp = (
                supabase_client.client.table("waypoints")
                .select("*")
                .eq("drawing_id", drawing_id)
                .execute()
            )
        else:
            # Fetch all floor waypoints for this project via drawings
            drw_resp = (
                supabase_client.client.table("drawings")
                .select("drawing_id")
                .eq("project_id", project_id)
                .eq("drawing_type", "floor_plan")
                .execute()
            )
            drawing_ids = [d["drawing_id"] for d in (drw_resp.data or [])]
            if not drawing_ids:
                return jsonify({"waypoints": []})
            wp_resp = (
                supabase_client.client.table("waypoints")
                .select("*")
                .in_("drawing_id", drawing_ids)
                .execute()
            )

        waypoints = wp_resp.data or []
        waypoint_ids = [w["waypoint_id"] for w in waypoints]
        photos_by_waypoint: dict = {w["waypoint_id"]: [] for w in waypoints}

        if waypoint_ids:
            # Photos are linked directly by waypoint_id — no flight lookup needed
            photo_resp = (
                supabase_client.client.table("photos")
                .select("*")
                .in_("waypoint_id", waypoint_ids)
                .eq("active_photo", True)
                .eq("capture_method", "360_camera")
                .order("taken_at", desc=True)
                .execute()
            )
            for photo in photo_resp.data or []:
                wid = photo.get("waypoint_id")
                if wid in photos_by_waypoint:
                    photos_by_waypoint[wid].append(photo)

        result = [
            {
                "waypoint_id": wp.get("waypoint_id"),
                "waypoint_name": wp.get("waypoint_name"),
                "drawing_id": wp.get("drawing_id"),
                "pixel_x": wp.get("pixel_x"),
                "pixel_y": wp.get("pixel_y"),
                "sequence": wp.get("sequence"),
                "photos": photos_by_waypoint.get(wp["waypoint_id"], []),
            }
            for wp in waypoints
        ]

        return jsonify({"waypoints": result})
    except Exception as exc:
        logger.exception("list_floor_waypoints error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@bp.route("", methods=["POST"])
@jwt_required
def create_floor_waypoint():
    """Create a floor plan waypoint positioned by pixel coordinates on a drawing.

    The waypoint is stored with plan_id=NULL; spatial context is the drawing canvas only.
    """
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    if not supabase_client.client:
        return jsonify({"error": "Database not configured"}), 500

    body = request.get_json(silent=True) or {}
    project_id = _normalize_uuid(body.get("project_id"))
    drawing_id = _normalize_uuid(body.get("drawing_id"))
    waypoint_name = (body.get("waypoint_name") or "").strip() or None

    try:
        pixel_x = float(body["pixel_x"])
        pixel_y = float(body["pixel_y"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "pixel_x and pixel_y are required numbers"}), 400

    if not project_id:
        return jsonify({"error": "project_id is required"}), 400
    if not drawing_id:
        return jsonify({"error": "drawing_id is required"}), 400

    permission = require_role(project_id, MANAGE_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status = permission
        return jsonify(payload), status

    try:
        waypoint_id = str(uuid4())
        row = {
            "waypoint_id": waypoint_id,
            "plan_id": None,
            "sequence": None,
            "waypoint_name": waypoint_name,
            "action": None,
            "alt": None,
            "lat": None,
            "lng": None,
            "drawing_id": drawing_id,
            "pixel_x": pixel_x,
            "pixel_y": pixel_y,
            "created_by": user_id,
            "last_modified": None,
        }
        resp = supabase_client.client.table("waypoints").insert(row).execute()
        if not resp.data:
            return jsonify({"error": "Failed to create waypoint"}), 500

        created = resp.data[0]
        return (
            jsonify(
                {
                    "waypoint": {
                        "waypoint_id": created.get("waypoint_id"),
                        "waypoint_name": created.get("waypoint_name"),
                        "drawing_id": created.get("drawing_id"),
                        "pixel_x": created.get("pixel_x"),
                        "pixel_y": created.get("pixel_y"),
                        "sequence": created.get("sequence"),
                        "photos": [],
                    }
                }
            ),
            201,
        )
    except Exception as exc:
        logger.exception("create_floor_waypoint error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@bp.route("/<waypoint_id>", methods=["DELETE"])
@jwt_required
def delete_floor_waypoint(waypoint_id):
    """Soft-delete all photos for a floor waypoint, then delete the waypoint itself."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    if not supabase_client.client:
        return jsonify({"error": "Database not configured"}), 500

    try:
        wp_resp = (
            supabase_client.client.table("waypoints")
            .select("waypoint_id, drawing_id")
            .eq("waypoint_id", waypoint_id)
            .limit(1)
            .execute()
        )
        if not wp_resp.data:
            return jsonify({"error": "Waypoint not found"}), 404

        wp = wp_resp.data[0]
        if not wp.get("drawing_id"):
            return jsonify({"error": "Not a floor plan waypoint"}), 400

        # Resolve project_id from drawing for permission check
        project_id = _project_id_for_drawing(wp["drawing_id"])
        if not project_id:
            return jsonify({"error": "Associated drawing not found"}), 404

        permission = require_role(project_id, MANAGE_ROLES, user_id=user_id)
        if isinstance(permission, tuple):
            payload, status = permission
            return jsonify(payload), status

        # Soft-delete photos linked to this waypoint (no R2 removal)
        supabase_client.client.table("photos").update(
            {"active_photo": False}
        ).eq("waypoint_id", waypoint_id).execute()

        # Delete the waypoint record
        supabase_client.client.table("waypoints").delete().eq(
            "waypoint_id", waypoint_id
        ).execute()

        return jsonify({"status": "deleted"})
    except Exception as exc:
        logger.exception("delete_floor_waypoint error: %s", exc)
        return jsonify({"error": str(exc)}), 500
