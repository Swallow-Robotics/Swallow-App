import React from 'react';
import HlsVideoPlayer from './HlsVideoPlayer';

// Near-fullscreen playback of a single dock's HLS stream.
const DockVideoModal = ({ dock, onClose }) => {
  if (!dock) return null;

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
          width: '96vw',
          maxWidth: 1600,
          height: '92vh',
          maxHeight: 'none',
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            padding: 'var(--space-sm) var(--space-md)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h6 style={{ margin: 0 }}>
            {dock.dock_identifier || dock.dock_model || 'Dock'}
          </h6>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close video"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 'var(--font-size-xl)',
              lineHeight: 1,
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              padding: 'var(--space-xs)',
            }}
          >
            ×
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: '#000' }}>
          <HlsVideoPlayer
            src={dock.video_url}
            controls
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      </div>
    </div>
  );
};

export default DockVideoModal;
