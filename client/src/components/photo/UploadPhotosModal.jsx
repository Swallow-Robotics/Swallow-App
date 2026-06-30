import React, { useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../../services/api';
import { formatLocalDateTime } from '../../utils/dateTime';
import DateTimePicker from '../common/DateTimePicker';

const MAX_PHOTOS = 50;

let localIdCounter = 0;
const nextLocalId = () => ++localIdCounter;

// ---------------------------------------------------------------------------
// Site plan row helpers (drone-based upload)
// ---------------------------------------------------------------------------
const makeSiteGhostRow = () => ({
  localId: nextLocalId(),
  file: null,
  fileName: '',
  waypointId: '',
  droneAlt: '',
  droneLat: '',
  droneLng: '',
  takenAt: null,
  droneHeading: '',
  gimbalPosition: '',
  isGhost: true,
});

const isSiteRowComplete = row =>
  !!row.file &&
  !!row.waypointId &&
  row.droneAlt !== '' &&
  row.droneLat !== '' &&
  row.droneLng !== '' &&
  !!row.takenAt &&
  row.droneHeading !== '' &&
  row.gimbalPosition !== '';

// ---------------------------------------------------------------------------
// Floor plan row helpers (360-camera upload)
// ---------------------------------------------------------------------------
const makeFloorGhostRow = () => ({
  localId: nextLocalId(),
  file: null,
  fileName: '',
  drawingId: '',
  waypointId: '',
  takenAt: null,
  isGhost: true,
});

const isFloorRowComplete = row =>
  !!row.file && !!row.drawingId && !!row.waypointId && !!row.takenAt;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const UploadPhotosModal = ({ open, projectId, mode, onClose, onUploaded }) => {
  const isFloorPlan = mode === 'floor_plan';

  // Site plan state
  const [flights, setFlights] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedFlightId, setSelectedFlightId] = useState('');
  const [siteRows, setSiteRows] = useState([makeSiteGhostRow()]);

  // Floor plan state
  const [floorDrawings, setFloorDrawings] = useState([]);
  const [floorWaypoints, setFloorWaypoints] = useState([]);
  const [floorRows, setFloorRows] = useState([makeFloorGhostRow()]);

  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputs = useRef({});

  useEffect(() => {
    if (!open || !projectId) return;
    setError('');
    if (isFloorPlan) {
      setFloorRows([makeFloorGhostRow()]);
      setFloorWaypoints([]);
      setFloorDrawings([]);
      // Fetch drawings and all floor waypoints for the project in parallel
      Promise.all([
        apiClient
          .get(`/v1/drawings?project_id=${projectId}&drawing_type=floor_plan`)
          .catch(() => null),
        apiClient
          .get(`/v1/waypoints?project_id=${projectId}`)
          .catch(() => null),
      ]).then(([drwResp, wpResp]) => {
        setFloorDrawings(drwResp?.drawings || []);
        setFloorWaypoints(wpResp?.waypoints || []);
      });
    } else {
      setSelectedFlightId('');
      setSiteRows([makeSiteGhostRow()]);
      Promise.all([
        apiClient.get(`/v1/flights?project_id=${projectId}`).catch(() => null),
        apiClient.get(`/v1/plans?project_id=${projectId}`).catch(() => null),
      ]).then(([flightResp, planResp]) => {
        const completed = (flightResp?.flights || []).filter(
          f => f.flight_status === 'completed',
        );
        setFlights(completed);
        setPlans(planResp?.plans || []);
      });
    }
  }, [open, projectId, isFloorPlan]);

  // Site plan: waypoints driven by selected flight's plan
  const sitePlanWaypoints = useMemo(() => {
    const flight = flights.find(f => f.flight_id === selectedFlightId);
    if (!flight) return [];
    const plan = plans.find(p => p.plan_id === flight.plan_id);
    return plan?.waypoints || [];
  }, [flights, plans, selectedFlightId]);

  // ---------------------------------------------------------------------------
  // Site plan row management
  // ---------------------------------------------------------------------------
  const siteActiveRows = siteRows.filter(r => !r.isGhost);

  const updateSiteRow = (localId, changes) => {
    setSiteRows(prev => {
      let activatedGhost = false;
      const updated = prev.map(row => {
        if (row.localId !== localId) return row;
        const next = { ...row, ...changes };
        if (row.isGhost) {
          next.isGhost = false;
          activatedGhost = true;
        }
        return next;
      });
      if (activatedGhost) {
        const activeCount = updated.filter(r => !r.isGhost).length;
        const hasGhost = updated.some(r => r.isGhost);
        if (!hasGhost && activeCount < MAX_PHOTOS) {
          updated.push(makeSiteGhostRow());
        }
      }
      return updated;
    });
  };

  const removeSiteRow = localId => {
    setSiteRows(prev => {
      const filtered = prev.filter(r => r.localId !== localId);
      const hasGhost = filtered.some(r => r.isGhost);
      const activeCount = filtered.filter(r => !r.isGhost).length;
      if (!hasGhost && activeCount < MAX_PHOTOS) {
        filtered.push(makeSiteGhostRow());
      }
      return filtered.length ? filtered : [makeSiteGhostRow()];
    });
  };

  const handleSiteFile = (localId, fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    updateSiteRow(localId, { file, fileName: file.name });
  };

  // ---------------------------------------------------------------------------
  // Floor plan row management
  // ---------------------------------------------------------------------------
  const floorActiveRows = floorRows.filter(r => !r.isGhost);

  const updateFloorRow = (localId, changes) => {
    setFloorRows(prev => {
      let activatedGhost = false;
      const updated = prev.map(row => {
        if (row.localId !== localId) return row;
        const next = { ...row, ...changes };
        if (row.isGhost) {
          next.isGhost = false;
          activatedGhost = true;
        }
        return next;
      });
      if (activatedGhost) {
        const activeCount = updated.filter(r => !r.isGhost).length;
        const hasGhost = updated.some(r => r.isGhost);
        if (!hasGhost && activeCount < MAX_PHOTOS) {
          updated.push(makeFloorGhostRow());
        }
      }
      return updated;
    });
  };

  const removeFloorRow = localId => {
    setFloorRows(prev => {
      const filtered = prev.filter(r => r.localId !== localId);
      const hasGhost = filtered.some(r => r.isGhost);
      const activeCount = filtered.filter(r => !r.isGhost).length;
      if (!hasGhost && activeCount < MAX_PHOTOS) {
        filtered.push(makeFloorGhostRow());
      }
      return filtered.length ? filtered : [makeFloorGhostRow()];
    });
  };

  const handleFloorFile = (localId, fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    updateFloorRow(localId, { file, fileName: file.name });
  };

  // ---------------------------------------------------------------------------
  // Save handlers
  // ---------------------------------------------------------------------------
  const handleSiteSave = async () => {
    setError('');
    if (!selectedFlightId) {
      setError('Select a flight before uploading.');
      return;
    }
    if (!siteActiveRows.length) {
      setError('Add at least one photo.');
      return;
    }
    if (siteActiveRows.some(row => !isSiteRowComplete(row))) {
      setError('Photo information incomplete');
      return;
    }

    setIsSaving(true);
    try {
      for (const row of siteActiveRows) {
        const formData = new FormData();
        formData.append('file', row.file);
        formData.append('flight_id', selectedFlightId);
        formData.append('waypoint_id', row.waypointId);
        formData.append('drone_alt', row.droneAlt);
        formData.append('drone_lat', row.droneLat);
        formData.append('drone_lng', row.droneLng);
        formData.append('taken_at', row.takenAt);
        formData.append('drone_heading', row.droneHeading);
        formData.append('gimbal_position', row.gimbalPosition);
        formData.append('capture_method', 'drone');
        // eslint-disable-next-line no-await-in-loop
        await apiClient.request('/v1/photos/manual-upload', {
          method: 'POST',
          body: formData,
        });
      }
      if (onUploaded) onUploaded();
      onClose();
    } catch (err) {
      setError(err?.payload?.error || err?.message || 'Upload failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFloorSave = async () => {
    setError('');
    if (!floorActiveRows.length) {
      setError('Add at least one photo.');
      return;
    }
    if (floorActiveRows.some(row => !isFloorRowComplete(row))) {
      setError('Photo information incomplete');
      return;
    }

    setIsSaving(true);
    try {
      for (const row of floorActiveRows) {
        const formData = new FormData();
        formData.append('file', row.file);
        formData.append('project_id', projectId);
        formData.append('waypoint_id', row.waypointId);
        formData.append('taken_at', row.takenAt);
        // eslint-disable-next-line no-await-in-loop
        await apiClient.request('/v1/photos/floor-upload', {
          method: 'POST',
          body: formData,
        });
      }
      if (onUploaded) onUploaded();
      onClose();
    } catch (err) {
      setError(err?.payload?.error || err?.message || 'Upload failed.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  // ---------------------------------------------------------------------------
  // Render — floor plan mode
  // ---------------------------------------------------------------------------
  if (isFloorPlan) {
    return (
      <div role="dialog" aria-modal="true" className="modal-overlay">
        <div
          className="modal-body"
          style={{
            maxWidth: 860,
            width: '96%',
            maxHeight: 'calc(100vh - 4rem)',
            overflowY: 'auto',
            position: 'relative',
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

          <h3 className="modal-header">Upload 360° Photos</h3>

          {error ? (
            <p
              style={{
                color: '#9B4A2F',
                margin: '0 0 var(--space-sm) 0',
                fontSize: '0.9em',
              }}
            >
              {error}
            </p>
          ) : null}

          <div style={{ marginTop: 'var(--space-md)', overflowX: 'auto' }}>
            <table
              className="data-table"
              style={{
                minWidth: 640,
                tableLayout: 'fixed',
                fontSize: '0.82em',
              }}
            >
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: '24%' }} />
                <col style={{ width: 30 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Photo File</th>
                  <th>Drawing</th>
                  <th>Waypoint</th>
                  <th>Time</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {floorRows.map(row => {
                  const rowWaypoints = floorWaypoints.filter(
                    wp => wp.drawing_id === row.drawingId,
                  );
                  return (
                    <tr
                      key={row.localId}
                      style={{ opacity: row.isGhost ? 0.4 : 1 }}
                    >
                      <td>
                        <input
                          ref={el => {
                            fileInputs.current[row.localId] = el;
                          }}
                          type="file"
                          accept="image/jpeg,image/png"
                          style={{ display: 'none' }}
                          onChange={e =>
                            handleFloorFile(row.localId, e.target.files)
                          }
                        />
                        <button
                          type="button"
                          className="btn-secondary btn-choose-file"
                          onClick={() =>
                            fileInputs.current[row.localId]?.click()
                          }
                        >
                          {row.fileName || 'Choose file'}
                        </button>
                      </td>
                      <td>
                        <select
                          value={row.drawingId}
                          onChange={e =>
                            updateFloorRow(row.localId, {
                              drawingId: e.target.value,
                              waypointId: '',
                            })
                          }
                          className="form-select"
                          style={{ width: '100%', padding: '2px 4px' }}
                        >
                          <option value="">—</option>
                          {floorDrawings.map(d => (
                            <option key={d.drawing_id} value={d.drawing_id}>
                              {d.drawing_name || d.drawing_id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={row.waypointId}
                          onChange={e =>
                            updateFloorRow(row.localId, {
                              waypointId: e.target.value,
                            })
                          }
                          className="form-select"
                          style={{ width: '100%', padding: '2px 4px' }}
                          disabled={!row.drawingId}
                        >
                          <option value="">—</option>
                          {rowWaypoints.map(wp => (
                            <option
                              key={wp.waypoint_id}
                              value={wp.waypoint_id}
                            >
                              {wp.waypoint_name || wp.waypoint_id}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <DateTimePicker
                          value={row.takenAt}
                          onChange={iso =>
                            updateFloorRow(row.localId, { takenAt: iso })
                          }
                          compact
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {!row.isGhost ? (
                          <button
                            type="button"
                            onClick={() => removeFloorRow(row.localId)}
                            className="btn-secondary btn-icon-sm"
                            title="Remove photo"
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
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFloorSave}
              className="btn-primary"
              disabled={isSaving}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — site plan mode (original layout, unchanged)
  // ---------------------------------------------------------------------------
  return (
    <div role="dialog" aria-modal="true" className="modal-overlay">
      <div
        className="modal-body"
        style={{
          maxWidth: 1100,
          width: '96%',
          maxHeight: 'calc(100vh - 4rem)',
          overflowY: 'auto',
          position: 'relative',
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

        <h3 className="modal-header">Upload Photos</h3>

        {error ? (
          <p
            style={{
              color: '#9B4A2F',
              margin: '0 0 var(--space-sm) 0',
              fontSize: '0.9em',
            }}
          >
            {error}
          </p>
        ) : null}

        <label className="form-label" style={{ maxWidth: 420 }}>
          Flight
          <select
            value={selectedFlightId}
            onChange={e => setSelectedFlightId(e.target.value)}
            className="form-select"
          >
            <option value="">— select flight —</option>
            {flights.map(flight => (
              <option key={flight.flight_id} value={flight.flight_id}>
                {`${flight.plan_name || 'Plan'} - ${formatLocalDateTime(
                  flight.takeoff_time,
                )}`}
              </option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: 'var(--space-md)', overflowX: 'auto' }}>
          <table
            className="data-table"
            style={{
              minWidth: 980,
              tableLayout: 'fixed',
              fontSize: '0.82em',
            }}
          >
            <colgroup>
              <col style={{ width: '16%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '24%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: 30 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Photo File</th>
                <th>Waypoint</th>
                <th>Drone Altitude</th>
                <th>Drone Latitude</th>
                <th>Drone Longitude</th>
                <th>Time</th>
                <th>Drone Heading</th>
                <th>Gimbal Position</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {siteRows.map(row => (
                <tr
                  key={row.localId}
                  style={{ opacity: row.isGhost ? 0.4 : 1 }}
                >
                  <td>
                    <input
                      ref={el => {
                        fileInputs.current[row.localId] = el;
                      }}
                      type="file"
                      accept="image/jpeg,image/png"
                      style={{ display: 'none' }}
                      onChange={e =>
                        handleSiteFile(row.localId, e.target.files)
                      }
                    />
                    <button
                      type="button"
                      className="btn-secondary btn-choose-file"
                      onClick={() =>
                        fileInputs.current[row.localId]?.click()
                      }
                    >
                      {row.fileName || 'Choose file'}
                    </button>
                  </td>
                  <td>
                    <select
                      value={row.waypointId}
                      onChange={e =>
                        updateSiteRow(row.localId, {
                          waypointId: e.target.value,
                        })
                      }
                      className="form-select"
                      style={{ width: '100%', padding: '2px 4px' }}
                    >
                      <option value="">—</option>
                      {sitePlanWaypoints.map(wp => (
                        <option
                          key={wp.waypoint_id}
                          value={wp.waypoint_id}
                        >
                          {wp.waypoint_name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={row.droneAlt}
                      onChange={e =>
                        updateSiteRow(row.localId, {
                          droneAlt: e.target.value,
                        })
                      }
                      className="form-input"
                      style={{ width: '100%', padding: '2px 4px' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={row.droneLat}
                      onChange={e =>
                        updateSiteRow(row.localId, {
                          droneLat: e.target.value,
                        })
                      }
                      className="form-input"
                      style={{ width: '100%', padding: '2px 4px' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={row.droneLng}
                      onChange={e =>
                        updateSiteRow(row.localId, {
                          droneLng: e.target.value,
                        })
                      }
                      className="form-input"
                      style={{ width: '100%', padding: '2px 4px' }}
                    />
                  </td>
                  <td>
                    <DateTimePicker
                      value={row.takenAt}
                      onChange={iso =>
                        updateSiteRow(row.localId, { takenAt: iso })
                      }
                      compact
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={row.droneHeading}
                      onChange={e =>
                        updateSiteRow(row.localId, {
                          droneHeading: e.target.value,
                        })
                      }
                      className="form-input"
                      style={{ width: '100%', padding: '2px 4px' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="any"
                      value={row.gimbalPosition}
                      onChange={e =>
                        updateSiteRow(row.localId, {
                          gimbalPosition: e.target.value,
                        })
                      }
                      className="form-input"
                      style={{ width: '100%', padding: '2px 4px' }}
                    />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {!row.isGhost ? (
                      <button
                        type="button"
                        onClick={() => removeSiteRow(row.localId)}
                        className="btn-secondary btn-icon-sm"
                        title="Remove photo"
                        style={{ fontSize: '0.78em' }}
                      >
                        ✕
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSiteSave}
            className="btn-primary"
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadPhotosModal;
