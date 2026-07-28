import React, { useState } from 'react';
import FloatingMenu from './FloatingMenu';

/**
 * Right-click menu for an existing waypoint marker (map or drawing) or table
 * row: lets the user type an exact Lat/Lng or delete the waypoint.
 */
const WaypointContextMenu = ({
  screenX,
  screenY,
  lat,
  lng,
  onSave,
  onDelete,
  onClose,
}) => {
  const [latValue, setLatValue] = useState(lat != null ? String(lat) : '');
  const [lngValue, setLngValue] = useState(lng != null ? String(lng) : '');

  const handleSave = () => {
    const latNum = parseFloat(latValue);
    const lngNum = parseFloat(lngValue);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return;
    onSave(latNum, lngNum);
    onClose();
  };

  return (
    <FloatingMenu
      screenX={screenX}
      screenY={screenY}
      onClose={onClose}
      width={220}
    >
      <label className="form-label" style={{ marginBottom: 'var(--space-xs)' }}>
        Latitude
        <input
          type="number"
          step="any"
          className="form-input"
          value={latValue}
          onChange={(e) => setLatValue(e.target.value)}
          style={{ padding: '4px 8px' }}
        />
      </label>
      <label className="form-label" style={{ marginBottom: 'var(--space-sm)' }}>
        Longitude
        <input
          type="number"
          step="any"
          className="form-input"
          value={lngValue}
          onChange={(e) => setLngValue(e.target.value)}
          style={{ padding: '4px 8px' }}
        />
      </label>
      <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
        <button
          type="button"
          className="btn-primary"
          style={{ flex: 1, padding: 'var(--space-xs)' }}
          onClick={handleSave}
        >
          Save
        </button>
        <button
          type="button"
          className="btn-critical"
          style={{ flex: 1, padding: 'var(--space-xs)' }}
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    </FloatingMenu>
  );
};

export default WaypointContextMenu;
