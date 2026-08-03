"""
Draws a Barn Swallow waypoint marker on a PyMuPDF page — a circle, centered
on the waypoint, with a white border and a simple white icon, matching the
public Photos Link viewer's markers (SimpleWaypointMarker /
addSimpleWaypointMarkersToMap). PyMuPDF cannot read CSS variables, so the
brand colors are hardcoded here to match --color-deep-plumage-blue
(#1f3a5f, drone) and --color-mid-sky-blue (#3f6fa0, 360_camera).
"""

import math
from typing import Tuple

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


def _draw_camera_body(
    shape: "fitz.Shape", cx: float, cy: float, scale: float, fill_color: Tuple[float, float, float]
) -> None:
    """Large obvious camera silhouette — keep in sync with waypointMarkerIcons.js."""
    body_w = scale * 1.4
    body_h = scale * 0.78
    body_top = cy - scale * 0.72
    body_left = cx - body_w / 2

    bump_w = scale * 0.42
    bump_h = scale * 0.22
    bump_left = cx - bump_w / 2
    bump_top = body_top - bump_h + scale * 0.05

    lens_cx = cx
    lens_cy = body_top + body_h / 2
    lens_outer = scale * 0.28
    lens_inner = scale * 0.14

    shape.draw_rect(fitz.Rect(body_left, body_top, body_left + body_w, body_top + body_h))
    shape.draw_rect(fitz.Rect(bump_left, bump_top, bump_left + bump_w, bump_top + bump_h))
    shape.finish(color=None, fill=MARKER_STROKE_COLOR)

    shape.draw_circle(fitz.Point(lens_cx, lens_cy), lens_outer)
    shape.finish(color=None, fill=MARKER_STROKE_COLOR)
    shape.draw_circle(fitz.Point(lens_cx, lens_cy), lens_inner)
    shape.finish(color=None, fill=fill_color)


def draw_waypoint_marker(
    page: "fitz.Page", center_x: float, center_y: float, diameter: float, capture_method: str
) -> "fitz.Rect":
    """Draw a circular waypoint marker centered at (center_x, center_y):
    filled with the capture method's Barn Swallow color, a white border, and
    a simple white icon (drone, or camera + "360" for 360_camera). Returns
    the marker's bounding rect (used to size the hyperlink hitbox)."""
    radius = diameter / 2
    fill_color = _fill_color_for(capture_method)
    stroke_width = diameter * MARKER_STROKE_WIDTH_RATIO

    shape = page.new_shape()
    shape.draw_circle(fitz.Point(center_x, center_y), radius)
    shape.finish(color=MARKER_STROKE_COLOR, fill=fill_color, width=stroke_width, closePath=True)

    if capture_method == "drone":
        icon_scale = radius * 0.72
        _draw_drone_icon(shape, center_x, center_y, icon_scale, fill_color)
        shape.commit()
    else:
        icon_scale = radius * 0.82
        _draw_camera_body(shape, center_x, center_y, icon_scale, fill_color)
        shape.commit()
        # Bold centered "360" under the camera — clearest 360 cue at small sizes.
        fontsize = max(4.0, icon_scale * 0.58)
        label_y = center_y + icon_scale * 0.78 + fontsize * 0.35
        font = fitz.Font("helv")
        text_width = font.text_length("360", fontsize=fontsize)
        tw = fitz.TextWriter(page.rect, color=MARKER_STROKE_COLOR)
        tw.append(
            fitz.Point(center_x - text_width / 2, label_y),
            "360",
            font=font,
            fontsize=fontsize,
        )
        tw.write_text(page)

    return fitz.Rect(
        center_x - radius, center_y - radius, center_x + radius, center_y + radius
    )
