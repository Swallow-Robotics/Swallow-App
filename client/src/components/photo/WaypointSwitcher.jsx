import React, { useEffect, useRef, useState } from 'react';

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
 * Waypoint switcher for the Public Link photo view:
 * |<<< |< | name | > | >>>|
 * `orderedWaypoints` is already sorted for the capture method.
 */
const WaypointSwitcher = ({
  orderedWaypoints,
  currentWaypointId,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) setHoveredId(null);
  }, [open]);

  const index = orderedWaypoints.findIndex(
    (wp) => wp.waypoint_id === currentWaypointId
  );
  const current = orderedWaypoints[index];
  const isFirst = index <= 0;
  const isLast = index < 0 || index >= orderedWaypoints.length - 1;

  const goTo = (waypoint) => {
    if (waypoint && waypoint.waypoint_id !== currentWaypointId) {
      onSelect(waypoint);
    }
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

  if (!orderedWaypoints.length) return null;

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
          'First waypoint',
          isFirst,
          () => goTo(orderedWaypoints[0]),
          {
            borderTopLeftRadius: 'var(--radius-lg)',
            borderBottomLeftRadius: 'var(--radius-lg)',
            borderRight: 'none',
          }
        )}
        {renderButton(
          '‹',
          'Previous waypoint',
          isFirst,
          () => goTo(orderedWaypoints[index - 1]),
          {
            borderRight: 'none',
          }
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            ...segmentBase,
            minWidth: 110,
            maxWidth: 180,
            gap: 'var(--space-xs)',
          }}
        >
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {current?.waypoint_name || '—'}
          </span>
          <span style={{ fontSize: 10 }}>▾</span>
        </button>
        {renderButton(
          '›',
          'Next waypoint',
          isLast,
          () => goTo(orderedWaypoints[index + 1]),
          {
            borderLeft: 'none',
          }
        )}
        {renderButton(
          '»',
          'Last waypoint',
          isLast,
          () => goTo(orderedWaypoints[orderedWaypoints.length - 1]),
          {
            borderTopRightRadius: 'var(--radius-lg)',
            borderBottomRightRadius: 'var(--radius-lg)',
            borderLeft: 'none',
          }
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
          {orderedWaypoints.map((waypoint) => {
            const isCurrent = waypoint.waypoint_id === currentWaypointId;
            const isHovered = !isCurrent && waypoint.waypoint_id === hoveredId;
            return (
              <button
                key={waypoint.waypoint_id}
                type="button"
                onClick={() => goTo(waypoint)}
                onMouseEnter={() => setHoveredId(waypoint.waypoint_id)}
                onMouseLeave={() =>
                  setHoveredId((id) =>
                    id === waypoint.waypoint_id ? null : id
                  )
                }
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: isCurrent
                    ? 'var(--color-surface-active)'
                    : isHovered
                      ? 'var(--color-surface-hover)'
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
                {waypoint.waypoint_name || 'Waypoint'}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default WaypointSwitcher;
