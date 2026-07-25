import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Waypoint action options.
 * Values must match the waypoint_action enum in Supabase.
 */
const WAYPOINT_ACTIONS = [
  { value: 'none', label: 'None' },
  { value: 'photo_45', label: '45 Photo' },
  { value: 'photo_90', label: '90 Photo' },
  { value: 'photo_360', label: '360 Photo' },
];

const MAX_WAYPOINTS = 50;

/** Spreadsheet-style default names: A–Z, then AA, AB, ... */
function waypointLetter(index) {
  let label = '';
  let i = index;
  do {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return label;
}

let _localIdCounter = 0;
const nextLocalId = () => ++_localIdCounter;

function makeGhost(letter) {
  return {
    localId: nextLocalId(),
    waypoint_id: null,
    waypoint_name: letter,
    action: 'none',
    alt: '',
    lat: '',
    lng: '',
    isGhost: true,
  };
}

function buildInitialWaypoints(existingWaypoints) {
  if (!existingWaypoints?.length) {
    return [makeGhost(waypointLetter(0))];
  }
  const active = existingWaypoints.map(wp => ({
    localId: nextLocalId(),
    waypoint_id: wp.waypoint_id || null,
    waypoint_name: wp.waypoint_name || '',
    action: wp.action || 'none',
    alt: wp.alt != null ? String(wp.alt) : '',
    lat: wp.lat != null ? String(wp.lat) : '',
    lng: wp.lng != null ? String(wp.lng) : '',
    isGhost: false,
  }));
  if (active.length < MAX_WAYPOINTS) {
    active.push(makeGhost(waypointLetter(active.length)));
  }
  return active;
}

const PlanFormModal = ({ open, onClose, onSubmit, initialPlan, mode, error }) => {
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [waypoints, setWaypoints] = useState([]);
  const [formError, setFormError] = useState('');
  const dragSrcIndex = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFormError('');
    setPlanName(initialPlan?.plan_name || '');
    setPlanDescription(initialPlan?.plan_description || '');
    setWaypoints(buildInitialWaypoints(initialPlan?.waypoints));
  }, [open, initialPlan]);

  const deleteWaypoint = useCallback(localId => {
    setWaypoints(prev => {
      const filtered = prev.filter(wp => wp.localId !== localId);
      const hasGhost = filtered.some(wp => wp.isGhost);
      const activeCount = filtered.filter(wp => !wp.isGhost).length;
      if (!hasGhost && activeCount < MAX_WAYPOINTS) {
        return [...filtered, makeGhost(waypointLetter(activeCount))];
      }
      return filtered;
    });
  }, []);

  const handleDragStart = useCallback((e, activeIndex) => {
    dragSrcIndex.current = activeIndex;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback(e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e, targetIndex) => {
    e.preventDefault();
    const src = dragSrcIndex.current;
    if (src === null || src === targetIndex) return;
    setWaypoints(prev => {
      const active = prev.filter(wp => !wp.isGhost);
      const ghost = prev.find(wp => wp.isGhost);
      const reordered = [...active];
      const [moved] = reordered.splice(src, 1);
      reordered.splice(targetIndex, 0, moved);
      return ghost ? [...reordered, ghost] : reordered;
    });
    dragSrcIndex.current = null;
  }, []);

  if (!open) return null;

  const activeWaypoints = waypoints.filter(wp => !wp.isGhost);

  const activateGhost = (localId, field, value) => {
    setWaypoints(prev => {
      const idx = prev.findIndex(wp => wp.localId === localId);
      if (idx === -1) return prev;
      const updated = prev.map((wp, i) =>
        i === idx ? { ...wp, [field]: value, isGhost: false } : wp
      );
      const newActiveCount = updated.filter(wp => !wp.isGhost).length;
      if (newActiveCount < MAX_WAYPOINTS && !updated.some(wp => wp.isGhost)) {
        return [...updated, makeGhost(waypointLetter(newActiveCount))];
      }
      return updated;
    });
  };

  const updateActive = (localId, field, value) => {
    setWaypoints(prev =>
      prev.map(wp => (wp.localId === localId ? { ...wp, [field]: value } : wp))
    );
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!planName.trim()) {
      setFormError('Plan name is required.');
      return;
    }
    const actives = waypoints.filter(wp => !wp.isGhost);
    const incomplete = actives.some(
      wp => wp.alt === '' || wp.lat === '' || wp.lng === ''
    );
    if (incomplete) {
      setFormError('Waypoint information incomplete.');
      return;
    }
    setFormError('');
    onSubmit({
      planName: planName.trim(),
      planDescription: planDescription.trim() || null,
      waypoints: actives.map((wp, i) => ({
        waypoint_id: wp.waypoint_id || null,
        waypoint_name: wp.waypoint_name,
        action: wp.action,
        alt: parseFloat(wp.alt),
        lat: parseFloat(wp.lat),
        lng: parseFloat(wp.lng),
        sequence: i + 1,
      })),
    });
  };

  const displayError = formError || error;

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay">
      <div
        className="modal-body"
        style={{
          maxWidth: 780,
          width: '96%',
          position: 'relative',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <button
          type="button"
          onClick={onClose}
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
          }}
          aria-label="Close modal"
        >
          ✕
        </button>
        <h3 className="modal-header">{mode === 'edit' ? 'Edit Plan' : 'Create Plan'}</h3>
        {displayError ? (
          <p
            style={{
              color: '#9B4A2F',
              margin: '0 0 var(--space-sm) 0',
              fontSize: '0.9em',
            }}
          >
            {displayError}
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="modal-form">
          <label className="form-label">
            Plan Name (required)
            <input
              type="text"
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              required
              className="form-input"
            />
          </label>
          <label className="form-label">
            Plan Description (optional)
            <input
              type="text"
              value={planDescription}
              onChange={e => setPlanDescription(e.target.value)}
              className="form-input"
            />
          </label>

          <div style={{ marginTop: 'var(--space-md)', overflowX: 'auto' }}>
            <table
              className="data-table"
              style={{ minWidth: 620, tableLayout: 'fixed', fontSize: '0.85em' }}
            >
              <colgroup>
                <col style={{ width: 34 }} />
                <col style={{ width: 24 }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: 34 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Seq</th>
                  <th />
                  <th>Waypoint</th>
                  <th>Action</th>
                  <th>Alt (ft AGL)</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {waypoints.map((wp, _i) => {
                  const activeIndex = activeWaypoints.findIndex(
                    a => a.localId === wp.localId
                  );
                  const seq = wp.isGhost ? '' : activeIndex + 1;
                  const opacity = wp.isGhost ? 0.4 : 1;

                  const onChange = (field, value) => {
                    if (wp.isGhost) {
                      activateGhost(wp.localId, field, value);
                    } else {
                      updateActive(wp.localId, field, value);
                    }
                  };

                  return (
                    <tr
                      key={wp.localId}
                      style={{ opacity }}
                      draggable={!wp.isGhost}
                      onDragStart={
                        !wp.isGhost
                          ? e => handleDragStart(e, activeIndex)
                          : undefined
                      }
                      onDrop={
                        !wp.isGhost ? e => handleDrop(e, activeIndex) : undefined
                      }
                      onDragOver={!wp.isGhost ? handleDragOver : undefined}
                    >
                      <td
                        style={{
                          textAlign: 'center',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {seq}
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          color: 'var(--color-text-secondary)',
                          cursor: wp.isGhost ? 'default' : 'grab',
                          userSelect: 'none',
                        }}
                      >
                        {wp.isGhost ? '' : '≡'}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={wp.waypoint_name}
                          maxLength={25}
                          onChange={e => onChange('waypoint_name', e.target.value)}
                          className="form-input"
                          style={{ width: '100%', padding: '2px 4px' }}
                        />
                      </td>
                      <td>
                        <select
                          value={wp.action}
                          onChange={e => onChange('action', e.target.value)}
                          className="form-select"
                          style={{ width: '100%', padding: '2px 20px 2px 4px' }}
                        >
                          {WAYPOINT_ACTIONS.map(a => (
                            <option key={a.value} value={a.value}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          value={wp.alt}
                          step="any"
                          onChange={e => onChange('alt', e.target.value)}
                          className="form-input"
                          style={{ width: '100%', padding: '2px 4px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={wp.lat}
                          step="any"
                          onChange={e => onChange('lat', e.target.value)}
                          className="form-input"
                          style={{ width: '100%', padding: '2px 4px' }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={wp.lng}
                          step="any"
                          onChange={e => onChange('lng', e.target.value)}
                          className="form-input"
                          style={{ width: '100%', padding: '2px 4px' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {!wp.isGhost ? (
                          <button
                            type="button"
                            onClick={() => deleteWaypoint(wp.localId)}
                            className="btn-secondary btn-icon-sm"
                            title="Delete waypoint"
                            style={{ fontSize: '0.78em' }}
                          >
                            ✕
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PlanFormModal;
