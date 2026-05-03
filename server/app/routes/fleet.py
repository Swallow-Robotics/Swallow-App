"""
Fleet routes for drone and dock hardware management.
"""

import logging
from uuid import uuid4

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role, ROLE_ORDER
from app.services.storage.supabase_client import supabase_client

fleet_bp = Blueprint("fleet", __name__, url_prefix="/api/v1/fleet")
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


def _get_project_org_id(project_id):
    resp = (
        supabase_client.client.table("projects")
        .select("org_id")
        .eq("project_id", project_id)
        .limit(1)
        .execute()
    )
    data = (resp.data or [None])[0]
    return data["org_id"] if data else None


def _parse_date(date_str):
    """Convert MM/DD/YYYY to YYYY-MM-DD; pass through YYYY-MM-DD unchanged."""
    if not date_str:
        return None
    s = date_str.strip()
    if "/" in s:
        parts = s.split("/")
        if len(parts) == 3:
            m, d, y = parts
            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    return s


def _enrich_with_project_org(records, project_key, org_key):
    """Attach project_name and org_name to each record dict."""
    project_ids = list({r[project_key] for r in records if r.get(project_key)})
    org_ids = list({r[org_key] for r in records if r.get(org_key)})

    projects_map = {}
    if project_ids:
        resp = (
            supabase_client.client.table("projects")
            .select("project_id, project_name")
            .in_("project_id", project_ids)
            .execute()
        )
        projects_map = {p["project_id"]: p["project_name"] for p in resp.data or []}

    orgs_map = {}
    if org_ids:
        resp = (
            supabase_client.client.table("organizations")
            .select("org_id, org_name")
            .in_("org_id", org_ids)
            .execute()
        )
        orgs_map = {o["org_id"]: o["org_name"] for o in resp.data or []}

    for rec in records:
        rec["project_name"] = projects_map.get(rec.get(project_key), "")
        rec["org_name"] = orgs_map.get(rec.get(org_key), "")

    return records


# ─────────────────────────────────────────────────────────────────────────────
# DRONES
# ─────────────────────────────────────────────────────────────────────────────


