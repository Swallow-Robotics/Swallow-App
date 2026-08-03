"""
Draws a Barn Swallow waypoint marker on a PyMuPDF page — a circle, centered
on the waypoint, with a white border and a simple white icon, matching the
public Photos Link viewer's markers (SimpleWaypointMarker /
addSimpleWaypointMarkersToMap). PyMuPDF cannot read CSS variables, so the
brand colors are hardcoded here to match --color-deep-plumage-blue
(#1f3a5f, drone) and --color-mid-sky-blue (#3f6fa0, 360_camera).
"""

import math
from typing import List, Tuple

import fitz  # PyMuPDF

DRONE_FILL_COLOR: Tuple[float, float, float] = (0x1F / 255, 0x3A / 255, 0x5F / 255)
CAMERA_FILL_COLOR: Tuple[float, float, float] = (0x3F / 255, 0x6F / 255, 0xA0 / 255)
MARKER_STROKE_COLOR: Tuple[float, float, float] = (1.0, 1.0, 1.0)
MARKER_STROKE_WIDTH_RATIO = 0.07


def _fill_color_for(capture_method: str) -> Tuple[float, float, float]:
    return DRONE_FILL_COLOR if capture_method == "drone" else CAMERA_FILL_COLOR


def _arc_points(
    cx: float, cy: float, r: float, start_deg: float, end_deg: float, segments: int = 12
) -> List[Tuple[float, float]]:
    span = end_deg - start_deg
    return [
        (
            cx + r * math.cos(math.radians(start_deg + span * (i / segments))),
            cy + r * math.sin(math.radians(start_deg + span * (i / segments))),
        )
        for i in range(segments + 1)
    ]


def _draw_drone_icon(
    shape: "fitz.Shape", cx: float, cy: float, scale: float, fill_color: Tuple[float, float, float]
) -> None:
    """Top-down quadcopter: fuselage, four arms, open rotor rings with a
    propeller cross — keep in sync with waypointMarkerIcons.js."""
    arm_len = scale * 0.55
    rotor_outer = scale * 0.28
    rotor_inner = scale * 0.1
    arm_stroke = max(1.2, scale * 0.14)
    blade_stroke = max(1.0, scale * 0.1)
    body_w = scale * 0.42
    body_h = scale * 0.55

    rotors = (
        (cx - arm_len, cy - arm_len),
        (cx + arm_len, cy - arm_len),
        (cx - arm_len, cy + arm_len),
        (cx + arm_len, cy + arm_len),
    )

    for rx, ry in rotors:
        shape.draw_line(fitz.Point(cx, cy), fitz.Point(rx, ry))
    shape.finish(color=MARKER_STROKE_COLOR, width=arm_stroke, closePath=False)

    for rx, ry in rotors:
        shape.draw_circle(fitz.Point(rx, ry), rotor_outer)
    shape.finish(color=MARKER_STROKE_COLOR, fill=None, width=blade_stroke, closePath=True)

    for rx, ry in rotors:
        shape.draw_line(
            fitz.Point(rx - rotor_outer * 0.7, ry),
            fitz.Point(rx + rotor_outer * 0.7, ry),
        )
        shape.draw_line(
            fitz.Point(rx, ry - rotor_outer * 0.7),
            fitz.Point(rx, ry + rotor_outer * 0.7),
        )
    shape.finish(color=MARKER_STROKE_COLOR, width=blade_stroke, closePath=False)

    for rx, ry in rotors:
        shape.draw_circle(fitz.Point(rx, ry), rotor_inner)
    shape.finish(color=None, fill=MARKER_STROKE_COLOR)

    body_rect = fitz.Rect(cx - body_w / 2, cy - body_h / 2, cx + body_w / 2, cy + body_h / 2)
    shape.draw_rect(body_rect)
    shape.finish(color=None, fill=MARKER_STROKE_COLOR)

    shape.draw_circle(fitz.Point(cx, cy - body_h * 0.42), scale * 0.08)
    shape.finish(color=None, fill=fill_color)


def _draw_camera_360_icon(
    shape: "fitz.Shape", cx: float, cy: float, scale: float, fill_color: Tuple[float, float, float]
) -> None:
    """Camera body + lens (white, lens cut out in the marker's fill color)
    with a circular arrow beneath it, reading roughly as a 360 camera."""
    body_top = cy - scale * 0.55
    body_w, body_h = scale * 1.05, scale * 0.62
    body_rect = fitz.Rect(cx - body_w / 2, body_top, cx + body_w / 2, body_top + body_h)
    bump_w, bump_h = scale * 0.46, scale * 0.22
    bump_rect = fitz.Rect(
        cx - bump_w / 2,
        body_top - bump_h + scale * 0.05,
        cx + bump_w / 2,
        body_top + scale * 0.05,
    )
    shape.draw_rect(body_rect)
    shape.draw_rect(bump_rect)
    shape.finish(color=None, fill=MARKER_STROKE_COLOR)

    lens_center = fitz.Point(cx, body_top + body_h / 2)
    shape.draw_circle(lens_center, scale * 0.18)
    shape.finish(color=None, fill=fill_color)

    arc_cy = cy + scale * 0.32
    arc_radius = scale * 0.32
    points = _arc_points(cx, arc_cy, arc_radius, -30, 260)
    for start, end in zip(points, points[1:]):
        shape.draw_line(fitz.Point(*start), fitz.Point(*end))
    shape.finish(color=MARKER_STROKE_COLOR, width=scale * 0.1, closePath=False)

    tip, prev = points[-1], points[-2]
    dx, dy = tip[0] - prev[0], tip[1] - prev[1]
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    perp_x, perp_y = -uy, ux
    arrow_size = scale * 0.22
    arrow_points = [
        fitz.Point(tip[0] + ux * arrow_size * 0.6, tip[1] + uy * arrow_size * 0.6),
        fitz.Point(tip[0] - perp_x * arrow_size * 0.55, tip[1] - perp_y * arrow_size * 0.55),
        fitz.Point(tip[0] + perp_x * arrow_size * 0.55, tip[1] + perp_y * arrow_size * 0.55),
    ]
    shape.draw_polyline(arrow_points)
    shape.finish(color=None, fill=MARKER_STROKE_COLOR, closePath=True)


def draw_waypoint_marker(
    page: "fitz.Page", center_x: float, center_y: float, diameter: float, capture_method: str
) -> "fitz.Rect":
    """Draw a circular waypoint marker centered at (center_x, center_y):
    filled with the capture method's Barn Swallow color, a white border, and
    a simple white icon (drone, or camera-with-circular-arrow for
    360_camera). Returns the marker's bounding rect (used to size the
    hyperlink hitbox around the visible marker)."""
    radius = diameter / 2
    fill_color = _fill_color_for(capture_method)
    stroke_width = diameter * MARKER_STROKE_WIDTH_RATIO

    shape = page.new_shape()
    shape.draw_circle(fitz.Point(center_x, center_y), radius)
    shape.finish(color=MARKER_STROKE_COLOR, fill=fill_color, width=stroke_width, closePath=True)

    icon_scale = radius * 0.72
    if capture_method == "drone":
        _draw_drone_icon(shape, center_x, center_y, icon_scale, fill_color)
    else:
        _draw_camera_360_icon(shape, center_x, center_y, icon_scale, fill_color)

    shape.commit()

    return fitz.Rect(
        center_x - radius, center_y - radius, center_x + radius, center_y + radius
    )
