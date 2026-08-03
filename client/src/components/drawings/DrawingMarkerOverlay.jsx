import React from 'react';
import { buildCircleMarkerSvg, WAYPOINT_MARKER_SIZE } from '../../utils/waypointMarkerIcons';

const WAYPOINT_PIN_SVG =
  '<svg width="34" height="44" viewBox="0 0 24 32" fill="none" aria-hidden="true">' +
  '<path d="M12 1C6.477 1 2 5.477 2 11c0 7.732 10 20 10 20s10-12.268 10-20C22 5.477 17.523 1 12 1z"' +
  ' fill="var(--color-primary)" stroke="var(--color-surface-primary)" stroke-width="1.5"/>' +
  '<rect x="6.5" y="8.5" width="11" height="7" rx="1.6" fill="var(--color-surface-primary)"/>' +
  '<rect x="9.6" y="6.8" width="4.8" height="2.4" rx="0.7" fill="var(--color-surface-primary)"/>' +
  '<circle cx="12" cy="12" r="2.1" fill="var(--color-primary)"/>' +
  '</svg>';

const PROJECT_PIN_SVG =
  '<svg width="30" height="40" viewBox="0 0 24 32" fill="none" aria-hidden="true">' +
  '<path d="M12 1C6.477 1 2 5.477 2 11c0 7.732 10 20 10 20s10-12.268 10-20C22 5.477 17.523 1 12 1z"' +
  ' fill="var(--color-accent)" stroke="var(--color-surface-primary)" stroke-width="1.5"/>' +
  '<circle cx="12" cy="11" r="3.5" fill="var(--color-surface-primary)"/>' +
  '</svg>';

const markerStyle = (pixelX, pixelY, zIndex = 2) => ({
  position: 'absolute',
  left: pixelX,
  top: pixelY,
  transform: 'translate(-50%, -100%)',
  border: 'none',
  background: 'none',
  padding: 0,
  cursor: 'pointer',
  lineHeight: 0,
  zIndex,
  pointerEvents: 'auto',
});

export function ControlPointMarker({
  pixelX,
  pixelY,
  screenX,
  screenY,
  label,
  variant = 'a',
}) {
  const x = screenX ?? pixelX;
  const y = screenY ?? pixelY;
  return (
    <span
      className={`calib-pin-overlay calib-pin-overlay--${variant}`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
      }}
      aria-hidden
    >
      {label}
    </span>
  );
}

export function WaypointMarker({ marker, screenX, screenY, onClick, onContextMenu }) {
  const x = screenX ?? marker.pixelX;
  const y = screenY ?? marker.pixelY;
  const isMoving = !!marker.isMoving;
  return (
    <button
      type="button"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        onClick?.(marker);
      }}
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(marker, e.clientX, e.clientY);
      }}
      aria-label={marker.waypoint_name || 'Waypoint'}
      style={{
        ...markerStyle(x, y),
        width: 34,
        height: 44,
        filter: isMoving
          ? 'drop-shadow(0 0 8px var(--color-accent)) drop-shadow(0 2px 6px rgba(31,58,95,0.35))'
          : 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))',
        opacity: isMoving ? 0.7 : 1,
        transition: 'filter 0.15s, opacity 0.15s',
      }}
    >
      <span
        style={{ display: 'block', lineHeight: 0 }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: WAYPOINT_PIN_SVG }}
      />
    </button>
  );
}

/**
 * Read-only marker for the public Photos Link drawing view: a circle, white
 * border, colored/iconed by capture method (see waypointMarkerIcons.js).
 * Center-anchored (not tip-anchored like the authenticated pin).
 *
 * pointerdown is NOT stopPropagated — the gesture plane sits underneath and
 * owns pan/pinch; we only stop click so a marker tap does not also count as
 * an empty-canvas click.
 */
export function SimpleWaypointMarker({ marker, screenX, screenY, onClick, captureMethod }) {
  const x = screenX ?? marker.pixelX;
  const y = screenY ?? marker.pixelY;
  const { width, height } = WAYPOINT_MARKER_SIZE;
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onClick?.(marker);
      }}
      aria-label={marker.waypoint_name || 'Waypoint'}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        // translate3d + no CSS filter: iOS Safari leaves "drag mark" trails
        // when filter:drop-shadow is applied to markers that reposition every pan frame.
        transform: 'translate3d(-50%, -50%, 0)',
        border: 'none',
        background: 'none',
        padding: 0,
        cursor: 'pointer',
        lineHeight: 0,
        zIndex: 2,
        pointerEvents: 'auto',
        width,
        height,
        borderRadius: '50%',
        boxShadow: '0 2px 6px rgba(31,58,95,0.35)',
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
        touchAction: 'none',
      }}
    >
      <span
        style={{ display: 'block', lineHeight: 0 }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: buildCircleMarkerSvg(captureMethod, { width, height }) }}
      />
    </button>
  );
}

export function ProjectMarker({ pixelX, pixelY, screenX, screenY, name, onClick }) {
  const x = screenX ?? pixelX;
  const y = screenY ?? pixelY;
  return (
    <button
      type="button"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={name || 'Project location'}
      title={name || 'Project location'}
      style={{
        ...markerStyle(x, y, 3),
        width: 30,
        height: 40,
        filter: 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))',
      }}
    >
      <span
        style={{ display: 'block', lineHeight: 0 }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: PROJECT_PIN_SVG }}
      />
    </button>
  );
}
