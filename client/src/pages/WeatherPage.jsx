import React, { useEffect, useState } from 'react';
import { useAuth } from '../context';
import apiClient from '../services/api';
import WeatherMetricTile from '../components/weather/WeatherMetricTile';
import WeatherHistoryModal from '../components/weather/WeatherHistoryModal';
import { WEATHER_FIELDS } from '../components/weather/weatherFields';

const POLL_INTERVAL_MS = 30000;

const formatRelativeTime = (isoString, now) => {
  if (!isoString) return null;
  const seconds = Math.max(0, Math.round((now - new Date(isoString).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
};

const WeatherPage = () => {
  const { activeProject } = useAuth();
  const activeProjectId =
    activeProject?.project_id ||
    (typeof activeProject === 'string' ? activeProject : null);

  const [stations, setStations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(null); // { bsId, bsName, field }

  useEffect(() => {
    if (!activeProjectId) {
      setStations([]);
      return undefined;
    }
    let cancelled = false;

    const fetchCurrent = ({ showLoading }) => {
      if (showLoading) setIsLoading(true);
      apiClient
        .get(`/v1/weather/current?project_id=${activeProjectId}`)
        .then(data => {
          if (!cancelled) {
            setStations(data?.stations || []);
            setError('');
          }
        })
        .catch(err => {
          if (!cancelled) {
            setError(err?.payload?.error || err?.message || 'Unable to load weather data.');
          }
        })
        .finally(() => {
          if (!cancelled && showLoading) setIsLoading(false);
        });
    };

    fetchCurrent({ showLoading: true });
    const interval = setInterval(() => fetchCurrent({ showLoading: false }), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeProjectId]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="page-header">
        <div className="page-header__left" />
        <div className="page-header__center">
          <h2 className="page-header__title">Weather</h2>
        </div>
        <div className="page-header__right" />
      </div>

      {!activeProjectId ? (
        <p className="page-empty">Select a project to view weather.</p>
      ) : error ? (
        <div className="page-error">{error}</div>
      ) : isLoading ? (
        <div className="page-empty">Loading...</div>
      ) : stations.length === 0 ? (
        <p className="page-empty">No weather station configured for this project.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          {stations.map(station => (
            <div key={station.bs_id} className="surface-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 'var(--space-md)',
                }}
              >
                <h5 style={{ margin: 0 }}>{station.bs_name}</h5>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  {station.latest
                    ? `Updated ${formatRelativeTime(station.latest.recorded_at, now)}`
                    : ''}
                </span>
              </div>

              {!station.latest ? (
                <p className="page-empty" style={{ marginTop: 0 }}>
                  No weather data received yet.
                </p>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: 'var(--space-md)',
                  }}
                >
                  {WEATHER_FIELDS.map(field => (
                    <WeatherMetricTile
                      key={field.key}
                      field={field}
                      rawValue={station.latest[field.key]}
                      onClick={() =>
                        setSelected({
                          bsId: station.bs_id,
                          bsName: station.bs_name,
                          field,
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <WeatherHistoryModal
          projectId={activeProjectId}
          bsId={selected.bsId}
          bsName={selected.bsName}
          field={selected.field}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};

export default WeatherPage;
