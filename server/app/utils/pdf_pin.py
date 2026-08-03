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


def _ellipse_points(
    cx: float,
    cy: float,
    rx: float,
    ry: float,
    start_deg: float,
    end_deg: float,
    segments: int = 16,
) -> List[Tuple[float, float]]:
    span = end_deg - start_deg
    return [
        (
            cx + rx * math.cos(math.radians(start_deg + span * (i / segments))),
            cy + ry * math.sin(math.radians(start_deg + span * (i / segments))),
        )
        for i in range(segments + 1)
    ]


def _draw_camera_360_icon(
    shape: "fitz.Shape", cx: float, cy: float, scale: float, fill_color: Tuple[float, float, float]
) -> None:
    """Camera + elliptical orbit arrow — keep in sync with waypointMarkerIcons.js."""
    origin_y = cy - scale * 0.06

    body_w = scale * 1.15
    body_h = scale * 0.58
    body_top = origin_y - scale * 0.42
    body_left = cx - body_w / 2

    bump_w = scale * 0.38
    bump_h = scale * 0.2
    bump_left = body_left + scale * 0.12
    bump_top = body_top - bump_h + scale * 0.06

    lens_cx = cx - scale * 0.06
    lens_cy = body_top + body_h / 2
    lens_outer = scale * 0.2
    lens_inner = scale * 0.1

    flash_r = scale * 0.055
    flash_cx = cx + scale * 0.38
    flash_cy = lens_cy - scale * 0.02

    body_rect = fitz.Rect(body_left, body_top, body_left + body_w, body_top + body_h)
    bump_rect = fitz.Rect(bump_left, bump_top, bump_left + bump_w, bump_top + bump_h)
    # PyMuPDF draw_rect doesn't support rx; rounded look is approximate via rects.
    shape.draw_rect(body_rect)
    shape.draw_rect(bump_rect)
    shape.finish(color=None, fill=MARKER_STROKE_COLOR)

    shape.draw_circle(fitz.Point(lens_cx, lens_cy), lens_outer)
    shape.finish(color=None, fill=MARKER_STROKE_COLOR)
    shape.draw_circle(fitz.Point(lens_cx, lens_cy), lens_inner)
    shape.finish(color=None, fill=fill_color)

    shape.draw_circle(fitz.Point(flash_cx, flash_cy), flash_r)
    shape.finish(color=None, fill=MARKER_STROKE_COLOR)

    orbit_cy = origin_y + scale * 0.48
    orbit_rx = scale * 0.48
    orbit_ry = scale * 0.18
    points = _ellipse_points(cx, orbit_cy, orbit_rx, orbit_ry, 200, 20, 18)
    for start, end in zip(points, points[1:]):
        shape.draw_line(fitz.Point(*start), fitz.Point(*end))
    shape.finish(
        color=MARKER_STROKE_COLOR,
        width=max(1.1, scale * 0.11),
        closePath=False,
    )

    tip, prev = points[-1], points[-2]
    dx, dy = tip[0] - prev[0], tip[1] - prev[1]
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    perp_x, perp_y = -uy, ux
    arrow_size = scale * 0.2
    base_x = tip[0] + ux * scale * 0.02
    base_y = tip[1] + uy * scale * 0.02
    arrow_points = [
        fitz.Point(base_x + ux * arrow_size * 0.75, base_y + uy * arrow_size * 0.75),
        fitz.Point(base_x - perp_x * arrow_size * 0.55, base_y - perp_y * arrow_size * 0.55),
        fitz.Point(base_x + perp_x * arrow_size * 0.55, base_y + perp_y * arrow_size * 0.55),
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

    icon_scale = radius * (0.72 if capture_method == "drone" else 0.78)
    if capture_method == "drone":
        _draw_drone_icon(shape, center_x, center_y, icon_scale, fill_color)
    else:
        _draw_camera_360_icon(shape, center_x, center_y, icon_scale, fill_color)

    shape.commit()

    return fitz.Rect(
        center_x - radius, center_y - radius, center_x + radius, center_y + radius
    )
