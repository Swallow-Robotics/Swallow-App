/**
 * Circle waypoint marker used by the public Photos Link viewer (drawing +
 * map), sized/colored by capture method to match the PyMuPDF markers drawn
 * for PDF export (see server/app/utils/pdf_pin.py — keep the two in sync).
 * Authenticated Photos page markers (WaypointMarker) are a separate,
 * unrelated pin shape and are not affected by this module.
 *
 * Colors are hardcoded hex (not CSS variables) so MapLibre marker DOM and
 * PDF stay consistent regardless of stylesheet context.
 */

const VIEW_SIZE = 32;
const CENTER = VIEW_SIZE / 2;
const RADIUS = CENTER - 2;
const STROKE_WIDTH_RATIO = 0.07;

const FILL_COLORS = {
  drone: '#1f3a5f', // --color-deep-plumage-blue
  '360_camera': '#3f6fa0', // --color-mid-sky-blue
};

const ICON_COLOR = '#ffffff';
const STROKE_COLOR = '#ffffff';

const arcPoints = (cx, cy, r, startDeg, endDeg, segments = 12) => {
  const span = endDeg - startDeg;
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = ((startDeg + (span * i) / segments) * Math.PI) / 180;
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return points;
};

/**
 * Top-down quadcopter: central fuselage, four arms, and open rotor rings
 * with a simple propeller cross — reads clearly as a drone at small sizes.
 */
const droneIconMarkup = (cx, cy, scale) => {
  const armLen = scale * 0.55;
  const rotorOuter = scale * 0.28;
  const rotorInner = scale * 0.1;
  const armStroke = Math.max(1.2, scale * 0.14);
  const bladeStroke = Math.max(1, scale * 0.1);
  const bodyW = scale * 0.42;
  const bodyH = scale * 0.55;

  const rotors = [
    [cx - armLen, cy - armLen],
    [cx + armLen, cy - armLen],
    [cx - armLen, cy + armLen],
    [cx + armLen, cy + armLen],
  ];

  const arms = rotors
    .map(
      ([x, y]) =>
        `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${ICON_COLOR}" stroke-width="${armStroke.toFixed(2)}" stroke-linecap="round"/>`,
    )
    .join('');

  const rotorRings = rotors
    .map(([x, y]) => {
      const px = x.toFixed(2);
      const py = y.toFixed(2);
      return (
        `<circle cx="${px}" cy="${py}" r="${rotorOuter.toFixed(2)}" fill="none" stroke="${ICON_COLOR}" stroke-width="${bladeStroke.toFixed(2)}"/>` +
        `<line x1="${(x - rotorOuter * 0.7).toFixed(2)}" y1="${py}" x2="${(x + rotorOuter * 0.7).toFixed(2)}" y2="${py}" stroke="${ICON_COLOR}" stroke-width="${bladeStroke.toFixed(2)}" stroke-linecap="round"/>` +
        `<line x1="${px}" y1="${(y - rotorOuter * 0.7).toFixed(2)}" x2="${px}" y2="${(y + rotorOuter * 0.7).toFixed(2)}" stroke="${ICON_COLOR}" stroke-width="${bladeStroke.toFixed(2)}" stroke-linecap="round"/>` +
        `<circle cx="${px}" cy="${py}" r="${rotorInner.toFixed(2)}" fill="${ICON_COLOR}"/>`
      );
    })
    .join('');

  const body = `<rect x="${(cx - bodyW / 2).toFixed(2)}" y="${(cy - bodyH / 2).toFixed(2)}" width="${bodyW.toFixed(2)}" height="${bodyH.toFixed(2)}" rx="${(bodyW * 0.35).toFixed(2)}" fill="${ICON_COLOR}"/>`;
  // Small nose mark so orientation reads at a glance
  const nose = `<circle cx="${cx}" cy="${(cy - bodyH * 0.42).toFixed(2)}" r="${(scale * 0.08).toFixed(2)}" fill="${FILL_COLORS.drone}"/>`;

  return arms + rotorRings + body + nose;
};

