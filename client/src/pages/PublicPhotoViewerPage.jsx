import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PanoramaViewer from '../components/photo/PanoramaViewer';
import PanZoomImage from '../components/photo/PanZoomImage';
import PublicHeaderBanner from '../components/photo/PublicHeaderBanner';
import publicPhotoService from '../services/publicPhotoService';

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
      <PublicHeaderBanner
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
