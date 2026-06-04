import React, { useEffect, useRef, useState } from 'react';
import { dateLabelFromKey } from '../../utils/dateTime';

/**
 * Date switcher for the Photos date page. `dates` is a list of date keys
 * (YYYY-MM-DD) sorted most recent first. Selecting one navigates to that date.
 */
const DateDropdown = ({ dates, currentKey, onSelect }) => {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface-primary)',
          color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-family-sans)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'var(--font-weight-semibold)',
          padding: 'var(--space-xs) var(--space-md)',
          height: 34,
          minWidth: 180,
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-sm)',
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {currentKey ? dateLabelFromKey(currentKey) : '—'}
        </span>
        <span
          aria-hidden="true"
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1,
          }}
        >
          ▾
        </span>
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
          {dates.map((key) => {
            const isCurrent = key === currentKey;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (!isCurrent) onSelect(key);
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
                  fontFamily: 'var(--font-family-sans)',
                  fontSize: 'var(--font-size-sm)',
                  padding: 'var(--space-xs) var(--space-md)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {dateLabelFromKey(key)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default DateDropdown;
