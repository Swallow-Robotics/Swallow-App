import React, { useEffect, useState } from 'react';
import { useAuth } from '../context';
import apiClient from '../services/api';
import HlsVideoPlayer from '../components/video/HlsVideoPlayer';
import BaseStationVideoModal from '../components/video/BaseStationVideoModal';
import WeatherMetricTile from '../components/weather/WeatherMetricTile';
import WeatherHistoryModal from '../components/weather/WeatherHistoryModal';
import { WEATHER_FIELDS } from '../components/weather/weatherFields';

const PREVIEW_HEIGHT = '32vh';
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

const getDisplayName = bs =>
  bs.bs_name || bs.bs_serial_number || bs.bs_model || 'Base Station';

const SitePage = () => {
  const { activeProject } = useAuth();
  const activeProjectId =
    activeProject?.project_id ||
    (typeof activeProject === 'string' ? activeProject : null);

  // Weather state
  const [stations, setStations] = useState([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(null); // { bsId, bsName, field }

  // Video state
  const [baseStations, setBaseStations] = useState([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [expandedBaseStation, setExpandedBaseStation] = useState(null);

  useEffect(() => {
    if (!activeProjectId) {
      setStations([]);
      return undefined;
    }
    let cancelled = false;

    const fetchCurrent = ({ showLoading }) => {
      if (showLoading) setWeatherLoading(true);
      apiClient
        .get(`/v1/weather/current?project_id=${activeProjectId}`)
        .then(data => {
          if (!cancelled) {
            setStations(data?.stations || []);
            setWeatherError('');
          }
        })
        .catch(err => {
          if (!cancelled) {
            setWeatherError(err?.payload?.error || err?.message || 'Unable to load weather data.');
          }
        })
        .finally(() => {
          if (!cancelled && showLoading) setWeatherLoading(false);
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

  useEffect(() => {
    if (!activeProjectId) {
      setBaseStations([]);
      return undefined;
    }
    let cancelled = false;
    setVideoLoading(true);
    setVideoError('');
    apiClient
      .get(`/v1/fleet/base-stations?project_id=${activeProjectId}`)
      .then(data => {
        if (!cancelled) setBaseStations(data?.base_stations || []);
      })
      .catch(err => {
        if (!cancelled)
          setVideoError(
            err?.payload?.error || err?.message || 'Unable to load base station video.'
          );
      })
      .finally(() => {
        if (!cancelled) setVideoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const baseStationsWithVideo = baseStations.filter(bs => bs.video_url);

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="page-header">
        <div className="page-header__left" />
        <div className="page-header__center">
          <h2 className="page-header__title">Site</h2>
        </div>
        <div className="page-header__right" />
      </div>

      {!activeProjectId ? (
        <p className="page-empty">Select a project to view site weather and video.</p>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-lg)',
            alignItems: 'flex-start',
          }}
        >
          {/* Weather column */}
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <h5 style={{ margin: '0 0 var(--space-md)' }}>Weather</h5>
            {weatherError ? (
              <div className="page-error">{weatherError}</div>
            ) : weatherLoading ? (
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
                      <h6 style={{ margin: 0 }}>{station.bs_name}</h6>
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
                          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
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
          </div>

          {/* Video column */}
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            <h5 style={{ margin: '0 0 var(--space-md)' }}>Video</h5>
            {videoError ? (
              <div className="page-error">{videoError}</div>
            ) : videoLoading ? (
              <div className="page-empty">Loading...</div>
            ) : baseStationsWithVideo.length === 0 ? (
              <p className="page-empty">
                No active base station video available for this project.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
                {baseStationsWithVideo.map(baseStation => (
                  <div
                    key={baseStation.bs_id}
                    className="surface-card surface-card--flush"
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedBaseStation(baseStation)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedBaseStation(baseStation);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Click to expand"
                  >
                    <div
                      style={{
                        padding: 'var(--space-sm) var(--space-md)',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      <h6 style={{ margin: 0 }}>{getDisplayName(baseStation)}</h6>
                    </div>
                    <HlsVideoPlayer
                      src={baseStation.video_url}
                      muted
                      autoPlay
                      playsInline
                      style={{ height: PREVIEW_HEIGHT, width: '100%', aspectRatio: '16 / 9' }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <BaseStationVideoModal
        baseStation={expandedBaseStation}
        onClose={() => setExpandedBaseStation(null)}
      />

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

export default SitePage;
