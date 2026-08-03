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

const ellipsePoints = (cx, cy, rx, ry, startDeg, endDeg, segments = 16) => {
  const span = endDeg - startDeg;
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = ((startDeg + (span * i) / segments) * Math.PI) / 180;
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
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
  const nose = `<circle cx="${cx}" cy="${(cy - bodyH * 0.42).toFixed(2)}" r="${(scale * 0.08).toFixed(2)}" fill="${FILL_COLORS.drone}"/>`;

  return arms + rotorRings + body + nose;
};

/**
 * 360 camera glyph matched to a clear camera-plus-orbit reference: solid
 * camera body with a top-left viewfinder, ring lens, flash dot, and a flat
 * elliptical rotation arrow underneath (not a cramped circular hook).
 */
const camera360IconMarkup = (cx, cy, scale, fillColor) => {
  // Shift the whole glyph slightly up so camera + orbit both fit the circle.
  const originY = cy - scale * 0.06;

  const bodyW = scale * 1.15;
  const bodyH = scale * 0.58;
  const bodyTop = originY - scale * 0.42;
  const bodyLeft = cx - bodyW / 2;
  const rx = scale * 0.1;

  // Viewfinder sits on the top-left of the body (reference silhouette).
  const bumpW = scale * 0.38;
  const bumpH = scale * 0.2;
  const bumpLeft = bodyLeft + scale * 0.12;
  const bumpTop = bodyTop - bumpH + scale * 0.06;

  const lensCx = cx - scale * 0.06;
  const lensCy = bodyTop + bodyH / 2;
  const lensOuter = scale * 0.2;
  const lensInner = scale * 0.1;

  const flashR = scale * 0.055;
  const flashCx = cx + scale * 0.38;
  const flashCy = lensCy - scale * 0.02;

  const body = `<rect x="${bodyLeft.toFixed(2)}" y="${bodyTop.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${bodyH.toFixed(2)}" rx="${rx.toFixed(2)}" fill="${ICON_COLOR}"/>`;
  const bump = `<rect x="${bumpLeft.toFixed(2)}" y="${bumpTop.toFixed(2)}" width="${bumpW.toFixed(2)}" height="${bumpH.toFixed(2)}" rx="${(rx * 0.7).toFixed(2)}" fill="${ICON_COLOR}"/>`;
  // Ring lens: white outer disc with marker-color hole (reads as a lens).
  const lensOuterCircle = `<circle cx="${lensCx.toFixed(2)}" cy="${lensCy.toFixed(2)}" r="${lensOuter.toFixed(2)}" fill="${ICON_COLOR}"/>`;
  const lensHole = `<circle cx="${lensCx.toFixed(2)}" cy="${lensCy.toFixed(2)}" r="${lensInner.toFixed(2)}" fill="${fillColor}"/>`;
  const flash = `<circle cx="${flashCx.toFixed(2)}" cy="${flashCy.toFixed(2)}" r="${flashR.toFixed(2)}" fill="${ICON_COLOR}"/>`;

  // Perspective / elliptical orbit arrow under the camera (wide, flat).
  const orbitCy = originY + scale * 0.48;
  const orbitRx = scale * 0.48;
  const orbitRy = scale * 0.18;
  // Open ellipse so the arrowhead on the right reads clearly.
  const points = ellipsePoints(cx, orbitCy, orbitRx, orbitRy, 200, 20, 18);
  const arcPath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  const strokeW = Math.max(1.1, scale * 0.11);
  const arc = `<path d="${arcPath}" fill="none" stroke="${ICON_COLOR}" stroke-width="${strokeW.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;

  const [tipX, tipY] = points[points.length - 1];
  const [prevX, prevY] = points[points.length - 2];
  const dx = tipX - prevX;
  const dy = tipY - prevY;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const perpX = -uy;
  const perpY = ux;
  const arrowSize = scale * 0.2;
  // Pull the head slightly past the tip so it doesn't melt into the stroke.
  const baseX = tipX + ux * scale * 0.02;
  const baseY = tipY + uy * scale * 0.02;
  const p1 = [baseX + ux * arrowSize * 0.75, baseY + uy * arrowSize * 0.75];
  const p2 = [baseX - perpX * arrowSize * 0.55, baseY - perpY * arrowSize * 0.55];
  const p3 = [baseX + perpX * arrowSize * 0.55, baseY + perpY * arrowSize * 0.55];
  const arrow = `<polygon points="${[p1, p2, p3].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}" fill="${ICON_COLOR}"/>`;

  return body + bump + lensOuterCircle + lensHole + flash + arc + arrow;
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
  const iconScale = captureMethod === 'drone' ? RADIUS * 0.72 : RADIUS * 0.78;
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
