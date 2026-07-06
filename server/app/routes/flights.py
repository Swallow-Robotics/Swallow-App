"""
Flights routes for flight simulation management.
"""

import logging
from uuid import uuid4

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role, ROLE_ORDER
from app.services.storage.supabase_client import supabase_client

flights_bp = Blueprint("flights", __name__, url_prefix="/api/v1/flights")
VIEW_ROLES = set(ROLE_ORDER)
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


@flights_bp.route("", methods=["GET"])
@jwt_required
def list_flights():
    """List all flights for a project, enriched with drone/base station/pilot/plan names."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    project_id = (request.args.get("project_id") or "").strip()
    if not project_id:
        return jsonify({"error": "project_id is required"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    try:
        resp = (
            supabase_client.client.table("flights")
            .select("*")
            .eq("project_id", project_id)
            .order("takeoff_time", desc=True)
            .execute()
        )
        flights = resp.data or []

        # Collect related IDs for batch lookups
        drone_ids = list({f["drone_id"] for f in flights if f.get("drone_id")})
        bs_ids = list({f["bs_id"] for f in flights if f.get("bs_id")})
        pilot_ids = list({f["pilot_id"] for f in flights if f.get("pilot_id")})
        plan_ids = list({f["plan_id"] for f in flights if f.get("plan_id")})

        drones_map = {}
        if drone_ids:
            d_resp = (
                supabase_client.client.table("drones")
                .select("drone_id, drone_identifier")
                .in_("drone_id", drone_ids)
                .execute()
            )
            drones_map = {d["drone_id"]: d["drone_identifier"] for d in d_resp.data or []}

        base_stations_map = {}
        if bs_ids:
            bs_resp = (
                supabase_client.client.table("base_stations")
                .select("bs_id, bs_serial_number, bs_name")
                .in_("bs_id", bs_ids)
                .execute()
            )
            base_stations_map = {
                d["bs_id"]: d.get("bs_name") or d.get("bs_serial_number") or ""
                for d in bs_resp.data or []
            }

        pilots_map = {}
        if pilot_ids:
            p_resp = (
                supabase_client.client.table("pilots")
                .select("pilot_id, pilot_name")
                .in_("pilot_id", pilot_ids)
                .execute()
            )
            pilots_map = {p["pilot_id"]: p["pilot_name"] for p in p_resp.data or []}

        plans_map = {}
        if plan_ids:
            pl_resp = (
                supabase_client.client.table("plans")
                .select("plan_id, plan_name")
                .in_("plan_id", plan_ids)
                .execute()
            )
            plans_map = {p["plan_id"]: p["plan_name"] for p in pl_resp.data or []}

        for flight in flights:
            flight["drone_identifier"] = drones_map.get(flight.get("drone_id"), "")
            flight["base_station_label"] = base_stations_map.get(flight.get("bs_id"), "")
            flight["pilot_name"] = pilots_map.get(flight.get("pilot_id"), "")
            flight["plan_name"] = plans_map.get(flight.get("plan_id"), "")

        return jsonify({"flights": flights})
    except Exception as exc:
        logger.error("list_flights error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@flights_bp.route("", methods=["POST"])
@jwt_required
def create_flight():
    """Create a new flight simulation entry."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    payload = request.get_json() or {}
    project_id = (payload.get("project_id") or "").strip()
    if not project_id:
        return jsonify({"error": "project_id is required"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    flight_status = (payload.get("flight_status") or "").strip() or None
    flight_status_desc = None
    if flight_status == "failed":
        flight_status_desc = (payload.get("flight_status_desc") or "").strip() or None

    try:
        new_row = {
            "flight_id": str(uuid4()),
            "project_id": project_id,
            "drone_id": payload.get("drone_id") or None,
            "bs_id": payload.get("bs_id") or None,
            "pilot_id": payload.get("pilot_id") or None,
            "plan_id": payload.get("plan_id") or None,
            "airspace_authorization": (payload.get("airspace_authorization") or "").strip() or None,
            "visual_observer": (payload.get("visual_observer") or "").strip() or None,
            "wind_speed": float(payload["wind_speed"]) if payload.get("wind_speed") not in (None, "") else None,
            "wind_direction": float(payload["wind_direction"]) if payload.get("wind_direction") not in (None, "") else None,
            "visibility": float(payload["visibility"]) if payload.get("visibility") not in (None, "") else None,
            "temperature": float(payload["temperature"]) if payload.get("temperature") not in (None, "") else None,
            "takeoff_time": payload.get("takeoff_time") or None,
            "landing_time": payload.get("landing_time") or None,
            "vo_confirmed_vlos": payload.get("vo_confirmed_vlos"),
            "flight_status": flight_status,
            "flight_status_desc": flight_status_desc,
        }

        resp = supabase_client.client.table("flights").insert(new_row).execute()
        if not resp.data:
            return jsonify({"error": "Failed to create flight entry"}), 500
        return jsonify(resp.data[0]), 201
    except Exception as exc:
        logger.error("create_flight error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@flights_bp.route("/options", methods=["GET"])
@jwt_required
def flight_options():
    """Return drones, base stations, pilots, and plans available for a project."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    project_id = (request.args.get("project_id") or "").strip()
    if not project_id:
        return jsonify({"error": "project_id is required"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    try:
        drones_resp = (
            supabase_client.client.table("drones")
            .select("drone_id, drone_identifier")
            .eq("project_id", project_id)
            .eq("active_drone", True)
            .execute()
        )
        base_stations_resp = (
            supabase_client.client.table("base_stations")
            .select("bs_id, bs_serial_number, bs_name")
            .eq("project_id", project_id)
            .eq("active_bs", True)
            .execute()
        )
        pilots_resp = (
            supabase_client.client.table("pilots")
            .select("pilot_id, pilot_name")
            .execute()
        )
        plans_resp = (
            supabase_client.client.table("plans")
            .select("plan_id, plan_name")
            .eq("project_id", project_id)
            .eq("active_plan", True)
            .execute()
        )

        return jsonify({
            "drones": drones_resp.data or [],
            "base_stations": base_stations_resp.data or [],
            "pilots": pilots_resp.data or [],
            "plans": plans_resp.data or [],
        })
    except Exception as exc:
        logger.error("flight_options error: %s", exc)
        return jsonify({"error": str(exc)}), 500
