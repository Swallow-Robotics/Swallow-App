import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import SimulateFlightModal from '../components/sim/SimulateFlightModal';

const formatDate = dateStr => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
};

const formatTime = dateStr => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleTimeString();
  } catch {
    return dateStr;
  }
};

const formatDuration = (takeoff, landing) => {
  if (!takeoff || !landing) return '—';
  try {
    const diffMs = new Date(landing) - new Date(takeoff);
    if (diffMs < 0) return '—';
    const totalSec = Math.floor(diffMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  } catch {
    return '—';
  }
};

const PlanSimPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { projects } = useAuth();

  const activeProjectId = searchParams.get('project_id') || null;
  const currentProject = (projects || []).find(p => p.project_id === activeProjectId) || null;

  const [flights, setFlights] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const [detailsModal, setDetailsModal] = useState(null);
  const [weatherModal, setWeatherModal] = useState(null);

  const fetchFlights = useCallback(async () => {
    if (!activeProjectId) return;
    setIsLoading(true);
    setPageError('');
    try {
      const resp = await apiClient.get(`/v1/flights?project_id=${activeProjectId}`);
      setFlights(resp?.flights || []);
    } catch (err) {
      setPageError(err?.payload?.error || err?.message || 'Unable to load flights.');
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    fetchFlights();
  }, [fetchFlights]);

  useEffect(() => {
    const handler = e => {
      if (!e.target.closest('.sim-row-menu')) setMenuOpenId(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleCreate = useCallback(
    async payload => {
      setCreateError('');
      try {
        await apiClient.post('/v1/flights', payload);
        setIsCreateOpen(false);
        await fetchFlights();
      } catch (err) {
        setCreateError(err?.payload?.error || err?.message || 'Unable to create flight.');
      }
    },
    [fetchFlights]
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
            <h2 className="page-header__title">Flight Simulation</h2>
            {currentProject ? (
              <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9em' }}>
                {currentProject.project_name}
              </p>
            ) : null}
          </div>
          <div className="page-header__right">
            {activeProjectId ? (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                title="Simulate Flight"
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
          <>
            <h3
              style={{
                margin: 'var(--space-md) 0 var(--space-sm)',
                fontSize: '1em',
                fontWeight: 600,
                color: 'var(--color-text-primary)',
              }}
            >
              Flight Logs
            </h3>

            <div
              className="data-table-container"
              style={{ overflowX: 'auto', overflowY: 'visible', position: 'relative' }}
            >
              <table
                className="data-table"
                style={{ minWidth: 520, tableLayout: 'fixed' }}
              >
                <colgroup>
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: 36 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Duration</th>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {flights.map(flight => (
                    <tr key={flight.flight_id}>
                      <td>{formatDate(flight.takeoff_time)}</td>
                      <td>{formatDuration(flight.takeoff_time, flight.landing_time)}</td>
                      <td>{flight.plan_name || '—'}</td>
                      <td>
                        {flight.flight_status
                          ? flight.flight_status.charAt(0).toUpperCase() +
                            flight.flight_status.slice(1)
                          : '—'}
                      </td>
                      <td>
                        <div
                          className="sim-row-menu"
                          style={{ position: 'relative', display: 'inline-block' }}
                        >
                          <button
                            type="button"
                            aria-label="Flight actions"
                            onClick={e => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              const menuWidth = 140;
                              const padding = 8;
                              const left = Math.min(
                                rect.left,
                                window.innerWidth - menuWidth - padding
                              );
                              setMenuPosition({
                                top: rect.bottom + 6,
                                left: Math.max(padding, left),
                              });
                              setMenuOpenId(prev =>
                                prev === flight.flight_id ? null : flight.flight_id
                              );
                            }}
                            className="btn-secondary btn-icon-sm"
                          >
                            ⋮
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!flights.length ? (
                    <tr>
                      <td colSpan={5} style={{ color: 'var(--color-text-secondary)' }}>
                        No flight logs
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Row kebab dropdown */}
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
                const flight = flights.find(f => f.flight_id === menuOpenId);
                setMenuOpenId(null);
                setDetailsModal(flight || null);
              }}
            >
              Details
            </button>
            <button
              type="button"
              className="btn-menu-item"
              onClick={() => {
                const flight = flights.find(f => f.flight_id === menuOpenId);
                setMenuOpenId(null);
                setWeatherModal(flight || null);
              }}
            >
              Weather
            </button>
          </div>
        ) : null}

        {/* Details modal */}
        {detailsModal ? (
          <div className="modal-overlay" onClick={() => setDetailsModal(null)}>
            <div
              className="modal-body"
              style={{ maxWidth: 440, width: '96%', position: 'relative' }}
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setDetailsModal(null)}
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
              <h3 className="modal-header">Flight Details</h3>
              <dl style={{ margin: 0 }}>
                {[
                  ['Takeoff', detailsModal.takeoff_time
                    ? `${formatDate(detailsModal.takeoff_time)} ${formatTime(detailsModal.takeoff_time)}`
                    : '—'],
                  ['Landing', detailsModal.landing_time
                    ? `${formatDate(detailsModal.landing_time)} ${formatTime(detailsModal.landing_time)}`
                    : '—'],
                  ['Drone', detailsModal.drone_identifier || '—'],
                  ['Dock', detailsModal.dock_identifier || '—'],
                  ['Pilot', detailsModal.pilot_name || '—'],
                  ['Visual Observer', detailsModal.visual_observer || '—'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: 'var(--space-xs) 0',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <dt
                      style={{
                        fontSize: '0.85em',
                        color: 'var(--color-text-secondary)',
                        fontWeight: 500,
                      }}
                    >
                      {label}
                    </dt>
                    <dd style={{ margin: 0, fontWeight: 600, textAlign: 'right' }}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : null}

        {/* Weather modal */}
        {weatherModal ? (
          <div className="modal-overlay" onClick={() => setWeatherModal(null)}>
            <div
              className="modal-body"
              style={{ maxWidth: 440, width: '96%', position: 'relative' }}
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setWeatherModal(null)}
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
              <h3 className="modal-header">Weather</h3>
              <dl style={{ margin: 0 }}>
                {[
                  ['Wind Speed (mph)', weatherModal.wind_speed ?? '—'],
                  ['Wind Direction (deg)', weatherModal.wind_direction ?? '—'],
                  ['Visibility (sm)', weatherModal.visibility ?? '—'],
                  ['Temperature (deg F)', weatherModal.temperature ?? '—'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: 'var(--space-xs) 0',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <dt
                      style={{
                        fontSize: '0.85em',
                        color: 'var(--color-text-secondary)',
                        fontWeight: 500,
                      }}
                    >
                      {label}
                    </dt>
                    <dd style={{ margin: 0, fontWeight: 600, textAlign: 'right' }}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : null}

        <SimulateFlightModal
          open={isCreateOpen}
          projectId={activeProjectId}
          onClose={() => {
            setIsCreateOpen(false);
            setCreateError('');
          }}
          onSubmit={handleCreate}
          error={createError}
        />
      </div>
    </div>
  );
};

export default PlanSimPage;
