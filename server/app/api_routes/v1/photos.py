from flask import Blueprint, request, jsonify, g
import os
import math
from datetime import datetime, timezone
from uuid import UUID, uuid4
import io
from werkzeug.utils import secure_filename
from PIL import Image, ImageFile, ImageOps
from app.middleware.auth_middleware import jwt_required
from app.services.auth.permissions import (
    DEFAULT_DENIED_MESSAGE,
    require_role,
    ROLE_ORDER,
)
from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client
from app.utils.validators import validate_photo_data
from typing import Dict, Any, Optional, Tuple, List, Set

bp = Blueprint("photos_v1", __name__)

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
VIEW_ROLES: Set[str] = set(ROLE_ORDER)
MANAGE_PHOTO_ROLES: Set[str] = {"Owner", "Administrator", "Editor"}


def _parse_page_args() -> Tuple[int, int]:
    """Return sanitized (page, page_size)."""
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE

    page = max(1, page)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    return page, page_size


def _parse_date_range(raw_range: Optional[str]) -> Optional[Tuple[Optional[str], Optional[str]]]:
    if not raw_range:
        return None
    parts = [part.strip() for part in raw_range.split(",")]
    if len(parts) != 2:
        raise ValueError("date_range must be start,end")

    def _normalize(value: str) -> Optional[str]:
        if not value:
            return None
        cleaned = value.replace("Z", "+00:00") if value.endswith("Z") else value
        # Validate ISO-ish format
        try:
            datetime.fromisoformat(cleaned)
        except ValueError as exc:
            raise ValueError("date_range values must be ISO timestamps") from exc
        return value

    start = _normalize(parts[0])
    end = _normalize(parts[1])
    return (start, end)


