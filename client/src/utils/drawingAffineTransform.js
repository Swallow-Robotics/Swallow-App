/**
 * Client-side geo → pixel conversion using stored affine coefficients.
 * lng/lat → pixel (x, y):
 *   x = transform_a * lng + transform_b * lat + transform_c
 *   y = transform_d * lng + transform_e * lat + transform_f
 */

export function isDrawingAligned(drawing) {
  if (!drawing?.aligned) return false;
  const keys = [
    'transform_a',
    'transform_b',
    'transform_c',
    'transform_d',
    'transform_e',
    'transform_f',
  ];
  return keys.every(k => Number.isFinite(Number(drawing[k])));
}

export function geoToPixel(drawing, lat, lng) {
  if (!isDrawingAligned(drawing)) return null;
  const a = Number(drawing.transform_a);
  const b = Number(drawing.transform_b);
  const c = Number(drawing.transform_c);
  const d = Number(drawing.transform_d);
  const e = Number(drawing.transform_e);
  const f = Number(drawing.transform_f);
  const x = a * lng + b * lat + c;
  const y = d * lng + e * lat + f;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function waypointsToPixelPositions(drawing, waypoints) {
  if (!isDrawingAligned(drawing)) return [];
  return (waypoints || [])
    .map(wp => {
      const pos = geoToPixel(drawing, wp.lat, wp.lng);
      if (!pos) return null;
      return { ...wp, pixelX: pos.x, pixelY: pos.y };
    })
    .filter(Boolean);
}
