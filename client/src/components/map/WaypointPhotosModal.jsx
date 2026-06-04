import React from 'react';
import { formatMonthDayYear } from '../../utils/dateTime';

/** Fixed preview height so every card is identical regardless of photo count. */
const THUMBNAIL_IMAGE_HEIGHT = 260;

/**
 * Modal listing every photo for a waypoint, most recent first. Clicking a
 * thumbnail opens the photo viewer. No download actions are exposed here.
 */
const WaypointPhotosModal = ({ open, waypoint, onClose, onPhotoClick }) => {
  if (!open || !waypoint) return null;

  const photos = waypoint.photos || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-body"
        style={{
          maxWidth: 560,
          width: '96%',
          maxHeight: 'min(90vh, 800px)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          padding: 'var(--space-lg)',
          boxSizing: 'border-box',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          style={{
            position: 'absolute',
            top: 'var(--space-sm)',
            right: 'var(--space-sm)',
            background: 'none',
            border: 'none',
            fontSize: '1.2em',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            lineHeight: 1,
            zIndex: 1,
          }}
        >
          ✕
        </button>

        <h3
          className="modal-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-xs)',
            width: '100%',
            flexShrink: 0,
            margin: '0 0 var(--space-md) 0',
            paddingLeft: 'var(--space-xl)',
            paddingRight: 'var(--space-xl)',
            boxSizing: 'border-box',
          }}
        >
          <span className="App-subnav__projectLabel">Waypoint</span>
          <span className="App-subnav__projectName">
            {waypoint.waypoint_name || 'Unnamed waypoint'}
          </span>
        </h3>

        {!photos.length ? (
          <p className="page-empty">No photos for this waypoint.</p>
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-md)',
              paddingRight: 'var(--space-xs)',
            }}
          >
            {photos.map(photo => (
              <button
                type="button"
                key={photo.photo_id}
                onClick={() => onPhotoClick(photo)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  flexShrink: 0,
                  flexGrow: 0,
                  padding: 0,
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  background: 'var(--color-surface-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: THUMBNAIL_IMAGE_HEIGHT,
                    minHeight: THUMBNAIL_IMAGE_HEIGHT,
                    maxHeight: THUMBNAIL_IMAGE_HEIGHT,
                    flexShrink: 0,
                    overflow: 'hidden',
                    background: 'var(--color-surface-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <img
                    src={photo.thumbnail_r2_url || photo.r2_url}
                    alt={waypoint.waypoint_name || 'Photo'}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                    onError={e => {
                      if (photo.r2_url && e.target.src !== photo.r2_url) {
                        e.target.src = photo.r2_url;
                      } else {
                        e.target.style.display = 'none';
                      }
                    }}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    width: '100%',
                    padding: 'var(--space-sm)',
                    borderTop: '1px solid var(--color-border)',
                    background: 'var(--color-surface-primary)',
                    boxSizing: 'border-box',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-semibold)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {photo.taken_at
                      ? formatMonthDayYear(photo.taken_at)
                      : 'Date unknown'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WaypointPhotosModal;
