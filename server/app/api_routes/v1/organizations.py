from flask import Blueprint, jsonify

from app.middleware.auth_middleware import jwt_required
from app.services.storage.supabase_client import supabase_client

bp = Blueprint("organizations_v1", __name__)


@bp.route("", methods=["GET"])
@jwt_required
def list_organizations():
    try:
        resp = (
            supabase_client.client.table("organizations")
            .select("org_id, org_name")
            .order("org_name")
            .execute()
        )
        return jsonify({"organizations": resp.data or []})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