@fleet_bp.route("/drones/history", methods=["GET"])
@jwt_required
def drone_history():
    """Return full history for a drone_identifier across all projects."""
    try:
        _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    drone_identifier = (request.args.get("drone_identifier") or "").strip()
    if not drone_identifier:
        return jsonify({"error": "drone_identifier is required"}), 400

    try:
        resp = (
            supabase_client.client.table("drones")
            .select("*")
            .eq("drone_identifier", drone_identifier)
            .order("drone_last_inspected", desc=True)
            .execute()
        )
        records = _enrich_with_project_org(resp.data or [], "project_id", "org_id")
        return jsonify({"history": records})
    except Exception as exc:
        logger.error("drone_history error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@fleet_bp.route("/drones", methods=["GET"])
@jwt_required
def list_drones():
    """List active drones for a project."""
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
            supabase_client.client.table("drones")
            .select("*")
            .eq("project_id", project_id)
            .eq("active_drone", True)
            .execute()
        )
        return jsonify({"drones": resp.data or []})
    except Exception as exc:
        logger.error("list_drones error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@fleet_bp.route("/drones", methods=["POST"])
@jwt_required
def create_drone():
    """Create a drone entry in install or service mode."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    payload = request.get_json() or {}
    project_id = (payload.get("project_id") or "").strip()
    mode = (payload.get("mode") or "install").strip()

    if not project_id:
        return jsonify({"error": "project_id is required"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    org_id = _get_project_org_id(project_id)

    try:
        if mode == "service":
            drone_identifier = (payload.get("drone_identifier") or "").strip()
            if not drone_identifier:
                return jsonify({"error": "drone_identifier is required for service mode"}), 400

            existing_resp = (
                supabase_client.client.table("drones")
                .select("*")
                .eq("drone_identifier", drone_identifier)
                .eq("project_id", project_id)
                .eq("active_drone", True)
                .limit(1)
                .execute()
            )
            existing = (existing_resp.data or [None])[0]
            if not existing:
                return jsonify({"error": "No active drone found for this identifier"}), 404

            supabase_client.client.table("drones").update({"active_drone": False}).eq(
                "drone_id", existing["drone_id"]
            ).execute()

            new_row = {
                "drone_id": str(uuid4()),
                "drone_identifier": drone_identifier,
                "drone_model": existing.get("drone_model"),
                "drone_year": existing.get("drone_year"),
                "drone_install_date": existing.get("drone_install_date"),
                "drone_last_inspected": _parse_date(payload.get("drone_last_inspected")),
                "drone_last_inspector": payload.get("drone_last_inspector") or None,
                "remote_id": payload.get("remote_id") or None,
                "project_id": project_id,
                "org_id": org_id,
                "active_drone": True,
            }
        else:
            new_row = {
                "drone_id": str(uuid4()),
                "drone_identifier": (payload.get("drone_identifier") or "").strip() or None,
                "drone_model": (payload.get("drone_model") or "").strip() or None,
                "drone_year": int(payload["drone_year"]) if payload.get("drone_year") else None,
                "drone_install_date": _parse_date(payload.get("drone_install_date")),
                "drone_last_inspected": _parse_date(payload.get("drone_last_inspected")),
                "drone_last_inspector": payload.get("drone_last_inspector") or None,
                "remote_id": payload.get("remote_id") or None,
                "project_id": project_id,
                "org_id": org_id,
                "active_drone": True,
            }

        resp = supabase_client.client.table("drones").insert(new_row).execute()
        if not resp.data:
            return jsonify({"error": "Failed to create drone entry"}), 500
        return jsonify(resp.data[0]), 201
    except Exception as exc:
        logger.error("create_drone error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@fleet_bp.route("/drones/<drone_id>", methods=["DELETE"])
@jwt_required
def deactivate_drone(drone_id):
    """Deactivate a drone by setting active_drone=False."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        existing_resp = (
            supabase_client.client.table("drones")
            .select("project_id")
            .eq("drone_id", drone_id)
            .limit(1)
            .execute()
        )
        existing = (existing_resp.data or [None])[0]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    if not existing:
        return jsonify({"error": "Drone not found"}), 404

    project_id = existing["project_id"]
    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    try:
        supabase_client.client.table("drones").update({"active_drone": False}).eq(
            "drone_id", drone_id
        ).execute()
        return jsonify({"status": "deactivated"})
    except Exception as exc:
        logger.error("deactivate_drone error: %s", exc)
        return jsonify({"error": str(exc)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# DOCKS
# ─────────────────────────────────────────────────────────────────────────────


@fleet_bp.route("/docks/history", methods=["GET"])
@jwt_required
def dock_history():
    """Return full history for a dock_identifier across all projects."""
    try:
        _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    dock_identifier = (request.args.get("dock_identifier") or "").strip()
    if not dock_identifier:
        return jsonify({"error": "dock_identifier is required"}), 400

    try:
        resp = (
            supabase_client.client.table("docks")
            .select("*")
            .eq("dock_identifier", dock_identifier)
            .order("dock_last_inspected", desc=True)
            .execute()
        )
        records = _enrich_with_project_org(resp.data or [], "project_id", "org_id")
        return jsonify({"history": records})
    except Exception as exc:
        logger.error("dock_history error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@fleet_bp.route("/docks", methods=["GET"])
@jwt_required
def list_docks():
    """List active docks for a project."""
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
            supabase_client.client.table("docks")
            .select("*")
            .eq("project_id", project_id)
            .eq("active_dock", True)
            .execute()
        )
        return jsonify({"docks": resp.data or []})
    except Exception as exc:
        logger.error("list_docks error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@fleet_bp.route("/docks", methods=["POST"])
@jwt_required
def create_dock():
    """Create a dock entry in install or service mode."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    payload = request.get_json() or {}
    project_id = (payload.get("project_id") or "").strip()
    mode = (payload.get("mode") or "install").strip()

    if not project_id:
        return jsonify({"error": "project_id is required"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    org_id = _get_project_org_id(project_id)

    try:
        if mode == "service":
            dock_identifier = (payload.get("dock_identifier") or "").strip()
            if not dock_identifier:
                return jsonify({"error": "dock_identifier is required for service mode"}), 400

            existing_resp = (
                supabase_client.client.table("docks")
                .select("*")
                .eq("dock_identifier", dock_identifier)
                .eq("project_id", project_id)
                .eq("active_dock", True)
                .limit(1)
                .execute()
            )
            existing = (existing_resp.data or [None])[0]
            if not existing:
                return jsonify({"error": "No active dock found for this identifier"}), 404

            supabase_client.client.table("docks").update({"active_dock": False}).eq(
                "dock_id", existing["dock_id"]
            ).execute()

            new_row = {
                "dock_id": str(uuid4()),
                "dock_identifier": dock_identifier,
                "dock_model": existing.get("dock_model"),
                "dock_year": existing.get("dock_year"),
                "dock_install_date": existing.get("dock_install_date"),
                "dock_last_inspected": _parse_date(payload.get("dock_last_inspected")),
                "dock_last_inspector": payload.get("dock_last_inspector") or None,
                "project_id": project_id,
                "org_id": org_id,
                "active_dock": True,
            }
        else:
            new_row = {
                "dock_id": str(uuid4()),
                "dock_identifier": (payload.get("dock_identifier") or "").strip() or None,
                "dock_model": (payload.get("dock_model") or "").strip() or None,
                "dock_year": int(payload["dock_year"]) if payload.get("dock_year") else None,
                "dock_install_date": _parse_date(payload.get("dock_install_date")),
                "dock_last_inspected": _parse_date(payload.get("dock_last_inspected")),
                "dock_last_inspector": payload.get("dock_last_inspector") or None,
                "project_id": project_id,
                "org_id": org_id,
                "active_dock": True,
            }

        resp = supabase_client.client.table("docks").insert(new_row).execute()
        if not resp.data:
            return jsonify({"error": "Failed to create dock entry"}), 500
        return jsonify(resp.data[0]), 201
    except Exception as exc:
        logger.error("create_dock error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@fleet_bp.route("/docks/<dock_id>", methods=["DELETE"])
@jwt_required
def deactivate_dock(dock_id):
    """Deactivate a dock by setting active_dock=False."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    try:
        existing_resp = (
            supabase_client.client.table("docks")
            .select("project_id")
            .eq("dock_id", dock_id)
            .limit(1)
            .execute()
        )
        existing = (existing_resp.data or [None])[0]
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    if not existing:
        return jsonify({"error": "Dock not found"}), 404

    project_id = existing["project_id"]
    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    try:
        supabase_client.client.table("docks").update({"active_dock": False}).eq(
            "dock_id", dock_id
        ).execute()
        return jsonify({"status": "deactivated"})
    except Exception as exc:
        logger.error("deactivate_dock error: %s", exc)
        return jsonify({"error": str(exc)}), 500
