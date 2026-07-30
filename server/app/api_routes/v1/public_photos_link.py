"""
Public (token-gated, unauthenticated) access to a Photos page Public Link:
the frozen drawing (if any) plus the still-active photos captured in the
link's snapshot. Additive to the Photos page; never exposes other projects,
drawings, or photos beyond what the link's included_items recorded.
"""

from flask import Blueprint, jsonify

from app.services.public_photos_link_service import (
    get_public_link_photo,
    get_public_link_view,
)

bp = Blueprint("public_photos_link_v1", __name__)


def _not_found():
    return jsonify({"error": "not_found", "message": "Link not found"}), 404


@bp.route("/api/v1/public/photos-link/<token>", methods=["GET"])
def get_photos_link(token: str):
    """Return the drawing (if any) and active photos for this Public Link."""
    link = get_public_link_view(token)
    if not link:
        return _not_found()
    return jsonify({"link": link})


@bp.route("/api/v1/public/photos-link/<token>/photos/<photo_id>", methods=["GET"])
def get_photos_link_photo(token: str, photo_id: str):
    """Return a signed R2 URL for one photo within this link's snapshot."""
    photo = get_public_link_photo(token, photo_id)
    if not photo:
        return _not_found()
    return jsonify({"photo": photo})
