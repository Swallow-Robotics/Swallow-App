"""
Service layer for project drawing operations.
Encapsulates Supabase reads/writes and R2 storage for drawings.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from app.services.storage.supabase_client import supabase_client
from app.services.storage.r2_client import r2_client
from app.utils.affine_transform import (
    AffineTransformError,
    compute_affine_from_control_points,
)
from app.utils.supabase_retry import execute_with_retry

MAX_DRAWINGS_PER_PROJECT = 5
DRAWING_R2_KEY_TEMPLATE = "projects/{project_id}/drawings/{drawing_id}.{ext}"


def list_drawings_by_project(project_id: str) -> List[Dict[str, Any]]:
    """Return all drawings for a project ordered by `order`."""
    if not supabase_client.client:
        return []

    def _run():
        return (
            supabase_client.client.table("drawings")
            .select("*")
            .eq("project_id", project_id)
            .execute()
        )

    resp = execute_with_retry(_run)
    rows = resp.data or []
    return sorted(rows, key=lambda d: (d.get("order") is None, d.get("order") or 0))


def get_drawing_by_id(drawing_id: str) -> Optional[Dict[str, Any]]:
    if not supabase_client.client:
        return None

    def _run():
        return (
            supabase_client.client.table("drawings")
            .select("*")
            .eq("drawing_id", drawing_id)
            .limit(1)
            .execute()
        )

    resp = execute_with_retry(_run)
    rows = resp.data or []
    return rows[0] if rows else None


def get_drawing_with_control_points(drawing_id: str) -> Optional[Dict[str, Any]]:
    """Fetch drawing and control points (sequential queries to reduce HTTP/2 contention)."""
    drawing = get_drawing_by_id(drawing_id)
    if not drawing:
        return None
    drawing["control_points"] = get_control_points(drawing_id)
    return drawing


def get_control_points(drawing_id: str) -> List[Dict[str, Any]]:
    if not supabase_client.client:
        return []

    def _run():
        return (
            supabase_client.client.table("drawing_control_points")
            .select("*")
            .eq("drawing_id", drawing_id)
            .execute()
        )

    resp = execute_with_retry(_run)
    points = resp.data or []
    return sorted(
        points, key=lambda p: (p.get("point_order") is None, p.get("point_order") or 0)
    )


def delete_control_points(drawing_id: str) -> None:
    if not supabase_client.client:
        return
    supabase_client.client.table("drawing_control_points").delete().eq(
        "drawing_id", drawing_id
    ).execute()


def insert_control_points(
    drawing_id: str, control_points: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    if not supabase_client.client or not control_points:
        return []
    rows = []
    for i, pt in enumerate(control_points):
        rows.append(
            {
                "drawing_id": drawing_id,
                "pixel_x": float(pt["pixel_x"]),
                "pixel_y": float(pt["pixel_y"]),
                "latitude": float(pt["latitude"]),
                "longitude": float(pt["longitude"]),
                "point_order": pt.get("point_order") or (i + 1),
            }
        )
    resp = supabase_client.client.table("drawing_control_points").insert(rows).execute()
    return resp.data or []


def delete_drawing(drawing_id: str) -> bool:
    drawing = get_drawing_by_id(drawing_id)
    if not drawing:
        return False
    r2_path = drawing.get("r2_path")
    if r2_path and r2_client.client:
        r2_client.delete_file(r2_path)
    if supabase_client.client:
        supabase_client.client.table("drawings").delete().eq(
            "drawing_id", drawing_id
        ).execute()
    return True


def create_drawing_record(
    project_id: str,
    user_id: str,
    drawing_name: str,
    order: int,
    file_type: str,
    file_size: int,
    r2_path: str,
    r2_url: Optional[str],
    width: int,
    height: int,
    drawing_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not supabase_client.client:
        return None
    payload = {
        "drawing_id": drawing_id or str(uuid4()),
        "project_id": project_id,
        "uploaded_by": user_id,
        "drawing_name": drawing_name,
        "order": order,
        "file_type": file_type,
        "file_size": file_size,
        "r2_path": r2_path,
        "r2_url": r2_url,
        "width": width,
        "height": height,
        "aligned": False,
    }
    resp = supabase_client.client.table("drawings").insert(payload).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def update_drawing_metadata(
    drawing_id: str,
    drawing_name: str,
    order: int,
) -> Optional[Dict[str, Any]]:
    if not supabase_client.client:
        return None
    resp = (
        supabase_client.client.table("drawings")
        .update({"drawing_name": drawing_name, "order": order})
        .eq("drawing_id", drawing_id)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def save_alignment(
    drawing_id: str,
    control_points: List[Dict[str, Any]],
    min_points: int = 3,
    width: Optional[int] = None,
    height: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    if len(control_points) < min_points:
        raise AffineTransformError(
            f"At least {min_points} control points are required."
        )

    coeffs = compute_affine_from_control_points(control_points)
    delete_control_points(drawing_id)
    insert_control_points(drawing_id, control_points)

    now = datetime.now(timezone.utc).isoformat()
    update_payload = {
        **coeffs,
        "aligned": True,
        "aligned_at": now,
    }
    if width and height and width > 0 and height > 0:
        update_payload["width"] = int(width)
        update_payload["height"] = int(height)
    if not supabase_client.client:
        return None
    resp = (
        supabase_client.client.table("drawings")
        .update(update_payload)
        .eq("drawing_id", drawing_id)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def clear_alignment(drawing_id: str) -> Optional[Dict[str, Any]]:
    delete_control_points(drawing_id)
    if not supabase_client.client:
        return None
    resp = (
        supabase_client.client.table("drawings")
        .update(
            {
                "transform_a": None,
                "transform_b": None,
                "transform_c": None,
                "transform_d": None,
                "transform_e": None,
                "transform_f": None,
                "aligned": False,
                "aligned_at": None,
            }
        )
        .eq("drawing_id", drawing_id)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None
