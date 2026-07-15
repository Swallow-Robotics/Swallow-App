"""
Weather routes for base station weather sensor telemetry.
"""

import logging
import math
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, g

from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import require_role, ROLE_ORDER
from app.services.storage.supabase_client import supabase_client

weather_bp = Blueprint("weather", __name__, url_prefix="/api/v1/weather")
VIEW_ROLES = set(ROLE_ORDER)
logger = logging.getLogger(__name__)

# Averaged as a plain mean when bucketing points together.
NUMERIC_FIELDS = [
    "air_temperature",
    "relative_humidity",
    "wind_speed",
    "wind_gust",
    "rainfall",
    "rain_rate",
    "solar_radiation",
    "uv_index",
    "light_intensity",
    "battery_level",
    "signal_strength",
]
# Averaged as a circular (vector) mean since these are compass degrees and
# wrap around at 360 (naively averaging 350 and 10 would give 180, not 0).
CIRCULAR_FIELDS = ["wind_direction"]

RANGE_WINDOWS = {
    "1h": timedelta(hours=1),
    "1d": timedelta(days=1),
    "7d": timedelta(days=7),
}

TARGET_POINTS = 300


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


def _circular_mean_degrees(values):
    sin_sum = sum(math.sin(math.radians(v)) for v in values)
    cos_sum = sum(math.cos(math.radians(v)) for v in values)
    return math.degrees(math.atan2(sin_sum, cos_sum)) % 360


def _bucket_average(rows, target_points=TARGET_POINTS):
    """Downsample rows to ~target_points by averaging fixed-size buckets."""
    n = len(rows)
    if n <= target_points:
        return rows

    bucket_size = math.ceil(n / target_points)
    points = []
    for i in range(0, n, bucket_size):
        bucket = rows[i : i + bucket_size]
        agg = {"recorded_at": bucket[len(bucket) // 2]["recorded_at"]}
        for field in NUMERIC_FIELDS:
            vals = [b[field] for b in bucket if b.get(field) is not None]
            agg[field] = (sum(vals) / len(vals)) if vals else None
        for field in CIRCULAR_FIELDS:
            vals = [b[field] for b in bucket if b.get(field) is not None]
            agg[field] = _circular_mean_degrees(vals) if vals else None
        points.append(agg)
    return points


@weather_bp.route("/current", methods=["GET"])
@jwt_required
def current_weather():
    """Return the most recent weather reading for each active base station on a project."""
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
        stations_resp = (
            supabase_client.client.table("base_stations")
            .select("bs_id, bs_name, bs_serial_number, bs_model")
            .eq("project_id", project_id)
            .eq("active_bs", True)
            .execute()
        )
        stations = stations_resp.data or []

        results = []
        for station in stations:
            reading_resp = (
                supabase_client.client.table("weather")
                .select("*")
                .eq("bs_id", station["bs_id"])
                .order("recorded_at", desc=True)
                .limit(1)
                .execute()
            )
            latest = (reading_resp.data or [None])[0]
            results.append(
                {
                    "bs_id": station["bs_id"],
                    "bs_name": station.get("bs_name")
                    or station.get("bs_serial_number")
                    or station.get("bs_model")
                    or "Base Station",
                    "latest": latest,
                }
            )

        return jsonify({"stations": results})
    except Exception as exc:
        logger.error("current_weather error: %s", exc)
        return jsonify({"error": str(exc)}), 500


@weather_bp.route("/history", methods=["GET"])
@jwt_required
def weather_history():
    """Return a downsampled weather time series for a base station over a range."""
    try:
        user_id = _require_auth()
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 401

    project_id = (request.args.get("project_id") or "").strip()
    bs_id = (request.args.get("bs_id") or "").strip()
    range_key = (request.args.get("range") or "1h").strip()

    if not project_id:
        return jsonify({"error": "project_id is required"}), 400
    if not bs_id:
        return jsonify({"error": "bs_id is required"}), 400
    if range_key not in RANGE_WINDOWS:
        return jsonify({"error": f"range must be one of {sorted(RANGE_WINDOWS)}"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        return jsonify(permission[0]), permission[1]

    try:
        station_resp = (
            supabase_client.client.table("base_stations")
            .select("bs_id")
            .eq("bs_id", bs_id)
            .eq("project_id", project_id)
            .limit(1)
            .execute()
        )
        if not (station_resp.data or []):
            return jsonify({"error": "Base station not found for this project"}), 404

        cutoff = (datetime.now(timezone.utc) - RANGE_WINDOWS[range_key]).isoformat()
        rows_resp = (
            supabase_client.client.table("weather")
            .select("*")
            .eq("bs_id", bs_id)
            .gte("recorded_at", cutoff)
            .order("recorded_at", desc=False)
            .execute()
        )
        rows = rows_resp.data or []
        points = _bucket_average(rows)

        return jsonify({"range": range_key, "bs_id": bs_id, "points": points})
    except Exception as exc:
        logger.error("weather_history error: %s", exc)
        return jsonify({"error": str(exc)}), 500
