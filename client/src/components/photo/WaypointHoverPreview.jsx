import React from 'react';

const PREVIEW_SIZE = 96;

/**
 * Lightweight floating thumbnail shown while hovering a Public Link waypoint
 * marker on the drawing or map. Expects the newest photo's thumbnail URL.
 */
const WaypointHoverPreview = ({ visible, src, label, style }) => {
  if (!visible || !src) return null;

  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        zIndex: 20,
        width: PREVIEW_SIZE,
        pointerEvents: 'none',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)',
        background: 'var(--color-surface-primary)',
        ...style,
      }}
    >
      <img
        src={src}
        alt={label || 'Waypoint preview'}
        style={{
          display: 'block',
          width: PREVIEW_SIZE,
          height: PREVIEW_SIZE,
          objectFit: 'cover',
        }}
      />
    </div>
  );
};

export default WaypointHoverPreview;
export { PREVIEW_SIZE };
