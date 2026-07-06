import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../services/api';
import FleetAddModal from '../components/fleet/FleetAddModal';

const formatDate = dateStr => {
  if (!dateStr) return '';
  try {
    const s = String(dateStr).split('T')[0];
    const [y, m, d] = s.split('-');
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString();
  } catch {
    return dateStr;
  }
};

const PlanFleetPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const activeProjectId = searchParams.get('project_id') || null;

  const [drones, setDrones] = useState([]);
  const [baseStations, setBaseStations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const [dronesExpanded, setDronesExpanded] = useState(false);
  const [baseStationsExpanded, setBaseStationsExpanded] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addError, setAddError] = useState('');

  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuOpenType, setMenuOpenType] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const [historyModal, setHistoryModal] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const fetchFleet = useCallback(async () => {
    if (!activeProjectId) return;
    setIsLoading(true);
    setPageError('');
    try {
      const [dronesResp, baseStationsResp] = await Promise.all([
        apiClient.get(`/v1/fleet/drones?project_id=${activeProjectId}`),
        apiClient.get(`/v1/fleet/base-stations?project_id=${activeProjectId}`),
      ]);
      setDrones(dronesResp?.drones || []);
      setBaseStations(baseStationsResp?.base_stations || []);
    } catch (err) {
      setPageError(err?.payload?.error || err?.message || 'Unable to load fleet.');
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  useEffect(() => {
    const handler = e => {
      if (!e.target.closest('.fleet-row-menu')) {
        setMenuOpenId(null);
        setMenuOpenType(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const openMenu = useCallback((e, id, type) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 140;
    const padding = 8;
    const left = Math.min(rect.left, window.innerWidth - menuWidth - padding);
    setMenuPosition({ top: rect.bottom + 6, left: Math.max(padding, left) });
    setMenuOpenId(prev => (prev === id ? null : id));
    setMenuOpenType(type);
  }, []);

  const handleAdd = useCallback(
    async ({ mode, drone, baseStation }) => {
      setAddError('');
      try {
        if (drone) {
          const dronePayload =
            mode === 'install'
              ? {
                  project_id: activeProjectId,
                  mode: 'install',
                  drone_identifier: drone.identifier,
                  drone_model: drone.model,
                  drone_year: drone.year,
                  drone_install_date: drone.installDate,
                  drone_last_inspected: drone.inspectionDate,
                  drone_last_inspector: drone.inspector,
                  remote_id: drone.remoteId,
                }
              : {
                  project_id: activeProjectId,
                  mode: 'service',
                  drone_identifier: drone.identifier,
                  drone_last_inspected: drone.inspectionDate,
                  drone_last_inspector: drone.inspector,
                  remote_id: drone.remoteId,
                };
          await apiClient.post('/v1/fleet/drones', dronePayload);
        }
        if (baseStation) {
          const baseStationPayload =
            mode === 'install'
              ? {
                  project_id: activeProjectId,
                  mode: 'install',
                  bs_serial_number: baseStation.serialNumber,
                  bs_name: baseStation.name,
                  bs_model: baseStation.model,
                  bs_install_date: baseStation.installDate,
                  bs_last_inspected: baseStation.inspectionDate,
                  bs_last_inspector: baseStation.inspector,
                }
              : {
                  project_id: activeProjectId,
                  mode: 'service',
                  bs_serial_number: baseStation.serialNumber,
                  bs_last_inspected: baseStation.inspectionDate,
                  bs_last_inspector: baseStation.inspector,
                };
          await apiClient.post('/v1/fleet/base-stations', baseStationPayload);
        }
        setIsAddOpen(false);
        await fetchFleet();
      } catch (err) {
        setAddError(err?.payload?.error || err?.message || 'Unable to save fleet entry.');
      }
    },
    [activeProjectId, fetchFleet]
  );

  const handleDeactivateDrone = useCallback(
    async droneId => {
      setPageError('');
      setMenuOpenId(null);
      setMenuOpenType(null);
      try {
        await apiClient.delete(`/v1/fleet/drones/${droneId}`);
        await fetchFleet();
      } catch (err) {
        setPageError(err?.payload?.error || err?.message || 'Unable to remove drone.');
      }
    },
    [fetchFleet]
  );

  const handleDeactivateBaseStation = useCallback(
    async bsId => {
      setPageError('');
      setMenuOpenId(null);
      setMenuOpenType(null);
      try {
        await apiClient.delete(`/v1/fleet/base-stations/${bsId}`);
        await fetchFleet();
      } catch (err) {
        setPageError(
          err?.payload?.error || err?.message || 'Unable to remove base station.'
        );
      }
    },
    [fetchFleet]
  );

  const openDroneHistory = useCallback(async drone => {
    setMenuOpenId(null);
    setMenuOpenType(null);
    setHistoryLoading(true);
    setHistoryError('');
    setHistoryModal({ type: 'drone', item: drone, history: [] });
    try {
      const resp = await apiClient.get(
        `/v1/fleet/drones/history?drone_identifier=${encodeURIComponent(drone.drone_identifier)}`
      );
      setHistoryModal({ type: 'drone', item: drone, history: resp?.history || [] });
    } catch (err) {
      setHistoryError(err?.payload?.error || err?.message || 'Unable to load history.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const openBaseStationHistory = useCallback(async baseStation => {
    setMenuOpenId(null);
    setMenuOpenType(null);
    setHistoryLoading(true);
    setHistoryError('');
    setHistoryModal({ type: 'base_station', item: baseStation, history: [] });
    try {
      const resp = await apiClient.get(
        `/v1/fleet/base-stations/history?bs_serial_number=${encodeURIComponent(baseStation.bs_serial_number)}`
      );
      setHistoryModal({
        type: 'base_station',
        item: baseStation,
        history: resp?.history || [],
      });
    } catch (err) {
      setHistoryError(err?.payload?.error || err?.message || 'Unable to load history.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const KebabMenu = ({ id, type }) => (
    <div
      className="fleet-row-menu"
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        type="button"
        aria-label="Row actions"
        onClick={e => openMenu(e, id, type)}
        className="btn-secondary btn-icon-sm"
      >
        ⋮
      </button>
    </div>
  );

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <div className="page-header__left">
            <button
              type="button"
              onClick={() => navigate('/plan/projects')}
              className="btn-secondary"
            >
              ← Back
            </button>
          </div>
          <div className="page-header__center">
            <h2 className="page-header__title">Fleet</h2>
          </div>
          <div className="page-header__right">
            {activeProjectId ? (
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                title="Add Drone / Base Station"
                className="btn-primary btn-icon"
              >
                +
              </button>
            ) : null}
          </div>
        </div>

        {pageError ? <div className="page-error">{pageError}</div> : null}

        {!activeProjectId ? (
          <p className="page-empty">
            No active project selected. Go to Projects to select one.
          </p>
        ) : isLoading ? (
          <div className="page-empty">Loading...</div>
        ) : (
          <div
            className="data-table-container"
            style={{ overflowX: 'auto', overflowY: 'visible', position: 'relative' }}
          >
            <table
              className="data-table"
              style={{ minWidth: 400, tableLayout: 'fixed' }}
            >
              <colgroup>
                <col style={{ width: 36 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th />
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {/* Drones row */}
                <tr>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setDronesExpanded(prev => !prev)}
                      className="btn-secondary btn-icon-sm"
                      title="Toggle drones"
                      style={{ fontSize: '0.72em' }}
                    >
                      {dronesExpanded ? '▲' : '▼'}
                    </button>
                  </td>
                  <td>Drones</td>
                </tr>

                {dronesExpanded ? (
                  <tr>
                    <td colSpan={2} style={{ padding: '0 var(--space-md) var(--space-md) var(--space-xl)' }}>
                      {drones.length ? (
                        <table
                          className="data-table"
                          style={{ fontSize: '0.84em', tableLayout: 'fixed', minWidth: 340 }}
                        >
                          <colgroup>
                            <col style={{ width: '35%' }} />
                            <col style={{ width: '15%' }} />
                            <col />
                            <col style={{ width: 36 }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Model</th>
                              <th>Year</th>
                              <th>Drone ID</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {drones.map(drone => (
                              <tr key={drone.drone_id}>
                                <td>{drone.drone_model || ''}</td>
                                <td>{drone.drone_year || ''}</td>
                                <td>{drone.drone_identifier || ''}</td>
                                <td>
                                  <KebabMenu id={drone.drone_id} type="drone" />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <span
                          style={{
                            color: 'var(--color-text-secondary)',
                            fontSize: '0.85em',
                          }}
                        >
                          No drones installed
                        </span>
                      )}
                    </td>
                  </tr>
                ) : null}

                {/* Base Stations row */}
                <tr>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setBaseStationsExpanded(prev => !prev)}
                      className="btn-secondary btn-icon-sm"
                      title="Toggle base stations"
                      style={{ fontSize: '0.72em' }}
                    >
                      {baseStationsExpanded ? '▲' : '▼'}
                    </button>
                  </td>
                  <td>Base Stations</td>
                </tr>

                {baseStationsExpanded ? (
                  <tr>
                    <td colSpan={2} style={{ padding: '0 var(--space-md) var(--space-md) var(--space-xl)' }}>
                      {baseStations.length ? (
                        <table
                          className="data-table"
                          style={{ fontSize: '0.84em', tableLayout: 'fixed', minWidth: 340 }}
                        >
                          <colgroup>
                            <col style={{ width: '30%' }} />
                            <col style={{ width: '30%' }} />
                            <col />
                            <col style={{ width: 36 }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Model</th>
                              <th>Serial Number</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {baseStations.map(baseStation => (
                              <tr key={baseStation.bs_id}>
                                <td>{baseStation.bs_name || ''}</td>
                                <td>{baseStation.bs_model || ''}</td>
                                <td>{baseStation.bs_serial_number || ''}</td>
                                <td>
                                  <KebabMenu id={baseStation.bs_id} type="base_station" />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <span
                          style={{
                            color: 'var(--color-text-secondary)',
                            fontSize: '0.85em',
                          }}
                        >
                          No base stations installed
                        </span>
                      )}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {/* Kebab dropdown menu */}
        {menuOpenId ? (
          <div
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              background: 'var(--color-surface-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 2000,
              minWidth: 140,
              padding: 'var(--space-xs) 0',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn-menu-item"
              onClick={() => {
                if (menuOpenType === 'drone') {
                  const drone = drones.find(d => d.drone_id === menuOpenId);
                  if (drone) openDroneHistory(drone);
                } else {
                  const baseStation = baseStations.find(bs => bs.bs_id === menuOpenId);
                  if (baseStation) openBaseStationHistory(baseStation);
                }
              }}
            >
              History
            </button>
            <button
              type="button"
              className="btn-menu-item btn-menu-item-destructive"
              onClick={() => {
                if (menuOpenType === 'drone') {
                  handleDeactivateDrone(menuOpenId);
                } else {
                  handleDeactivateBaseStation(menuOpenId);
                }
              }}
            >
              Delete
            </button>
          </div>
        ) : null}

        {/* History modal */}
        {historyModal ? (
          <div
            className="modal-overlay"
            onClick={() => {
              setHistoryModal(null);
              setHistoryError('');
            }}
          >
            <div
              className="modal-body"
              style={{ maxWidth: 760, width: '96%', position: 'relative' }}
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setHistoryModal(null);
                  setHistoryError('');
                }}
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
                aria-label="Close history"
              >
                ✕
              </button>

              <h3 className="modal-header">
                {historyModal.type === 'drone' ? 'Drone' : 'Base Station'} History
              </h3>

              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-lg)',
                  marginBottom: 'var(--space-md)',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '0.8em',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    Model
                  </span>
                  <p style={{ margin: '2px 0 0', fontWeight: 600 }}>
                    {historyModal.type === 'drone'
                      ? historyModal.item.drone_model || '—'
                      : historyModal.item.bs_model || '—'}
                  </p>
                </div>
                {historyModal.type === 'base_station' ? (
                  <div>
                    <span
                      style={{
                        fontSize: '0.8em',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Name
                    </span>
                    <p style={{ margin: '2px 0 0', fontWeight: 600 }}>
                      {historyModal.item.bs_name || '—'}
                    </p>
                  </div>
                ) : (
                  <div>
                    <span
                      style={{
                        fontSize: '0.8em',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Year
                    </span>
                    <p style={{ margin: '2px 0 0', fontWeight: 600 }}>
                      {historyModal.item.drone_year || '—'}
                    </p>
                  </div>
                )}
                <div>
                  <span
                    style={{
                      fontSize: '0.8em',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {historyModal.type === 'drone' ? 'Drone ID' : 'Serial Number'}
                  </span>
                  <p style={{ margin: '2px 0 0', fontWeight: 600 }}>
                    {historyModal.type === 'drone'
                      ? historyModal.item.drone_identifier || '—'
                      : historyModal.item.bs_serial_number || '—'}
                  </p>
                </div>
              </div>

              {historyError ? (
                <p style={{ color: '#9B4A2F', fontSize: '0.9em' }}>{historyError}</p>
              ) : null}

              {historyLoading ? (
                <p style={{ color: 'var(--color-text-secondary)' }}>Loading history...</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    className="data-table"
                    style={{ fontSize: '0.84em', tableLayout: 'fixed', minWidth: 580 }}
                  >
                    <colgroup>
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '20%' }} />
                      {historyModal.type === 'drone' ? (
                        <col style={{ width: '20%' }} />
                      ) : null}
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Organization</th>
                        <th>Install Date</th>
                        <th>Inspection Date</th>
                        <th>Inspector</th>
                        {historyModal.type === 'drone' ? <th>Remote ID</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {historyModal.history.map(rec => (
                        <tr
                          key={
                            historyModal.type === 'drone' ? rec.drone_id : rec.bs_id
                          }
                        >
                          <td>{rec.project_name || ''}</td>
                          <td>{rec.org_name || ''}</td>
                          <td>
                            {historyModal.type === 'drone'
                              ? formatDate(rec.drone_install_date)
                              : formatDate(rec.bs_install_date)}
                          </td>
                          <td>
                            {historyModal.type === 'drone'
                              ? formatDate(rec.drone_last_inspected)
                              : formatDate(rec.bs_last_inspected)}
                          </td>
                          <td>
                            {historyModal.type === 'drone'
                              ? rec.drone_last_inspector || ''
                              : rec.bs_last_inspector || ''}
                          </td>
                          {historyModal.type === 'drone' ? (
                            <td>{rec.remote_id || ''}</td>
                          ) : null}
                        </tr>
                      ))}
                      {!historyModal.history.length ? (
                        <tr>
                          <td
                            colSpan={historyModal.type === 'drone' ? 6 : 5}
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            No history found.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}

        <FleetAddModal
          open={isAddOpen}
          onClose={() => {
            setIsAddOpen(false);
            setAddError('');
          }}
          onSubmit={handleAdd}
          activeDrones={drones}
          activeBaseStations={baseStations}
          error={addError}
        />
      </div>
    </div>
  );
};

export default PlanFleetPage;
