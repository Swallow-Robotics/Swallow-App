import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context';
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
  const { projects } = useAuth();

  const activeProjectId = searchParams.get('project_id') || null;
  const currentProject =
    (projects || []).find(p => p.project_id === activeProjectId) || null;

  const [drones, setDrones] = useState([]);
  const [docks, setDocks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const [dronesExpanded, setDronesExpanded] = useState(false);
  const [docksExpanded, setDocksExpanded] = useState(false);

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
      const [dronesResp, docksResp] = await Promise.all([
        apiClient.get(`/v1/fleet/drones?project_id=${activeProjectId}`),
        apiClient.get(`/v1/fleet/docks?project_id=${activeProjectId}`),
      ]);
      setDrones(dronesResp?.drones || []);
      setDocks(docksResp?.docks || []);
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
    async ({ mode, drone, dock }) => {
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
        if (dock) {
          const dockPayload =
            mode === 'install'
              ? {
                  project_id: activeProjectId,
                  mode: 'install',
                  dock_identifier: dock.identifier,
                  dock_model: dock.model,
                  dock_year: dock.year,
                  dock_install_date: dock.installDate,
                  dock_last_inspected: dock.inspectionDate,
                  dock_last_inspector: dock.inspector,
                }
              : {
                  project_id: activeProjectId,
                  mode: 'service',
                  dock_identifier: dock.identifier,
                  dock_last_inspected: dock.inspectionDate,
                  dock_last_inspector: dock.inspector,
                };
          await apiClient.post('/v1/fleet/docks', dockPayload);
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

  const handleDeactivateDock = useCallback(
    async dockId => {
      setPageError('');
      setMenuOpenId(null);
      setMenuOpenType(null);
      try {
        await apiClient.delete(`/v1/fleet/docks/${dockId}`);
        await fetchFleet();
      } catch (err) {
        setPageError(err?.payload?.error || err?.message || 'Unable to remove dock.');
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

  const openDockHistory = useCallback(async dock => {
    setMenuOpenId(null);
    setMenuOpenType(null);
    setHistoryLoading(true);
    setHistoryError('');
    setHistoryModal({ type: 'dock', item: dock, history: [] });
    try {
      const resp = await apiClient.get(
        `/v1/fleet/docks/history?dock_identifier=${encodeURIComponent(dock.dock_identifier)}`
      );
      setHistoryModal({ type: 'dock', item: dock, history: resp?.history || [] });
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
            {currentProject ? (
              <p
                style={{
                  margin: 0,
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.9em',
                }}
              >
                {currentProject.project_name}
              </p>
            ) : null}
          </div>
          <div className="page-header__right">
            {activeProjectId ? (
              <button
                type="button"
                onClick={() => setIsAddOpen(true)}
                title="Add Drone / Dock"
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

                {/* Docks row */}
                <tr>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setDocksExpanded(prev => !prev)}
                      className="btn-secondary btn-icon-sm"
                      title="Toggle docks"
                      style={{ fontSize: '0.72em' }}
                    >
                      {docksExpanded ? '▲' : '▼'}
                    </button>
                  </td>
                  <td>Docks</td>
                </tr>

                {docksExpanded ? (
                  <tr>
                    <td colSpan={2} style={{ padding: '0 var(--space-md) var(--space-md) var(--space-xl)' }}>
                      {docks.length ? (
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
                              <th>Dock ID</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {docks.map(dock => (
                              <tr key={dock.dock_id}>
                                <td>{dock.dock_model || ''}</td>
                                <td>{dock.dock_year || ''}</td>
                                <td>{dock.dock_identifier || ''}</td>
                                <td>
                                  <KebabMenu id={dock.dock_id} type="dock" />
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
                          No docks installed
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
                  const dock = docks.find(d => d.dock_id === menuOpenId);
                  if (dock) openDockHistory(dock);
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
                  handleDeactivateDock(menuOpenId);
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
                {historyModal.type === 'drone' ? 'Drone' : 'Dock'} History
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
                      : historyModal.item.dock_model || '—'}
                  </p>
                </div>
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
                    {historyModal.type === 'drone'
                      ? historyModal.item.drone_year || '—'
                      : historyModal.item.dock_year || '—'}
                  </p>
                </div>
                <div>
                  <span
                    style={{
                      fontSize: '0.8em',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {historyModal.type === 'drone' ? 'Drone ID' : 'Dock ID'}
                  </span>
                  <p style={{ margin: '2px 0 0', fontWeight: 600 }}>
                    {historyModal.type === 'drone'
                      ? historyModal.item.drone_identifier || '—'
                      : historyModal.item.dock_identifier || '—'}
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
                            historyModal.type === 'drone' ? rec.drone_id : rec.dock_id
                          }
                        >
                          <td>{rec.project_name || ''}</td>
                          <td>{rec.org_name || ''}</td>
                          <td>
                            {historyModal.type === 'drone'
                              ? formatDate(rec.drone_install_date)
                              : formatDate(rec.dock_install_date)}
                          </td>
                          <td>
                            {historyModal.type === 'drone'
                              ? formatDate(rec.drone_last_inspected)
                              : formatDate(rec.dock_last_inspected)}
                          </td>
                          <td>
                            {historyModal.type === 'drone'
                              ? rec.drone_last_inspector || ''
                              : rec.dock_last_inspector || ''}
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
          activeDocks={docks}
          error={addError}
        />
      </div>
    </div>
  );
};

export default PlanFleetPage;
