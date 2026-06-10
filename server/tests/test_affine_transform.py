import importlib.util
from pathlib import Path

_affine_path = Path(__file__).resolve().parents[1] / "app" / "utils" / "affine_transform.py"
_spec = importlib.util.spec_from_file_location("affine_transform", _affine_path)
_affine = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_affine)

compute_affine_from_control_points = _affine.compute_affine_from_control_points


def _make_points(geo_points, a=100.0, b=50.0, c=1000.0, d=80.0, e=60.0, f=2000.0):
    points = []
    for lat, lng in geo_points:
        pixel_x = a * lng + b * lat + c
        pixel_y = d * lng + e * lat + f
        points.append(
            {
                "pixel_x": pixel_x,
                "pixel_y": pixel_y,
                "latitude": lat,
                "longitude": lng,
            }
        )
    return points


def _residuals(coeffs, points):
    residuals = []
    for point in points:
        x = (
            coeffs["transform_a"] * point["longitude"]
            + coeffs["transform_b"] * point["latitude"]
            + coeffs["transform_c"]
        )
        y = (
            coeffs["transform_d"] * point["longitude"]
            + coeffs["transform_e"] * point["latitude"]
            + coeffs["transform_f"]
        )
        residuals.append((x - point["pixel_x"], y - point["pixel_y"]))
    return residuals


GEO_POINTS = [
    (40.475157, -79.963420),
    (40.473582, -79.962599),
    (40.475543, -79.960251),
    (40.473835, -79.960288),
]


def test_three_point_affine_is_exact():
    points = _make_points(GEO_POINTS[:3])
    coeffs = compute_affine_from_control_points(points)

    assert abs(coeffs["transform_a"] - 100.0) < 1e-6
    assert abs(coeffs["transform_b"] - 50.0) < 1e-6
    assert abs(coeffs["transform_c"] - 1000.0) < 1e-3
    assert abs(coeffs["transform_d"] - 80.0) < 1e-6
    assert abs(coeffs["transform_e"] - 60.0) < 1e-6
    assert abs(coeffs["transform_f"] - 2000.0) < 1e-3

    for dx, dy in _residuals(coeffs, points):
        assert abs(dx) < 1e-6
        assert abs(dy) < 1e-6


def test_four_point_affine_matches_three_point_solution():
    points = _make_points(GEO_POINTS)
    coeffs = compute_affine_from_control_points(points)

    assert abs(coeffs["transform_a"] - 100.0) < 1e-6
    assert abs(coeffs["transform_b"] - 50.0) < 1e-6
    assert abs(coeffs["transform_c"] - 1000.0) < 1e-3
    assert abs(coeffs["transform_d"] - 80.0) < 1e-6
    assert abs(coeffs["transform_e"] - 60.0) < 1e-6
    assert abs(coeffs["transform_f"] - 2000.0) < 1e-3

    for dx, dy in _residuals(coeffs, points):
        assert abs(dx) < 1e-6
        assert abs(dy) < 1e-6
