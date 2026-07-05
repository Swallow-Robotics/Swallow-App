import React, { useEffect, useState } from 'react';
import { useAuth } from '../context';
import apiClient from '../services/api';
import HlsVideoPlayer from '../components/video/HlsVideoPlayer';
import DockVideoModal from '../components/video/DockVideoModal';

const VideoPage = () => {
  const { activeProject } = useAuth();
  const activeProjectId =
    activeProject?.project_id ||
    (typeof activeProject === 'string' ? activeProject : null);

  const [docks, setDocks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedDock, setExpandedDock] = useState(null);

  useEffect(() => {
    if (!activeProjectId) {
      setDocks([]);
      return undefined;
    }
    let cancelled = false;
    setIsLoading(true);
    setError('');
    apiClient
      .get(`/v1/fleet/docks?project_id=${activeProjectId}`)
      .then(data => {
        if (!cancelled) setDocks(data?.docks || []);
      })
      .catch(err => {
        if (!cancelled)
          setError(err?.payload?.error || err?.message || 'Unable to load dock video.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  // list_docks already scopes to project_id + active_dock=true; just need a stream url.
  const docksWithVideo = docks.filter(d => d.video_url);

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="page-header">
        <div className="page-header__left" />
        <div className="page-header__center">
          <h2 className="page-header__title">Video</h2>
        </div>
        <div className="page-header__right" />
      </div>

      {!activeProjectId ? (
        <p className="page-empty">Select a project to view dock video.</p>
      ) : error ? (
        <div className="page-error">{error}</div>
      ) : isLoading ? (
        <div className="page-empty">Loading...</div>
      ) : docksWithVideo.length === 0 ? (
        <p className="page-empty">No active dock video available for this project.</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 'var(--space-lg)',
          }}
        >
          {docksWithVideo.map(dock => (
            <div
              key={dock.dock_id}
              className="surface-card surface-card--flush"
              role="button"
              tabIndex={0}
              onClick={() => setExpandedDock(dock)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpandedDock(dock);
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
                <h6 style={{ margin: 0 }}>
                  {dock.dock_identifier || dock.dock_model || 'Dock'}
                </h6>
              </div>
              <div style={{ position: 'relative' }}>
                <HlsVideoPlayer
                  src={dock.video_url}
                  muted
                  autoPlay
                  playsInline
                  style={{
                    width: '100%',
                    display: 'block',
                    background: '#000',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <DockVideoModal
        dock={expandedDock}
        onClose={() => setExpandedDock(null)}
      />
    </div>
  );
};

export default VideoPage;
