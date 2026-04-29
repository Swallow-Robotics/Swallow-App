"""
Plan and waypoint CRUD routes for the Plan Test domain.

Plans use a versioning pattern:
  - plan_identifier is permanent across all versions of a plan.
  - plan_id is unique per version.
  - plan_version starts at 0 and increments on each edit.
  - active_plan=TRUE marks the current version; only active plans are shown.
"""

import logging
from datetime import datetime, timezone
from uuid import uuid4

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role, ROLE_ORDER
from app.services.storage.supabase_client import supabase_client

plans_bp = Blueprint("plans", __name__, url_prefix="/api/v1/plans")
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


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _coerce_float(value):
    """Return float or None for a waypoint coordinate/altitude field."""
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _build_waypoint_payload(wp, plan_id, user_id, is_new=True):
    """Build a dict for inserting or updating a waypoint row."""
    base = {
        "plan_id": plan_id,
        "sequence": wp.get("sequence"),
        "waypoint_name": (wp.get("waypoint_name") or "").strip() or None,
        "action": wp.get("action") or None,
        "alt": _coerce_float(wp.get("alt")),
        "lat": _coerce_float(wp.get("lat")),
        "lng": _coerce_float(wp.get("lng")),
    }
    if is_new:
        base["waypoint_id"] = str(uuid4())
        base["created_by"] = user_id
        base["last_modified"] = None
    else:
        base["last_modified"] = _now_iso()
    return base


def _fetch_waypoints_for_plans(plan_ids):
    """Return a dict mapping plan_id → sorted list of waypoints."""
    if not plan_ids:
        return {}
    resp = (
        supabase_client.client.table("waypoints")
        .select("*")
        .in_("plan_id", plan_ids)
        .order("sequence", desc=False)
        .execute()
    )
    result = {}
    for wp in resp.data or []:
        result.setdefault(wp["plan_id"], []).append(wp)
    return result