def _normalize_uuid(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise ValueError("project_id must be a valid UUID") from exc


def _prefetch_project_scope(
    user_id: str, requested_project_id: Optional[str]
) -> Tuple[List[str], Dict[str, Dict[str, Any]], Optional[Tuple[dict, int]]]:
    """
    Resolve the list of authorized project ids plus a memoized metadata cache.

    Returns:
        (authorized_ids, project_cache, error_payload)
    """
    project_cache: Dict[str, Dict[str, Any]] = {}

    if requested_project_id:
        permission = require_role(requested_project_id, VIEW_ROLES, user_id=user_id)
        if isinstance(permission, tuple):
            return [], project_cache, permission
        project_cache[requested_project_id] = {"role": permission.get("role")}
        return [requested_project_id], project_cache, None

    memberships = supabase_client.list_projects_for_user(user_id) or []
    allowed_ids = []
    for project in memberships:
        pid = project.get("id")
        if not pid:
            continue
        allowed_ids.append(pid)
        project_cache[pid] = {"role": project.get("role"), "name": project.get("name")}

    return allowed_ids, project_cache, None


def _serialize_photo(
    record: Dict[str, Any],
    project_cache: Dict[str, Dict[str, Any]],
    url_cache: Dict[str, Optional[str]],
    location_cache: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Normalize Supabase record into API contract."""
    key = record.get("r2_path") or record.get("r2_key")
    cached_url = url_cache.get(key or "")

    resolved_url = (
        record.get("r2_url")
        or record.get("url")
        or cached_url
        or (r2_client.resolve_url(key) if key else None)
    )
    if key and key not in url_cache:
        url_cache[key] = resolved_url

    thumb_path, thumb_url = supabase_client.extract_thumbnail_fields(record)
    cached_thumb_url = url_cache.get(thumb_path or "")
    resolved_thumb_url = thumb_url or cached_thumb_url
    if thumb_path and not resolved_thumb_url:
        resolved_thumb_url = r2_client.resolve_url(thumb_path)
    if thumb_path and thumb_path not in url_cache:
        url_cache[thumb_path] = resolved_thumb_url

    project_id = record.get("project_id")
    role = project_cache.get(project_id, {}).get("role")
    project_name = project_cache.get(project_id, {}).get("name")
    if project_id and not project_name:
        try:
            project_row = supabase_client.get_project(project_id) or {}
            project_name = project_row.get("name")
        except Exception:
            project_name = None

    location_id = record.get("location_id")
    location = {}
    if location_id and location_id not in location_cache:
        try:
            location = supabase_client.get_location(location_id) or {}
        except Exception:
            location = {}
        location_cache[location_id] = location
    elif location_id:
        location = location_cache.get(location_id) or {}

    def _dms_to_decimal(dms, ref):
        try:
            deg, minutes, seconds = dms
            deg = float(deg)
            minutes = float(minutes)
            seconds = float(seconds)
            decimal = deg + minutes / 60.0 + seconds / 3600.0
            if ref in ("S", "W"):
                decimal = -decimal
            return decimal
        except Exception:
            return None

    # Prefer photo latitude/longitude; fall back to location coords, then EXIF GPS
    lat = record.get("latitude")
    lon = record.get("longitude")
    if (lat is None or lon is None) and location:
        lat = lat if lat is not None else location.get("latitude")
        lon = lon if lon is not None else location.get("longitude")
    if (lat is None or lon is None) and isinstance(record.get("exif_data"), dict):
        gps = record["exif_data"].get("gps") or {}
        gps_lat = gps.get("GPSLatitude")
        gps_lat_ref = gps.get("GPSLatitudeRef")
        gps_lon = gps.get("GPSLongitude")
        gps_lon_ref = gps.get("GPSLongitudeRef")
        if gps_lat and gps_lat_ref and gps_lon and gps_lon_ref:
            dlat = _dms_to_decimal(gps_lat, gps_lat_ref)
            dlon = _dms_to_decimal(gps_lon, gps_lon_ref)
            if dlat is not None and dlon is not None:
                lat = lat if lat is not None else dlat
                lon = lon if lon is not None else dlon
    uploaded_at = record.get("uploaded_at") or record.get("created_at")
    created_at = record.get("created_at") or record.get("uploaded_at")

    user_id = record.get("user_id")
    uploaded_by = None
    if user_id:
        try:
            user_row = supabase_client.get_user_metadata(user_id) or {}
            first = (user_row.get("first_name") or "").strip()
            last = (user_row.get("last_name") or "").strip()
            display = " ".join([part for part in [first, last] if part])
            uploaded_by = {
                "id": user_id,
                "first_name": first or None,
                "last_name": last or None,
                "display": display or None,
            }
        except Exception:
            uploaded_by = {"id": user_id}

    # Build/resolve storage URLs. If r2_path is missing, derive from photo id + extension.
    key = record.get("r2_path") or record.get("r2_key")
    if not key:
        file_name = record.get("file_name") or ""
        _, ext = os.path.splitext(file_name)
        ext = ext.lstrip(".") or "jpg"
        photo_id = record.get("id")
        project_id = record.get("project_id")
        if photo_id and project_id:
            key = f"projects/{project_id}/photos/{photo_id}.{ext}"

    cached_url = url_cache.get(key or "")
    resolved_url = (
        record.get("r2_url")
        or record.get("url")
        or cached_url
        or (r2_client.resolve_url(key) if key else None)
    )
    if key and key not in url_cache:
        url_cache[key] = resolved_url

    return {
        "id": record.get("id"),
        "project_id": project_id,
        "project_name": project_name,
        "project_role": role,
        "user_id": user_id,
        "uploaded_by": uploaded_by,
        "file_name": record.get("file_name"),
        "file_size": record.get("file_size"),
        "latitude": lat,
        "longitude": lon,
        "location_id": location_id,
        "location_city": location.get("city"),
        "location_state": location.get("state"),
        "location_country": location.get("country"),
        "geocode_data": location.get("geocode_data"),
        "uploaded_at": uploaded_at,
        "created_at": created_at,
        "captured_at": record.get("captured_at"),
        "r2_path": key,
        "r2_url": record.get("r2_url") or resolved_url,
        "url": resolved_url or record.get("r2_url"),
        "thumbnail_r2_path": thumb_path,
        "thumbnail_r2_url": thumb_url or resolved_thumb_url,
        "thumbnail_url": resolved_thumb_url,
        "exif_data": record.get("exif_data"),
    }


def _build_photo_listing_payload() -> Tuple[Dict[str, Any], int]:
    if not supabase_client.client:
        return (
            {
                "error": "Supabase client not configured. Check environment variables.",
            },
            500,
        )

    current_user = getattr(g, "current_user", None) or {}
    current_user_id = current_user.get("id")
    if not current_user_id:
        return ({"error": "Authenticated Supabase user context missing"}, 401)

    try:
        project_id = _normalize_uuid(request.args.get("project_id"))
    except ValueError as exc:
        return ({"error": str(exc)}, 400)

    if not project_id:
        return ({"error": "project_id is required"}, 400)

    page, page_size = _parse_page_args()

    # Date range (start_date, end_date or legacy date_range)
    try:
        raw_date_range = request.args.get("date_range")
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        if raw_date_range:
            date_range = _parse_date_range(raw_date_range)
        else:
            date_range = (start_date, end_date) if (start_date or end_date) else None
    except ValueError as exc:
        return ({"error": str(exc)}, 400)

    # Bounding box
    bbox = None
    try:
        min_lat = request.args.get("min_lat", type=float)
        max_lat = request.args.get("max_lat", type=float)
        min_lon = request.args.get("min_lon", type=float)
        max_lon = request.args.get("max_lon", type=float)
        if None not in (min_lat, max_lat, min_lon, max_lon):
            bbox = (min_lat, max_lat, min_lon, max_lon)
    except ValueError:
        return ({"error": "Invalid bounding box parameters"}, 400)

    city = request.args.get("city")
    state = request.args.get("state")
    country = request.args.get("country")

    authorized_ids, project_cache, permission_error = _prefetch_project_scope(
        current_user_id, project_id
    )
    if permission_error:
        payload, status_code = permission_error
        return (payload, status_code)

    if not authorized_ids:
        pagination = {
            "page": page,
            "page_size": page_size,
            "total": 0,
            "total_pages": 0,
        }
        return ({"photos": [], "pagination": pagination}, 200)

    user_filter = request.args.get("user_id")

    try:
        query_result = supabase_client.fetch_project_photos(
            project_ids=authorized_ids,
            page=page,
            page_size=page_size,
            user_id=user_filter,
            date_range=date_range,
            bbox=bbox,
            city=city,
            state=state,
            country=country,
            include_signed_urls=True,
        )
    except Exception as exc:
        return ({"error": f"Failed to query Supabase: {exc}"}, 500)

    url_cache: Dict[str, Optional[str]] = {}
    location_cache: Dict[str, Dict[str, Any]] = {}
    serialized = [
        _serialize_photo(record, project_cache, url_cache, location_cache)
        for record in query_result.get("data", []) or []
    ]

    total = query_result.get("count", 0) or 0
    pagination = {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": math.ceil(total / page_size) if page_size else 0,
    }

    return ({"photos": serialized, "pagination": pagination}, 200)


def handle_photo_listing_request():
    payload, status = _build_photo_listing_payload()
    return jsonify(payload), status


@bp.route("/", methods=["GET"])
@jwt_required
def get_photos():
    """Return paginated, authorized photos for the authenticated user."""
    return handle_photo_listing_request()


def _process_photo_urls(photo: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process photo to ensure it has a valid URL.
    Prefer explicit 'url' field; fallback to generating presigned URL from 'r2_key'.

    Args:
        photo (Dict[str, Any]): Photo data from Supabase

    Returns:
        Dict[str, Any]: Photo with valid URL
    """
    # Prefer generating a fresh URL from r2_key to avoid stale/unreachable URLs
    r2_key = photo.get("r2_key")
    prefer_public = os.getenv("PREFER_PUBLIC_URLS", "true").lower() == "true"
    if r2_key:
        url = None
        if prefer_public and getattr(r2_client, "public_url", None):
            url = r2_client.get_public_url(r2_key)
        if not url:
            url = r2_client.generate_presigned_url(r2_key, expires_in=600)
        if url:
            photo["url"] = url
            return photo

    # Fallback: keep existing url if present
    if photo.get("url") and photo["url"].strip():
        return photo

    return photo


@bp.route("/<photo_id>", methods=["GET"])
@jwt_required
def get_photo(photo_id):
    """Get a specific photo by ID - API v1"""
    try:
        if not supabase_client.client:
            return (
                jsonify(
                    {
                        "error": "Supabase client not configured",
                        "version": "v1",
                    }
                ),
                500,
            )

        current_user = getattr(g, "current_user", None) or {}
        current_user_id = current_user.get("id")
        if not current_user_id:
            return (
                jsonify({"error": "forbidden", "message": "Authentication required"}),
                401,
            )

        record = supabase_client.get_photo_metadata(photo_id)
        if not record:
            return jsonify({"error": "Photo not found", "version": "v1"}), 404

        project_id = record.get("project_id")
        if not project_id:
            return (
                jsonify(
                    {
                        "error": "forbidden",
                        "message": "Project is required for this photo",
                    }
                ),
                403,
            )

        permission = require_role(project_id, VIEW_ROLES, user_id=current_user_id)
        if isinstance(permission, tuple):
            payload, status_code = permission
            return jsonify(payload), status_code

        project_name = None
        try:
            project_row = supabase_client.get_project(project_id) or {}
            project_name = project_row.get("name")
        except Exception:
            project_name = None

        project_cache: Dict[str, Dict[str, Any]] = {
            project_id: {"role": permission.get("role"), "name": project_name}
        }

        serialized = _serialize_photo(record, project_cache, {}, {})
        return jsonify({"version": "v1", "photo": serialized})
    except Exception as e:
        return jsonify({"error": str(e), "version": "v1"}), 500


@bp.route("/location", methods=["GET"])
@jwt_required
def get_photos_by_location():
    """Get photos by location coordinates - API v1"""
    return (
        jsonify(
            {
                "error": "gone",
                "version": "v1",
                "message": "Use GET /api/v1/photos/?project_id=<uuid> (optionally with bbox filters).",
            }
        ),
        410,
    )


@bp.route("/upload", methods=["POST"])
@jwt_required
def upload_photo():
    """Upload a new photo - API v1"""
    return (
        jsonify(
            {
                "error": "gone",
                "version": "v1",
                "message": "Use POST /api/photos/upload (Supabase metadata + R2 storage).",
            }
        ),
        410,
    )


@bp.route("/<photo_id>", methods=["PUT"])
@jwt_required
def update_photo(photo_id):
    """Update a photo - API v1"""
    try:
        current_user = getattr(g, "current_user", None) or {}
        current_user_id = current_user.get("id")
        if not current_user_id:
            return (
                jsonify({"error": "forbidden", "message": "Authentication required"}),
                401,
            )

        record = supabase_client.get_photo_metadata(photo_id)
        if not record:
            return jsonify({"error": "Photo not found", "version": "v1"}), 404

        project_id = record.get("project_id")
        permission = require_role(project_id, MANAGE_PHOTO_ROLES, user_id=current_user_id)
        if isinstance(permission, tuple):
            payload, status_code = permission
            return jsonify(payload), status_code

        data = request.get_json() or {}

        updates = {}
        if not updates:
            return jsonify({"version": "v1", "photo": _serialize_photo(record, {project_id: {}}, {}, {})})

        updated = supabase_client.update_photo_metadata(photo_id, updates)
        return jsonify(
            {
                "version": "v1",
                "photo": _serialize_photo(updated or record, {project_id: {}}, {}, {}),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e), "version": "v1"}), 500


@bp.route("/<photo_id>", methods=["DELETE"])
@jwt_required
def delete_photo(photo_id):
    """Delete a photo - API v1"""
    try:
        current_user = getattr(g, "current_user", None) or {}
        current_user_id = current_user.get("id")
        if not current_user_id:
            return (
                jsonify({"error": "forbidden", "message": "Authentication required"}),
                401,
            )

        record = supabase_client.get_photo_metadata(photo_id)
        if not record:
            return jsonify({"error": "Photo not found", "version": "v1"}), 404

        project_id = record.get("project_id")
        permission = require_role(project_id, MANAGE_PHOTO_ROLES, user_id=current_user_id)
        if isinstance(permission, tuple):
            payload, status_code = permission
            return jsonify(payload), status_code

        # Get location_id before deletion
        location_id = record.get("location_id")

        # Soft-hide by flipping show_on_photos so it disappears from Photos/Map.
        updated = supabase_client.update_photo_metadata(
            photo_id, {"show_on_photos": False}
        )
        if updated is None:
            return (
                jsonify(
                    {
                        "error": "Failed to delete photo",
                        "version": "v1",
                    }
                ),
                500,
            )

        # Decrement location count
        if location_id:
            supabase_client.decrement_location_count(location_id)

        return jsonify({"message": "Photo deleted successfully", "version": "v1"})
    except Exception as e:
        return jsonify({"error": str(e), "version": "v1"}), 500


@bp.route("/stats", methods=["GET"])
@jwt_required
def get_photo_stats():
    """Get photo statistics - API v1"""
    return (
        jsonify(
            {
                "error": "gone",
                "version": "v1",
                "message": "Stats are Supabase-backed; use GET /api/v1/photos/?project_id=<uuid> and count client-side for now.",
            }
        ),
        410,
    )


# ---------------------------------------------------------------------------
# Flight-scoped photo schema (photos linked to flights/waypoints).
# Photos no longer carry project_id directly; the project is resolved through
# flights.project_id. These endpoints power the updated view/photos page.
# ---------------------------------------------------------------------------

ALLOWED_PHOTO_EXTENSIONS = {"jpg", "jpeg", "png"}
ALLOWED_PHOTO_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png"}
MAX_PHOTO_UPLOAD_BYTES = 20 * 1024 * 1024

ImageFile.LOAD_TRUNCATED_IMAGES = True


def _generate_thumbnail_bytes(
    file_bytes: bytes, mime_type: str
) -> Optional[Tuple[bytes, str, str]]:
    """Build a lighter thumbnail. Returns (bytes, ext, content_type) or None."""
    try:
        image = Image.open(io.BytesIO(file_bytes))
        image.load()
    except Exception:
        return None

    try:
        image = ImageOps.exif_transpose(image)
    except Exception:
        pass

    thumb = image.copy()
    thumb.thumbnail((512, 512), Image.Resampling.LANCZOS)

    has_alpha = thumb.mode in ("RGBA", "LA") or (
        thumb.mode == "P" and "transparency" in thumb.info
    )
    use_png = mime_type == "image/png" and has_alpha
    buffer = io.BytesIO()
    try:
        if use_png:
            if thumb.mode not in ("RGBA", "LA"):
                thumb = thumb.convert("RGBA")
            thumb.save(buffer, format="PNG", optimize=True)
            return buffer.getvalue(), "png", "image/png"
        if thumb.mode not in ("RGB", "L"):
            thumb = thumb.convert("RGB")
        thumb.save(buffer, format="JPEG", quality=85, optimize=True)
        return buffer.getvalue(), "jpg", "image/jpeg"
    except Exception:
        return None


def _current_user_id_or_error() -> Tuple[Optional[str], Optional[Tuple[dict, int]]]:
    current_user = getattr(g, "current_user", None) or {}
    user_id = current_user.get("id")
    if not user_id:
        return None, ({"error": "forbidden", "message": "Authentication required"}, 401)
    return user_id, None


def _flight_for_id(flight_id: str) -> Optional[Dict[str, Any]]:
    """Return the flight row (flight_id, project_id, plan_id) or None."""
    if not flight_id:
        return None
    resp = (
        supabase_client.client.table("flights")
        .select("flight_id, project_id, plan_id")
        .eq("flight_id", flight_id)
        .limit(1)
        .execute()
    )
    return (resp.data or [None])[0]


def _photo_extension(filename: str, mime_type: str) -> str:
    _, ext = os.path.splitext(filename or "")
    cleaned = "".join(ch for ch in ext.lstrip(".").lower() if ch.isalnum())
    if not cleaned and mime_type:
        cleaned = (mime_type.split("/")[-1] if "/" in mime_type else mime_type).lower()
    return cleaned or "jpg"


def _to_float_or_none(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _serialize_flight_photo(
    record: Dict[str, Any], waypoint_meta: Dict[str, Dict[str, Any]]
) -> Dict[str, Any]:
    key = record.get("r2_path")
    resolved_url = record.get("r2_url") or (
        r2_client.resolve_url(key) if key else None
    )
    thumb_path = record.get("thumbnail_r2_path")
    resolved_thumb_url = record.get("thumbnail_r2_url") or (
        r2_client.resolve_url(thumb_path) if thumb_path else None
    )
    waypoint_id = record.get("waypoint_id")
    wp = waypoint_meta.get(waypoint_id) if waypoint_id else None
    return {
        "photo_id": record.get("photo_id"),
        "flight_id": record.get("flight_id"),
        "drone_alt": record.get("drone_alt"),
        "drone_lat": record.get("drone_lat"),
        "drone_lng": record.get("drone_lng"),
        "taken_at": record.get("taken_at"),
        "uploaded_at": record.get("uploaded_at"),
        "r2_path": key,
        "r2_url": resolved_url,
        "thumbnail_r2_path": thumb_path,
        "thumbnail_r2_url": resolved_thumb_url,
        "drone_heading": record.get("drone_heading"),
        "gimbal_position": record.get("gimbal_position"),
        "waypoint_id": waypoint_id,
        "waypoint_name": wp.get("waypoint_name") if wp else None,
        "waypoint_action": wp.get("action") if wp else None,
        "active_photo": record.get("active_photo"),
    }


@bp.route("/project-photos", methods=["GET"])
@jwt_required
def list_project_photos():
    """List active photos for a project.

    Two disjoint code paths based on capture_method:

    * capture_method=drone (or no filter)
      Resolved through the flights table: projects → flights → photos.
      This is the existing site plan path and is completely unchanged.

    * capture_method=360_camera
      Resolved through the drawings chain: drawings → waypoints → photos.
      No flights, plans, drones, or mission entities are involved.
    """
    if not supabase_client.client:
        return jsonify({"error": "Supabase client not configured"}), 500

    user_id, error = _current_user_id_or_error()
    if error:
        payload, status = error
        return jsonify(payload), status

    try:
        project_id = _normalize_uuid(request.args.get("project_id"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not project_id:
        return jsonify({"error": "project_id is required"}), 400

    permission = require_role(project_id, VIEW_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status = permission
        return jsonify(payload), status

    capture_method = (request.args.get("capture_method") or "").strip() or None

    try:
        # ----------------------------------------------------------------
        # Floor plan path: drawings → waypoints → photos
        # ----------------------------------------------------------------
        if capture_method == "360_camera":
            drw_resp = (
                supabase_client.client.table("drawings")
                .select("drawing_id")
                .eq("project_id", project_id)
                .eq("drawing_type", "floor_plan")
                .execute()
            )
            drawing_ids = [d["drawing_id"] for d in (drw_resp.data or [])]
            if not drawing_ids:
                return jsonify({"photos": []})

            wp_resp = (
                supabase_client.client.table("waypoints")
                .select("waypoint_id, waypoint_name, action")
                .in_("drawing_id", drawing_ids)
                .execute()
            )
            floor_waypoints = wp_resp.data or []
            waypoint_ids_floor = [w["waypoint_id"] for w in floor_waypoints]
            waypoint_meta_floor: Dict[str, Dict[str, Any]] = {
                w["waypoint_id"]: w for w in floor_waypoints
            }

            if not waypoint_ids_floor:
                return jsonify({"photos": []})

            photo_resp = (
                supabase_client.client.table("photos")
                .select("*")
                .in_("waypoint_id", waypoint_ids_floor)
                .eq("active_photo", True)
                .eq("capture_method", "360_camera")
                .order("taken_at", desc=True)
                .execute()
            )
            photos_floor = photo_resp.data or []
            return jsonify(
                {"photos": [_serialize_photo(p, waypoint_meta_floor) for p in photos_floor]}
            )

        # ----------------------------------------------------------------
        # Site plan path: flights → photos  (existing logic, unchanged)
        # ----------------------------------------------------------------
        flights_resp = (
            supabase_client.client.table("flights")
            .select("flight_id")
            .eq("project_id", project_id)
            .execute()
        )
        flight_ids = [f["flight_id"] for f in (flights_resp.data or [])]
        if not flight_ids:
            return jsonify({"photos": []})

        photo_query = (
            supabase_client.client.table("photos")
            .select("*")
            .in_("flight_id", flight_ids)
            .eq("active_photo", True)
            .eq("capture_method", "drone")
            .order("taken_at", desc=True)
        )
        photos_resp = photo_query.execute()
        photos = photos_resp.data or []

        waypoint_ids = list({p["waypoint_id"] for p in photos if p.get("waypoint_id")})
        waypoint_meta: Dict[str, Dict[str, Any]] = {}
        if waypoint_ids:
            wp_resp = (
                supabase_client.client.table("waypoints")
                .select("waypoint_id, waypoint_name, action")
                .in_("waypoint_id", waypoint_ids)
                .execute()
            )
            waypoint_meta = {
                w["waypoint_id"]: {
                    "waypoint_name": w.get("waypoint_name"),
                    "action": w.get("action"),
                }
                for w in wp_resp.data or []
            }

        serialized = [_serialize_flight_photo(p, waypoint_meta) for p in photos]
        return jsonify({"photos": serialized})
    except Exception as exc:
        return jsonify({"error": f"Failed to query photos: {exc}"}), 500


@bp.route("/manual-upload", methods=["POST"])
@jwt_required
def manual_upload_photo():
    """Upload a single photo with manually-entered flight metadata."""
    if not supabase_client.client:
        return jsonify({"error": "Database not configured"}), 500
    if not r2_client.client:
        config_msg = getattr(r2_client, "_config_error", None) or "Check R2 env vars."
        return jsonify({"error": f"Storage not configured. {config_msg}"}), 500

    user_id, error = _current_user_id_or_error()
    if error:
        payload, status = error
        return jsonify(payload), status

    flight_id = (request.form.get("flight_id") or "").strip()
    if not flight_id:
        return jsonify({"error": "flight_id is required"}), 400

    flight = _flight_for_id(flight_id)
    if not flight:
        return jsonify({"error": "Flight not found"}), 404
    project_id = flight.get("project_id")

    permission = require_role(project_id, MANAGE_PHOTO_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status = permission
        return jsonify(payload), status

    file_item = request.files.get("file")
    if not file_item or not getattr(file_item, "filename", None):
        return jsonify({"error": "Photo file is required"}), 400

    mime_type = (getattr(file_item, "mimetype", "") or "").lower()
    if mime_type not in ALLOWED_PHOTO_MIME_TYPES:
        return jsonify({"error": "Invalid file type. JPEG or PNG required"}), 400

    file_bytes = file_item.read()
    if not file_bytes:
        return jsonify({"error": "Uploaded file is empty"}), 400
    if len(file_bytes) > MAX_PHOTO_UPLOAD_BYTES:
        return jsonify({"error": "File too large (max 20MB)"}), 413

    photo_id = str(uuid4())
    safe_name = secure_filename(file_item.filename or "") or "photo"
    extension = _photo_extension(safe_name, mime_type)
    if extension not in ALLOWED_PHOTO_EXTENSIONS:
        return jsonify({"error": "Invalid file type. JPEG or PNG required"}), 400

    try:
        r2_key = r2_client.upload_project_photo(
            project_id, photo_id, file_bytes, extension, content_type=mime_type
        )
    except Exception as exc:
        return jsonify({"error": f"Upload failed: {exc}"}), 500
    if not r2_key:
        return jsonify({"error": "Failed to upload to storage"}), 502

    r2_url = r2_client.get_file_url(r2_key)

    uploaded_keys: List[str] = [r2_key]
    thumbnail_key = None
    thumbnail_url = None
    thumbnail = _generate_thumbnail_bytes(file_bytes, mime_type)
    if thumbnail:
        thumb_bytes, thumb_ext, thumb_mime = thumbnail
        thumbnail_key = f"projects/{project_id}/photos/{photo_id}_thumb.{thumb_ext}"
        try:
            uploaded = r2_client.upload_bytes(
                thumb_bytes, thumbnail_key, content_type=thumb_mime
            )
        except Exception:
            uploaded = False
        if uploaded:
            thumbnail_url = r2_client.get_file_url(thumbnail_key)
            uploaded_keys.append(thumbnail_key)
        else:
            thumbnail_key = None

    capture_method_val = (request.form.get("capture_method") or "").strip() or None
    row = {
        "photo_id": photo_id,
        "flight_id": flight_id,
        "waypoint_id": (request.form.get("waypoint_id") or "").strip() or None,
        "drone_alt": _to_float_or_none(request.form.get("drone_alt")),
        "drone_lat": _to_float_or_none(request.form.get("drone_lat")),
        "drone_lng": _to_float_or_none(request.form.get("drone_lng")),
        "taken_at": (request.form.get("taken_at") or "").strip() or None,
        "drone_heading": _to_float_or_none(request.form.get("drone_heading")),
        "gimbal_position": _to_float_or_none(request.form.get("gimbal_position")),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "r2_path": r2_key,
        "r2_url": r2_url,
        "thumbnail_r2_path": thumbnail_key,
        "thumbnail_r2_url": thumbnail_url,
        "active_photo": True,
    }
    if capture_method_val:
        row["capture_method"] = capture_method_val

    try:
        resp = supabase_client.client.table("photos").insert(row).execute()
    except Exception as exc:
        for key in uploaded_keys:
            r2_client.delete_file(key)
        return jsonify({"error": f"Failed to create photo record: {exc}"}), 500

    if not resp.data:
        for key in uploaded_keys:
            r2_client.delete_file(key)
        return jsonify({"error": "Could not persist photo metadata"}), 502

    return jsonify({"photo": resp.data[0]}), 201


@bp.route("/manage/<photo_id>", methods=["PATCH"])
@jwt_required
def edit_flight_photo(photo_id):
    """Edit manually-entered metadata for a photo."""
    if not supabase_client.client:
        return jsonify({"error": "Database not configured"}), 500

    user_id, error = _current_user_id_or_error()
    if error:
        payload, status = error
        return jsonify(payload), status

    resp = (
        supabase_client.client.table("photos")
        .select("flight_id")
        .eq("photo_id", photo_id)
        .limit(1)
        .execute()
    )
    record = (resp.data or [None])[0]
    if not record:
        return jsonify({"error": "Photo not found"}), 404

    flight = _flight_for_id(record.get("flight_id"))
    if not flight:
        return jsonify({"error": "Flight not found for photo"}), 404

    permission = require_role(
        flight.get("project_id"), MANAGE_PHOTO_ROLES, user_id=user_id
    )
    if isinstance(permission, tuple):
        payload, status = permission
        return jsonify(payload), status

    payload = request.get_json() or {}
    updates: Dict[str, Any] = {}
    for field in ("drone_alt", "drone_lat", "drone_lng", "drone_heading", "gimbal_position"):
        if field in payload:
            updates[field] = _to_float_or_none(payload.get(field))
    if "taken_at" in payload:
        updates["taken_at"] = (payload.get("taken_at") or "").strip() or None

    if not updates:
        return jsonify({"error": "No editable fields provided"}), 400

    try:
        updated = (
            supabase_client.client.table("photos")
            .update(updates)
            .eq("photo_id", photo_id)
            .execute()
        )
    except Exception as exc:
        return jsonify({"error": f"Failed to update photo: {exc}"}), 500

    return jsonify({"photo": (updated.data or [None])[0]})


@bp.route("/manage/<photo_id>", methods=["DELETE"])
@jwt_required
def deactivate_flight_photo(photo_id):
    """Soft-delete a photo by setting active_photo=FALSE."""
    if not supabase_client.client:
        return jsonify({"error": "Database not configured"}), 500

    user_id, error = _current_user_id_or_error()
    if error:
        payload, status = error
        return jsonify(payload), status

    resp = (
        supabase_client.client.table("photos")
        .select("flight_id")
        .eq("photo_id", photo_id)
        .limit(1)
        .execute()
    )
    record = (resp.data or [None])[0]
    if not record:
        return jsonify({"error": "Photo not found"}), 404

    flight = _flight_for_id(record.get("flight_id"))
    if not flight:
        return jsonify({"error": "Flight not found for photo"}), 404

    permission = require_role(
        flight.get("project_id"), MANAGE_PHOTO_ROLES, user_id=user_id
    )
    if isinstance(permission, tuple):
        payload, status = permission
        return jsonify(payload), status

    try:
        supabase_client.client.table("photos").update({"active_photo": False}).eq(
            "photo_id", photo_id
        ).execute()
    except Exception as exc:
        return jsonify({"error": f"Failed to delete photo: {exc}"}), 500

    return jsonify({"message": "Photo deleted successfully"})


# ---------------------------------------------------------------------------
# Floor plan photo upload.
#
# Data path: photos only — drawings → waypoints → photos.
# No interaction with flights, plans, drones, docks, or pilots.
# flight_id is stored as NULL; capture_method is always '360_camera'.
# ---------------------------------------------------------------------------


@bp.route("/floor-upload", methods=["POST"])
@jwt_required
def floor_upload_photo():
    """Upload a single 360-camera photo for a floor plan waypoint.

    Required form fields: project_id, waypoint_id, taken_at + file.
    capture_method is hardcoded to '360_camera'; flight_id is NULL.
    No flight or plan records are created or referenced.
    """
    if not supabase_client.client:
        return jsonify({"error": "Database not configured"}), 500
    if not r2_client.client:
        config_msg = getattr(r2_client, "_config_error", None) or "Check R2 env vars."
        return jsonify({"error": f"Storage not configured. {config_msg}"}), 500

    user_id, error = _current_user_id_or_error()
    if error:
        payload, status = error
        return jsonify(payload), status

    project_id = (request.form.get("project_id") or "").strip()
    waypoint_id = (request.form.get("waypoint_id") or "").strip() or None
    taken_at = (request.form.get("taken_at") or "").strip() or None

    if not project_id:
        return jsonify({"error": "project_id is required"}), 400

    permission = require_role(project_id, MANAGE_PHOTO_ROLES, user_id=user_id)
    if isinstance(permission, tuple):
        payload, status = permission
        return jsonify(payload), status

    file_item = request.files.get("file")
    if not file_item or not getattr(file_item, "filename", None):
        return jsonify({"error": "Photo file is required"}), 400

    mime_type = (getattr(file_item, "mimetype", "") or "").lower()
    if mime_type not in ALLOWED_PHOTO_MIME_TYPES:
        return jsonify({"error": "Invalid file type. JPEG or PNG required"}), 400

    file_bytes = file_item.read()
    if not file_bytes:
        return jsonify({"error": "Uploaded file is empty"}), 400
    if len(file_bytes) > MAX_PHOTO_UPLOAD_BYTES:
        return jsonify({"error": "File too large (max 20MB)"}), 413

    photo_id = str(uuid4())
    safe_name = secure_filename(file_item.filename or "") or "photo"
    extension = _photo_extension(safe_name, mime_type)
    if extension not in ALLOWED_PHOTO_EXTENSIONS:
        return jsonify({"error": "Invalid file type. JPEG or PNG required"}), 400

    try:
        r2_key = r2_client.upload_project_photo(
            project_id, photo_id, file_bytes, extension, content_type=mime_type
        )
    except Exception as exc:
        return jsonify({"error": f"Upload failed: {exc}"}), 500
    if not r2_key:
        return jsonify({"error": "Failed to upload to storage"}), 502

    r2_url = r2_client.get_file_url(r2_key)

    uploaded_keys: List[str] = [r2_key]
    thumbnail_key = None
    thumbnail_url = None
    thumbnail = _generate_thumbnail_bytes(file_bytes, mime_type)
    if thumbnail:
        thumb_bytes, thumb_ext, thumb_mime = thumbnail
        thumbnail_key = f"projects/{project_id}/photos/{photo_id}_thumb.{thumb_ext}"
        try:
            uploaded = r2_client.upload_bytes(
                thumb_bytes, thumbnail_key, content_type=thumb_mime
            )
        except Exception:
            uploaded = False
        if uploaded:
            thumbnail_url = r2_client.get_file_url(thumbnail_key)
            uploaded_keys.append(thumbnail_key)
        else:
            thumbnail_key = None

    # floor_id=NULL — floor plan photos are not part of any flight or mission plan
    row = {
        "photo_id": photo_id,
        "flight_id": None,
        "waypoint_id": waypoint_id,
        "drone_alt": None,
        "drone_lat": None,
        "drone_lng": None,
        "taken_at": taken_at,
        "drone_heading": None,
        "gimbal_position": None,
        "capture_method": "360_camera",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "r2_path": r2_key,
        "r2_url": r2_url,
        "thumbnail_r2_path": thumbnail_key,
        "thumbnail_r2_url": thumbnail_url,
        "active_photo": True,
    }

    try:
        resp = supabase_client.client.table("photos").insert(row).execute()
    except Exception as exc:
        for key in uploaded_keys:
            r2_client.delete_file(key)
        return jsonify({"error": f"Failed to create photo record: {exc}"}), 500

    if not resp.data:
        for key in uploaded_keys:
            r2_client.delete_file(key)
        return jsonify({"error": "Could not persist photo metadata"}), 502

    return jsonify({"photo": resp.data[0]}), 201
