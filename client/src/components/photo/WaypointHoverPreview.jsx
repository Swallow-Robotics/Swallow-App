import React from 'react';

/** Matches Public Link waypoint modal scale more closely. */
export const PREVIEW_WIDTH = 260;
export const PREVIEW_IMAGE_HEIGHT = 180;
/** Approx. footer bar height used for vertical centering offsets. */
export const PREVIEW_LABEL_HEIGHT = 36;
export const PREVIEW_CARD_HEIGHT = PREVIEW_IMAGE_HEIGHT + PREVIEW_LABEL_HEIGHT;
/** @deprecated Prefer PREVIEW_CARD_HEIGHT — kept for existing imports. */
export const PREVIEW_SIZE = PREVIEW_CARD_HEIGHT;

/**
 * Floating newest-photo sneak peek shown while hovering a Public Link
 * waypoint marker on the drawing or map. Full frame uses contain on a pale
 * feather field; waypoint name sits under the image.
 */
const WaypointHoverPreview = ({ visible, src, label, style }) => {
  if (!visible || !src) return null;

  return (
    <div
      role="tooltip"
      style={{
        position: 'absolute',
        zIndex: 20,
        width: PREVIEW_WIDTH,
        pointerEvents: 'none',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)',
        background: 'var(--color-surface-primary)',
        ...style,
      }}
    >
      <div
        style={{
          width: '100%',
          height: PREVIEW_IMAGE_HEIGHT,
          background: 'var(--color-surface-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <img
          src={src}
          alt={label || 'Waypoint preview'}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: PREVIEW_LABEL_HEIGHT,
          padding: 'var(--space-sm) var(--space-md)',
          borderTop: '1px solid var(--color-border)',
          boxSizing: 'border-box',
          background: 'var(--color-surface-primary)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-deep-plumage-blue)',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }}
        >
          {label || 'Waypoint'}
        </span>
      </div>
    </div>
  );
};

export default WaypointHoverPreview;
