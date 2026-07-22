import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PanoramaViewer from '../components/photo/PanoramaViewer';
import PanZoomImage from '../components/photo/PanZoomImage';
import publicPhotoService from '../services/publicPhotoService';
import { formatMonthDayYear } from '../utils/dateTime';

/**
 * Static banner mimicking the View Only portal header: non-clickable Swallow
 * logo on the left, project / waypoint / date on the right. No nav, no
 * portal toggle, no links to any other page.
 */
const PublicPhotoBanner = ({ projectName, waypointName, takenAt }) => (
  <header className="App-header">
    <div className="App-header__inner">
      <div className="App-header__left">
        <span
          className="App-header__logoLink App-header__logoLink--static"
          aria-label="Swallow Robotics"
        >
          <img
            src={`${process.env.PUBLIC_URL}/logo192-white.png`}
            alt="Swallow Robotics"
            className="App-header__logo"
          />
        </span>
      </div>
      <div className="App-header__right">
        {projectName ? (
          <div className="header-project-callout" title={projectName}>
            <span className="header-project-callout__label">Project</span>
            <span className="header-project-callout__name">
              {projectName}
            </span>
          </div>
        ) : null}
        {waypointName ? (
          <div className="header-project-callout" title={waypointName}>
            <span className="header-project-callout__label">Waypoint</span>
            <span className="header-project-callout__name">
              {waypointName}
            </span>
          </div>
        ) : null}
        {takenAt ? (
          <div className="header-project-callout">
            <span className="header-project-callout__label">Date</span>
            <span className="header-project-callout__name">
              {formatMonthDayYear(takenAt)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  </header>
);

/**
 * Public, unauthenticated single-photo viewer reached via the token embedded
 * in Photos PDF exports. Shows only the immersive photo — no navigation to
 * any other page, waypoint, or photo.
 */
const PublicPhotoViewerPage = () => {
  const { token } = useParams();
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    publicPhotoService
      .getPhoto(token)
      .then(resp => {
        if (!cancelled) setPhoto(resp?.photo || null);
      })
      .catch(err => {
        if (!cancelled) {
          setError(
            err?.status === 404
              ? 'This photo link is no longer available.'
              : err?.payload?.error ||
                  err?.message ||
                  'Unable to load photo.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isPanorama =
    photo?.capture_method === '360_camera' ||
    photo?.waypoint_action === 'photo_360';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        width: '100%',
      }}
    >
      <PublicPhotoBanner
        projectName={photo?.project_name}
        waypointName={photo?.waypoint_name}
        takenAt={photo?.taken_at}
      />
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {photo?.r2_url ? (
          isPanorama ? (
            <PanoramaViewer src={photo.r2_url} />
          ) : (
            <PanZoomImage
              src={photo.r2_url}
              alt={photo.waypoint_name || 'Photo'}
            />
          )
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--color-surface-secondary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            {error || (isLoading ? 'Loading photo…' : 'Photo not available.')}
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicPhotoViewerPage;
