import React, { useEffect } from 'react';

/**
 * Positioned popup container for the Plan waypoint/add-waypoint context
 * menus, matching the pattern used by PhotosPage's floating menus.
 */
const FloatingMenu = ({ screenX, screenY, onClose, children, width = 200 }) => {
  useEffect(() => {
    const close = () => onClose();
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: screenY,
        left: screenX,
        zIndex: 1100,
        background: 'var(--color-surface-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        width,
        padding: 'var(--space-sm)',
        overflow: 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
};

export default FloatingMenu;
