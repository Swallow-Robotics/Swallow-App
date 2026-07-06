import React from 'react';
import HlsVideoPlayer from './HlsVideoPlayer';

const HEADER_HEIGHT = 44;

const BaseStationVideoModal = ({ baseStation, onClose }) => {
  if (!baseStation) return null;

  const displayName =
    baseStation.bs_name ||
    baseStation.bs_serial_number ||
    baseStation.bs_model ||
    'Base Station';

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
          width: `min(96vw, calc((92vh - ${HEADER_HEIGHT}px) * 16 / 9))`,
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
            height: HEADER_HEIGHT,
            boxSizing: 'border-box',
            padding: '0 var(--space-md)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h6 style={{ margin: 0 }}>{displayName}</h6>
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
        <HlsVideoPlayer
          src={baseStation.video_url}
          controls
          autoPlay
          playsInline
          objectFit="contain"
          style={{ width: '100%', aspectRatio: '16 / 9' }}
        />
      </div>
    </div>
  );
};

export default BaseStationVideoModal;
