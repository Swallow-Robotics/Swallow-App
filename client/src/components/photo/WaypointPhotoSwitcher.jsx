import React, { useEffect, useRef, useState } from 'react';
import { formatMonthDayYear } from '../../utils/dateTime';

const segmentBase = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-primary)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-semibold)',
  padding: 'var(--space-xs) var(--space-sm)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 34,
};

/**
 * Same-waypoint photo switcher: |<<< |< | date | > | >>>|
 * `orderedPhotos` is sorted oldest -> newest.
 */
const WaypointPhotoSwitcher = ({ orderedPhotos, currentId, onSelect }) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const index = orderedPhotos.findIndex(p => p.photo_id === currentId);
  const current = orderedPhotos[index];
  const isOldest = index <= 0;
  const isNewest = index < 0 || index >= orderedPhotos.length - 1;

  const goTo = photo => {
    if (photo && photo.photo_id !== currentId) onSelect(photo.photo_id);
    setOpen(false);
  };

  const renderButton = (label, ariaLabel, disabled, onClick, extraStyle) => (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...segmentBase,
        ...extraStyle,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={menuRef}
      style={{
        display: 'inline-flex',
        position: 'relative',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'visible',
      }}
    >
      <div style={{ display: 'inline-flex', borderRadius: 'var(--radius-lg)' }}>
        {renderButton(
          '«',
          'Oldest photo',
          isOldest,
          () => goTo(orderedPhotos[0]),
          {
            borderTopLeftRadius: 'var(--radius-lg)',
            borderBottomLeftRadius: 'var(--radius-lg)',
            borderRight: 'none',
          },
        )}
        {renderButton(
          '‹',
          'Older photo',
          isOldest,
          () => goTo(orderedPhotos[index - 1]),
          {
            borderRight: 'none',
          },
        )}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            ...segmentBase,
            minWidth: 110,
            gap: 'var(--space-xs)',
          }}
        >
          {current ? formatMonthDayYear(current.taken_at) : '—'}
          <span style={{ fontSize: 10 }}>▾</span>
        </button>
        {renderButton(
          '›',
          'Newer photo',
          isNewest,
          () => goTo(orderedPhotos[index + 1]),
          {
            borderLeft: 'none',
          },
        )}
        {renderButton(
          '»',
          'Newest photo',
          isNewest,
          () => goTo(orderedPhotos[orderedPhotos.length - 1]),
          {
            borderTopRightRadius: 'var(--radius-lg)',
            borderBottomRightRadius: 'var(--radius-lg)',
            borderLeft: 'none',
          },
        )}
      </div>

      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--space-xs))',
            left: 0,
            minWidth: '100%',
            maxHeight: 280,
            overflowY: 'auto',
            background: 'var(--color-surface-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 20,
            padding: 'var(--space-xs) 0',
          }}
        >
          {[...orderedPhotos].reverse().map(photo => {
            const isCurrent = photo.photo_id === currentId;
            return (
              <button
                key={photo.photo_id}
                type="button"
                onClick={() => goTo(photo)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: isCurrent
                    ? 'var(--color-surface-active)'
                    : 'transparent',
                  color: isCurrent
                    ? 'var(--color-primary-dark)'
                    : 'var(--color-text-primary)',
                  fontWeight: isCurrent
                    ? 'var(--font-weight-bold)'
                    : 'var(--font-weight-regular)',
                  fontSize: 'var(--font-size-sm)',
                  padding: 'var(--space-xs) var(--space-md)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatMonthDayYear(photo.taken_at)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default WaypointPhotoSwitcher;