@plans_bp.route("", methods=["GET"])
@jwt_required
def list_plans():
    """List all active plans for a project, each with their waypoints."""
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
        plans_resp = (
            supabase_client.client.table("plans")
            .select("*")
            .eq("project_id", project_id)
            .eq("active_plan", True)
            .order("created_at", desc=False)
            .execute()
        )
        plans = plans_resp.data or []
        plan_ids = [p["plan_id"] for p in plans]
        waypoints_by_plan = _fetch_waypoints_for_plans(plan_ids)
        for plan in plans:
            plan["waypoints"] = waypoints_by_plan.get(plan["plan_id"], [])
        return jsonify({"plans": plans})
    except Exception as exc:
        logger.error("list_plans error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@plans_bp.route("", methods=["POST"])
@jwt_required
def create_plan():
    """Create a new plan at version 0 with optional waypoints."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    payload = request.get_json() or {}
    project_id = (payload.get("project_id") or "").strip()
    plan_name = (payload.get("plan_name") or "").strip()
    plan_description = payload.get("plan_description") or None
    waypoints_input = payload.get("waypoints") or []

    if not project_id:
        return jsonify({"error": "project_id is required"}), 400
    if not plan_name:
        return jsonify({"error": "plan_name is required"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    plan_id = str(uuid4())
    plan_identifier = str(uuid4())

    try:
        plan_resp = (
            supabase_client.client.table("plans")
            .insert(
                {
                    "plan_id": plan_id,
                    "plan_identifier": plan_identifier,
                    "plan_version": 0,
                    "project_id": project_id,
                    "plan_name": plan_name,
                    "plan_description": plan_description,
                    "created_by": user_id,
                    "active_plan": True,
                    "last_flight": None,
                }
            )
            .execute()
        )
        if not plan_resp.data:
            return jsonify({"error": "Failed to create plan"}), 500

        plan = plan_resp.data[0]
        created_waypoints = []
        try:
            for i, wp in enumerate(waypoints_input):
                wp["sequence"] = i + 1
                wp_data = _build_waypoint_payload(wp, plan_id, user_id, is_new=True)
                wp_resp = (
                    supabase_client.client.table("waypoints").insert(wp_data).execute()
                )
                if wp_resp.data:
                    created_waypoints.append(wp_resp.data[0])
        except Exception as wp_exc:
            logger.error("create_plan waypoint error: %s", wp_exc)
            supabase_client.client.table("plans").delete().eq("plan_id", plan_id).execute()
            return jsonify({"error": str(wp_exc)}), 500

        plan["waypoints"] = created_waypoints
        return jsonify(plan), 201
    except Exception as exc:
        logger.error("create_plan error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@plans_bp.route("/<plan_identifier>", methods=["PATCH"])
@jwt_required
def edit_plan(plan_identifier):
    """
    Edit a plan: deactivates the current active version and inserts a new
    version with an incremented plan_version. Existing waypoints are relinked
    to the new plan_id (preserving waypoint_id); new waypoints are inserted.
    """
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        existing_resp = (
            supabase_client.client.table("plans")
            .select("*")
            .eq("plan_identifier", plan_identifier)
            .eq("active_plan", True)
            .limit(1)
            .execute()
        )
        existing = (existing_resp.data or [None])[0]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    if not existing:
        return jsonify({"error": "Plan not found"}), 404

    project_id = existing["project_id"]
    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    payload = request.get_json() or {}
    plan_name = (payload.get("plan_name") or "").strip() or existing["plan_name"]
    plan_description = (
        payload["plan_description"]
        if "plan_description" in payload
        else existing.get("plan_description")
    )
    waypoints_input = payload.get("waypoints") or []
    new_version = (existing.get("plan_version") or 0) + 1
    new_plan_id = str(uuid4())

    try:
        # Deactivate all versions of this plan_identifier
        supabase_client.client.table("plans").update({"active_plan": False}).eq(
            "plan_identifier", plan_identifier
        ).execute()

        # Insert new version
        plan_resp = (
            supabase_client.client.table("plans")
            .insert(
                {
                    "plan_id": new_plan_id,
                    "plan_identifier": plan_identifier,
                    "plan_version": new_version,
                    "project_id": project_id,
                    "plan_name": plan_name,
                    "plan_description": plan_description,
                    "created_by": user_id,
                    "active_plan": True,
                    "last_flight": existing.get("last_flight"),
                }
            )
            .execute()
        )
        if not plan_resp.data:
            return jsonify({"error": "Failed to create new plan version"}), 500

        new_plan = plan_resp.data[0]
        created_waypoints = []

        for i, wp in enumerate(waypoints_input):
            wp["sequence"] = i + 1
            existing_wp_id = wp.get("waypoint_id")
            if existing_wp_id:
                # Relink existing waypoint to the new plan_id
                wp_data = _build_waypoint_payload(wp, new_plan_id, user_id, is_new=False)
                resp = (
                    supabase_client.client.table("waypoints")
                    .update(wp_data)
                    .eq("waypoint_id", existing_wp_id)
                    .execute()
                )
                if resp.data:
                    created_waypoints.append(resp.data[0])
            else:
                # Brand-new waypoint
                wp_data = _build_waypoint_payload(wp, new_plan_id, user_id, is_new=True)
                resp = (
                    supabase_client.client.table("waypoints").insert(wp_data).execute()
                )
                if resp.data:
                    created_waypoints.append(resp.data[0])

        new_plan["waypoints"] = created_waypoints
        return jsonify(new_plan)
    except Exception as exc:
        logger.error("edit_plan error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@plans_bp.route("/<plan_identifier>", methods=["DELETE"])
@jwt_required
def deactivate_plan(plan_identifier):
    """Deactivate a plan by setting active_plan=FALSE. Record is not deleted."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        existing_resp = (
            supabase_client.client.table("plans")
            .select("project_id, plan_id")
            .eq("plan_identifier", plan_identifier)
            .eq("active_plan", True)
            .limit(1)
            .execute()
        )
        existing = (existing_resp.data or [None])[0]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    if not existing:
        return jsonify({"error": "Plan not found"}), 404

    project_id = existing["project_id"]
    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    try:
        supabase_client.client.table("plans").update({"active_plan": False}).eq(
            "plan_identifier", plan_identifier
        ).execute()
        return jsonify({"status": "deactivated"})
    except Exception as exc:
        logger.error("deactivate_plan error: %s", exc)
        return jsonify({"error": str(exc)}), 500
