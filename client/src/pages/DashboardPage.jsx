import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { useAuth } from '../context';
import apiClient from '../services/api';
import 'maplibre-gl/dist/maplibre-gl.css';

const StatCard = ({ label, value }) => (
  <div className="surface-card" style={{ textAlign: 'center' }}>
    <div
      style={{
        fontSize: 'var(--font-size-3xl)',
        fontWeight: 'var(--font-weight-bold)',
        color: 'var(--color-primary)',
        lineHeight: 1,
        marginBottom: 'var(--space-xs)',
      }}
    >
      {value}
    </div>
    <div
      style={{
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-semibold)',
        color: 'var(--color-text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--letter-spacing-wide)',
      }}
    >
      {label}
    </div>
  </div>
);

const DashboardPage = () => {
  const navigate = useNavigate();
  const { activeProject } = useAuth();

  const activeProjectId =
    activeProject?.project_id ||
    (typeof activeProject === 'string' ? activeProject : null);

  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const dashboardMapRef = useRef(null);
  const dashboardMapInstance = useRef(null);
  const dashboardMarkerRef = useRef(null);
  const [mapContainerReady, setMapContainerReady] = useState(false);

  const project = summary?.project || {};

  const addressCoord =
    project?.address_lat != null && project?.address_lng != null
      ? { lat: project.address_lat, lng: project.address_lng }
      : null;

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    setSummary(null);
    apiClient
      .get(`/v1/projects/${activeProjectId}/summary`)
      .then(data => {
        if (!cancelled) setSummary(data);
      })
      .catch(err => {
        if (!cancelled)
          setError(err?.message || 'Unable to load project data.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    const el = dashboardMapRef.current;
    if (!addressCoord) {
      setMapContainerReady(false);
      return;
    }
    const lat = Number(addressCoord.lat);
    const lon = Number(addressCoord.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0]?.contentRect ?? {};
      if (width > 0 && height > 0) setMapContainerReady(true);
    });
    observer.observe(el);
    if (el.offsetWidth > 0 && el.offsetHeight > 0) setMapContainerReady(true);
    return () => {
      observer.disconnect();
      setMapContainerReady(false);
    };
  }, [addressCoord]);

  useEffect(() => {
    if (!mapContainerReady || !dashboardMapRef.current || !addressCoord) return;
    const lat = Number(addressCoord.lat);
    const lon = Number(addressCoord.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    if (!dashboardMapInstance.current) {
      try {
        dashboardMapInstance.current = new maplibregl.Map({
          container: dashboardMapRef.current,
          style:
            'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
          center: [lon, lat],
          zoom: 13,
          interactive: false,
        });
        dashboardMapInstance.current.once('load', () => {
          if (dashboardMapInstance.current)
            dashboardMapInstance.current.resize();
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error initializing map:', err);
        return;
      }
    } else {
      dashboardMapInstance.current.setCenter([lon, lat]);
      dashboardMapInstance.current.resize();
    }

    if (dashboardMarkerRef.current) {
      dashboardMarkerRef.current.remove();
      dashboardMarkerRef.current = null;
    }

    const pinEl = document.createElement('div');
    pinEl.style.cssText =
      'width:24px;height:32px;box-sizing:border-box;padding:0;margin:0;' +
      'user-select:none;line-height:0;transition:none;animation:none;cursor:default;' +
      'filter:drop-shadow(0 2px 6px rgba(31,58,95,0.35));';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '32');
    svg.setAttribute('viewBox', '0 0 24 32');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const pinBody = document.createElementNS(ns, 'path');
    pinBody.setAttribute(
      'd',
      'M12 1C6.477 1 2 5.477 2 11c0 7.732 10 20 10 20s10-12.268 10-20C22 5.477 17.523 1 12 1z'
    );
    pinBody.setAttribute('fill', 'var(--color-accent)');
    pinBody.setAttribute('stroke', 'var(--color-surface-primary)');
    pinBody.setAttribute('stroke-width', '1.5');
    const pinDot = document.createElementNS(ns, 'circle');
    pinDot.setAttribute('cx', '12');
    pinDot.setAttribute('cy', '11');
    pinDot.setAttribute('r', '3.5');
    pinDot.setAttribute('fill', 'var(--color-surface-primary)');
    svg.appendChild(pinBody);
    svg.appendChild(pinDot);
    pinEl.appendChild(svg);

    dashboardMarkerRef.current = new maplibregl.Marker({
      element: pinEl,
      anchor: 'bottom',
    })
      .setLngLat([lon, lat])
      .addTo(dashboardMapInstance.current);
  }, [mapContainerReady, addressCoord]);

  useEffect(
    () => () => {
      if (dashboardMarkerRef.current) {
        dashboardMarkerRef.current.remove();
        dashboardMarkerRef.current = null;
      }
      if (dashboardMapInstance.current) {
        dashboardMapInstance.current.remove();
        dashboardMapInstance.current = null;
      }
    },
    []
  );

  if (!activeProjectId) {
    return (
      <div style={{ width: '100%', boxSizing: 'border-box' }}>
        <div className="page-header">
          <div className="page-header__left" />
          <div className="page-header__center">
            <h2 className="page-header__title">Dashboard</h2>
          </div>
          <div className="page-header__right" />
        </div>
        <p className="page-empty">Select a project to view its dashboard.</p>
      </div>
    );
  }

  const waypointCount = summary != null ? summary.waypoint_count : '—';
  const photoCount = summary != null ? summary.photo_count : '—';
  const memberCount = summary != null ? summary.member_count : '—';
  const members = summary?.members || [];

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="page-header">
        <div className="page-header__left" />
        <div className="page-header__center">
          <h2 className="page-header__title">Dashboard</h2>
          {project.project_name ? (
            <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9em' }}>
              {project.project_name}
            </p>
          ) : null}
        </div>
        <div className="page-header__right" />
      </div>

      {error && <div className="page-error">{error}</div>}

      {isLoading ? (
        <div className="page-empty">Loading...</div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-lg)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 'var(--space-md)',
            }}
          >
            <StatCard label="No. Waypoints" value={waypointCount} />
            <StatCard label="No. Photos" value={photoCount} />
            <StatCard label="No. Project Members" value={memberCount} />
          </div>

          {(project.project_address || addressCoord) && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--space-md)',
                alignItems: 'stretch',
              }}
            >
              <div className="surface-card">
                <h3
                  style={{
                    margin: '0 0 var(--space-md) 0',
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  Location
                </h3>
                {project.project_address && (
                  <p
                    style={{
                      margin: '0 0 var(--space-xs) 0',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {project.project_address}
                  </p>
                )}
                {addressCoord?.lat != null && addressCoord?.lng != null && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {Number(addressCoord.lat).toFixed(6)},{' '}
                    {Number(addressCoord.lng).toFixed(6)}
                  </p>
                )}
              </div>
              {addressCoord?.lat != null && addressCoord?.lng != null && (
                <div
                  className="surface-card"
                  style={{ padding: 0, overflow: 'hidden' }}
                >
                  <div
                    style={{
                      padding: 'var(--space-sm) var(--space-md)',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <h6 style={{ margin: 0 }}>Map</h6>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{
                        padding: 'var(--space-xs) var(--space-sm)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                      onClick={() => navigate('/view/map')}
                    >
                      Open Map
                    </button>
                  </div>
                  <div
                    ref={dashboardMapRef}
                    style={{
                      height: 180,
                      width: '100%',
                      cursor: 'pointer',
                    }}
                    onClick={() => navigate('/view/map')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate('/view/map');
                      }
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="surface-card surface-card--flush">
            <div
              style={{
                padding: 'var(--space-lg) var(--space-lg) var(--space-md)',
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                gap: 'var(--space-md)',
              }}
            >
              <div />
              <h3
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 'var(--font-weight-semibold)',
                  textAlign: 'center',
                }}
              >
                Project Members
              </h3>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    padding: 'var(--space-xs) var(--space-sm)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                  onClick={() =>
                    navigate(`/view/projects/${activeProjectId}/members`)
                  }
                >
                  Add Members
                </button>
              </div>
            </div>
            {members.length === 0 ? (
              <div
                style={{
                  padding: 'var(--space-md) var(--space-lg)',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                No members found.
              </div>
            ) : (
              <table
                className="data-table data-table--members"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Organization</th>
                    <th>Email</th>
                    <th>Role</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => {
                    const registrationIncomplete =
                      !m.first_name && !m.last_name;
                    const displayName = registrationIncomplete
                      ? null
                      : [m.first_name, m.last_name]
                          .filter(Boolean)
                          .join(' ');
                    const incompleteStyle = registrationIncomplete
                      ? { color: 'var(--color-swallow-rust)' }
                      : {};
                    return (
                      <tr key={m.user_id}>
                        <td style={incompleteStyle}>
                          {registrationIncomplete ? (
                            <span style={{ fontStyle: 'italic' }}>
                              Registration Incomplete
                            </span>
                          ) : (
                            displayName || ''
                          )}
                        </td>
                        <td style={incompleteStyle}>
                          {m.org_name || ''}
                        </td>
                        <td style={incompleteStyle}>
                          {m.email || ''}
                        </td>
                        <td
                          style={{
                            textTransform: 'capitalize',
                            ...incompleteStyle,
                          }}
                        >
                          {m.role || 'Viewer'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
