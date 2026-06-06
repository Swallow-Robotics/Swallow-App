"""
Affine transformation utilities for drawing georeferencing.

Geo (lng, lat) → pixel (x, y):
  x = a * lng + b * lat + c
  y = d * lng + e * lat + f
"""

from typing import Dict, List, Sequence, Tuple


class AffineTransformError(Exception):
    """Raised when an affine transform cannot be computed."""


def _solve_linear_system_3x3(
    rows: Sequence[Tuple[float, float, float, float]],
) -> Tuple[float, float, float]:
    """
    Solve a 3×3 linear system via Gaussian elimination.
    Each row is (lng, lat, 1, target).
    """
    matrix = [[lng, lat, 1.0, target] for lng, lat, _, target in rows]
    size = 3

    for col in range(size):
        pivot_row = max(range(col, size), key=lambda r: abs(matrix[r][col]))
        if abs(matrix[pivot_row][col]) < 1e-12:
            raise AffineTransformError(
                "Control points are collinear or insufficient for alignment."
            )
        matrix[col], matrix[pivot_row] = matrix[pivot_row], matrix[col]

        pivot = matrix[col][col]
        for row in range(col + 1, size):
            factor = matrix[row][col] / pivot
            for j in range(col, size + 1):
                matrix[row][j] -= factor * matrix[col][j]

    result = [0.0, 0.0, 0.0]
    for row in reversed(range(size)):
        value = matrix[row][size]
        for col in range(row + 1, size):
            value -= matrix[row][col] * result[col]
        result[row] = value / matrix[row][row]

    return result[0], result[1], result[2]


def _solve_least_squares(
    rows: Sequence[Tuple[float, float, float, float]],
) -> Tuple[float, float, float]:
    """Solve overdetermined system A·x = b using normal equations (3×3)."""
    ata = [[0.0] * 3 for _ in range(3)]
    atb = [0.0, 0.0, 0.0]

    for lng, lat, _, target in rows:
        vec = [lng, lat, 1.0]
        for i in range(3):
            atb[i] += vec[i] * target
            for j in range(3):
                ata[i][j] += vec[i] * vec[j]

    normal_rows = [
        (ata[0][0], ata[0][1], ata[0][2], atb[0]),
        (ata[1][0], ata[1][1], ata[1][2], atb[1]),
        (ata[2][0], ata[2][1], ata[2][2], atb[2]),
    ]
    return _solve_linear_system_3x3(normal_rows)


def compute_affine_from_control_points(
    control_points: Sequence[Dict],
) -> Dict[str, float]:
    """
    Compute affine coefficients from control points with pixel_x, pixel_y,
    latitude, longitude fields.
    """
    if len(control_points) < 3:
        raise AffineTransformError("At least 3 control points are required.")

    x_rows = []
    y_rows = []
    for pt in control_points:
        lng = float(pt["longitude"])
        lat = float(pt["latitude"])
        px = float(pt["pixel_x"])
        py = float(pt["pixel_y"])
        x_rows.append((lng, lat, 1.0, px))
        y_rows.append((lng, lat, 1.0, py))

    a, b, c = (
        _solve_linear_system_3x3(x_rows)
        if len(x_rows) == 3
        else _solve_least_squares(x_rows)
    )
    d, e, f = (
        _solve_linear_system_3x3(y_rows)
        if len(y_rows) == 3
        else _solve_least_squares(y_rows)
    )

    return {
        "transform_a": a,
        "transform_b": b,
        "transform_c": c,
        "transform_d": d,
        "transform_e": e,
        "transform_f": f,
    }
