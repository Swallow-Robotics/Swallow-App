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
        `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${ICON_COLOR}" stroke-width="${armStroke.toFixed(2)}" stroke-linecap="round"/>`
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
 * Crystal-clear 360 camera at marker size: a large, obvious camera silhouette
 * (body + viewfinder + ring lens) with bold "360" text underneath. Tiny arc
 * ornaments were reading as a smile and have been removed on purpose.
 */
const camera360IconMarkup = (cx, cy, scale, fillColor) => {
  const bodyW = scale * 1.4;
  const bodyH = scale * 0.78;
  const bodyTop = cy - scale * 0.72;
  const bodyLeft = cx - bodyW / 2;
  const corner = scale * 0.12;

  const bumpW = scale * 0.42;
  const bumpH = scale * 0.22;
  const bumpLeft = cx - bumpW / 2;
  const bumpTop = bodyTop - bumpH + scale * 0.05;

  const lensCx = cx;
  const lensCy = bodyTop + bodyH / 2;
  const lensOuter = scale * 0.28;
  const lensInner = scale * 0.14;

  const body = `<rect x="${bodyLeft.toFixed(2)}" y="${bodyTop.toFixed(2)}" width="${bodyW.toFixed(2)}" height="${bodyH.toFixed(2)}" rx="${corner.toFixed(2)}" fill="${ICON_COLOR}"/>`;
  const bump = `<rect x="${bumpLeft.toFixed(2)}" y="${bumpTop.toFixed(2)}" width="${bumpW.toFixed(2)}" height="${bumpH.toFixed(2)}" rx="${(corner * 0.6).toFixed(2)}" fill="${ICON_COLOR}"/>`;
  const lens = `<circle cx="${lensCx.toFixed(2)}" cy="${lensCy.toFixed(2)}" r="${lensOuter.toFixed(2)}" fill="${ICON_COLOR}"/>`;
  const lensHole = `<circle cx="${lensCx.toFixed(2)}" cy="${lensCy.toFixed(2)}" r="${lensInner.toFixed(2)}" fill="${fillColor}"/>`;

  const labelY = cy + scale * 0.78;
  const fontSize = scale * 0.58;
  const label =
    `<text x="${cx}" y="${labelY.toFixed(2)}" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.toFixed(2)}" ` +
    `font-weight="700" fill="${ICON_COLOR}" letter-spacing="0.5">360</text>`;

  return body + bump + lens + lensHole + label;
};

/** Default on-screen size (px) for the circle marker in interactive views. */
export const WAYPOINT_MARKER_SIZE = { width: 30, height: 30 };

/** Compact size for the Public Link photo-view mini map. */
export const WAYPOINT_MARKER_SIZE_MINI = { width: 18, height: 18 };

/** Active-waypoint highlight on the mini map (project pin / --color-accent). */
export const WAYPOINT_MARKER_ACTIVE_FILL = '#9b4a2f';

/**
 * Builds the circle waypoint marker SVG markup for a capture method: a
 * filled circle with a white border, sized/anchored at its center, and a
 * simple white icon (drone, or camera + "360" for 360_camera).
 * Optional `fillColor` overrides the capture-method fill (e.g. active highlight).
 */
export function buildCircleMarkerSvg(
  captureMethod,
  { width, height, fillColor: fillOverride } = {}
) {
  const fillColor =
    fillOverride || FILL_COLORS[captureMethod] || FILL_COLORS['360_camera'];
  const strokeWidth = RADIUS * 2 * STROKE_WIDTH_RATIO;
  const iconScale = captureMethod === 'drone' ? RADIUS * 0.72 : RADIUS * 0.82;
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