/** Camera body + lens (cut out in the marker fill color) with a circular
 * arrow beneath it, reading roughly as a 360 camera. */
const camera360IconMarkup = (cx, cy, scale, fillColor) => {
  const bodyTop = cy - scale * 0.55;
  const bodyW = scale * 1.05;
  const bodyH = scale * 0.62;
  const bumpW = scale * 0.46;
  const bumpH = scale * 0.22;
  const lensRadius = scale * 0.18;
  const lensCy = bodyTop + bodyH / 2;

  const bodyRect = `<rect x="${(cx - bodyW / 2).toFixed(2)}" y="${bodyTop.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${bodyH.toFixed(2)}" rx="${(scale * 0.12).toFixed(2)}" fill="${ICON_COLOR}"/>`;
  const bumpRect = `<rect x="${(cx - bumpW / 2).toFixed(2)}" y="${(bodyTop - bumpH + scale * 0.05).toFixed(2)}" width="${bumpW.toFixed(2)}" height="${bumpH.toFixed(2)}" rx="${(scale * 0.06).toFixed(2)}" fill="${ICON_COLOR}"/>`;
  const lens = `<circle cx="${cx}" cy="${lensCy.toFixed(2)}" r="${lensRadius.toFixed(2)}" fill="${fillColor}"/>`;

  const arcCy = cy + scale * 0.32;
  const arcRadius = scale * 0.32;
  const points = arcPoints(cx, arcCy, arcRadius, -30, 260);
  const arcPath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  const arcStrokeWidth = scale * 0.1;
  const arc = `<path d="${arcPath}" fill="none" stroke="${ICON_COLOR}" stroke-width="${arcStrokeWidth.toFixed(2)}" stroke-linecap="round"/>`;

  const [tipX, tipY] = points[points.length - 1];
  const [prevX, prevY] = points[points.length - 2];
  const dx = tipX - prevX;
  const dy = tipY - prevY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const perpX = -uy;
  const perpY = ux;
  const arrowSize = scale * 0.22;
  const p1 = [tipX + ux * arrowSize * 0.6, tipY + uy * arrowSize * 0.6];
  const p2 = [tipX - perpX * arrowSize * 0.55, tipY - perpY * arrowSize * 0.55];
  const p3 = [tipX + perpX * arrowSize * 0.55, tipY + perpY * arrowSize * 0.55];
  const arrow = `<polygon points="${[p1, p2, p3].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="${ICON_COLOR}"/>`;

  return bodyRect + bumpRect + lens + arc + arrow;
};

/** Default on-screen size (px) for the circle marker in interactive views. */
export const WAYPOINT_MARKER_SIZE = { width: 28, height: 28 };

/**
 * Builds the circle waypoint marker SVG markup for a capture method: a
 * filled circle with a white border, sized/anchored at its center, and a
 * simple white icon (drone, or camera-with-circular-arrow for 360_camera).
 */
export function buildCircleMarkerSvg(captureMethod, { width, height } = {}) {
  const fillColor = FILL_COLORS[captureMethod] || FILL_COLORS['360_camera'];
  const strokeWidth = RADIUS * 2 * STROKE_WIDTH_RATIO;
  const iconScale = RADIUS * 0.72;
  const icon =
    captureMethod === 'drone'
      ? droneIconMarkup(CENTER, CENTER, iconScale)
      : camera360IconMarkup(CENTER, CENTER, iconScale, fillColor);
  const w = width || WAYPOINT_MARKER_SIZE.width;
  const h = height || WAYPOINT_MARKER_SIZE.height;

  return (
    `<svg width="${w}" height="${h}" viewBox="0 0 ${VIEW_SIZE} ${VIEW_SIZE}" fill="none" aria-hidden="true">` +
    `<circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="${fillColor}" stroke="${STROKE_COLOR}" stroke-width="${strokeWidth.toFixed(2)}"/>` +
    icon +
    `</svg>`
  );
}
