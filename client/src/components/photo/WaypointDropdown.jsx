import React, { useEffect, useRef, useState } from 'react';

/**
 * Waypoint selector. `waypoints` is a list of { waypoint_id, waypoint_name }
 * already sorted alphabetically. Selecting one switches the active waypoint.
 */
const WaypointDropdown = ({ waypoints, currentWaypointId, onSelect }) => {
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

  const current = waypoints.find(w => w.waypoint_id === currentWaypointId);

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-primary)',
          color: 'var(--color-text-primary)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-semibold)',
          padding: 'var(--space-xs) var(--space-sm)',
          height: 34,
          minWidth: 140,
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
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
          {current ? current.waypoint_name || 'Unnamed waypoint' : '—'}
        </span>
        <span style={{ fontSize: 10 }}>▾</span>
      </button>

      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + var(--space-xs))',
            right: 0,
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
          {waypoints.map(waypoint => {
            const isCurrent = waypoint.waypoint_id === currentWaypointId;
            return (
              <button
                key={waypoint.waypoint_id}
                type="button"
                onClick={() => {
                  if (!isCurrent) onSelect(waypoint.waypoint_id);
                  setOpen(false);
                }}
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
                {waypoint.waypoint_name || 'Unnamed waypoint'}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default WaypointDropdown;
