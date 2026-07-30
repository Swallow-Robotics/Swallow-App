"""
Draws a Barn Swallow map pin with a camera glyph (tip-anchored) on a PyMuPDF
page — the same shape, colors, and camera icon as the Photos page waypoint
pins (WAYPOINT_PIN_SVG). PyMuPDF cannot read CSS variables, so the brand
colors are hardcoded here to match --color-primary (#3f6fa0) and
--color-surface-primary (#ffffff).
"""

from typing import Tuple

import fitz  # PyMuPDF

PIN_FILL_COLOR: Tuple[float, float, float] = (0x3F / 255, 0x6F / 255, 0xA0 / 255)
PIN_STROKE_COLOR: Tuple[float, float, float] = (1.0, 1.0, 1.0)

# The pin body traces the Photos page's WAYPOINT_PIN_SVG path (viewBox
# "0 0 24 32"): a teardrop whose point sits at (12, 31) and whose rounded
# head spans x in [2, 22], y in [1, 11]. Points below are in that same
# 24x32 space; `_scaled` maps them onto the page with the pin's tip
# anchored at the given waypoint pixel (Photos pins are tip-anchored).
_VIEWBOX_HEIGHT = 32.0
_VIEWBOX_HALF_WIDTH = 12.0
_VIEWBOX_TOP_MARGIN = 30.0
_VIEWBOX_TIP = (12.0, 31.0)
_VIEWBOX_STROKE_WIDTH = 1.5

# Camera glyph geometry, matching WAYPOINT_PIN_SVG's <rect>/<rect>/<circle>
# (body, viewfinder bump, lens), in the same 24x32 viewBox space.
_CAMERA_BODY_CORNERS = ((6.5, 8.5), (17.5, 15.5))
_CAMERA_BUMP_CORNERS = ((9.6, 6.8), (14.4, 9.2))
_CAMERA_LENS_CENTER = (12.0, 12.0)
_CAMERA_LENS_RADIUS = 2.1


def _scaled(
    point: Tuple[float, float], tip_x: float, tip_y: float, scale: float
) -> "fitz.Point":
    vx, vy = point
    tip_vx, tip_vy = _VIEWBOX_TIP
    return fitz.Point(tip_x + (vx - tip_vx) * scale, tip_y + (vy - tip_vy) * scale)


def draw_waypoint_pin(
    page: "fitz.Page", tip_x: float, tip_y: float, height: float
) -> "fitz.Rect":
    """Draw the pin with its tip at (tip_x, tip_y); return its bounding rect
    (useful for sizing the hyperlink hitbox around the visible pin)."""
    scale = height / _VIEWBOX_HEIGHT
    stroke_width = _VIEWBOX_STROKE_WIDTH * scale

    def p(point: Tuple[float, float]) -> "fitz.Point":
        return _scaled(point, tip_x, tip_y, scale)

    def rect(corners: Tuple[Tuple[float, float], Tuple[float, float]]) -> "fitz.Rect":
        (x0, y0), (x1, y1) = (p(corners[0]), p(corners[1]))
        return fitz.Rect(x0, y0, x1, y1)

    shape = page.new_shape()
    shape.draw_bezier(p((12, 1)), p((6.477, 1)), p((2, 5.477)), p((2, 11)))
    shape.draw_bezier(p((2, 11)), p((2, 18.732)), p((12, 31)), p((12, 31)))
    shape.draw_bezier(p((12, 31)), p((12, 31)), p((22, 18.732)), p((22, 11)))
    shape.draw_bezier(p((22, 11)), p((22, 5.477)), p((17.523, 1)), p((12, 1)))
    shape.finish(
        color=PIN_STROKE_COLOR,
        fill=PIN_FILL_COLOR,
        width=stroke_width,
        closePath=True,
    )

    # Camera glyph: white body + viewfinder bump, then the primary-color lens
    # on top, mirroring WAYPOINT_PIN_SVG's layering.
    shape.draw_rect(rect(_CAMERA_BODY_CORNERS))
    shape.draw_rect(rect(_CAMERA_BUMP_CORNERS))
    shape.finish(color=None, fill=PIN_STROKE_COLOR)

    lens_center = p(_CAMERA_LENS_CENTER)
    lens_radius = _CAMERA_LENS_RADIUS * scale
    shape.draw_circle(lens_center, lens_radius)
    shape.finish(color=None, fill=PIN_FILL_COLOR)

    shape.commit()

    half_width = _VIEWBOX_HALF_WIDTH * scale
    top_y = tip_y - _VIEWBOX_TOP_MARGIN * scale
    return fitz.Rect(tip_x - half_width, top_y, tip_x + half_width, tip_y)
