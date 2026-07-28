import React from 'react';
import FloatingMenu from './FloatingMenu';

/** Right-click menu for an empty area of the map/drawing: add a waypoint there. */
const AddWaypointContextMenu = ({ screenX, screenY, onAdd, onClose }) => (
  <FloatingMenu
    screenX={screenX}
    screenY={screenY}
    onClose={onClose}
    width={160}
  >
    <button
      type="button"
      className="btn-menu-item"
      style={{ padding: 'var(--space-xs) var(--space-sm)' }}
      onClick={() => {
        onAdd();
        onClose();
      }}
    >
      Add Waypoint
    </button>
  </FloatingMenu>
);

export default AddWaypointContextMenu;
