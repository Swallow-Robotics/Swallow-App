import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import PanZoomImage from '../components/photo/PanZoomImage';
import WaypointPhotoSwitcher from '../components/photo/WaypointPhotoSwitcher';
import WaypointDropdown from '../components/photo/WaypointDropdown';

const sortByTakenAtAsc = (a, b) => {
  const ta = new Date(a.taken_at || 0).getTime();
  const tb = new Date(b.taken_at || 0).getTime();
  return ta - tb;
};

const PhotoViewerPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeProject } = useAuth();

  const activeProjectId =
    (typeof activeProject === 'string'
      ? activeProject
      : activeProject?.project_id || activeProject?.id) || null;

  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!activeProjectId) {
      setPhotos([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError('');
    apiClient
      .get(`/v1/photos/project-photos?project_id=${activeProjectId}`)
      .then(resp => {
        if (!cancelled) setPhotos(resp?.photos || []);
      })
      .catch(err => {
        if (!cancelled) {
          setError(
            err?.payload?.error || err?.message || 'Unable to load photo.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  const current = useMemo(
    () => photos.find(p => p.photo_id === id) || null,
    [photos, id],
  );

  const sameWaypointPhotos = useMemo(() => {
    if (!current?.waypoint_id) return current ? [current] : [];
    return photos
      .filter(p => p.waypoint_id === current.waypoint_id)
      .sort(sortByTakenAtAsc);
  }, [photos, current]);

  const waypoints = useMemo(() => {
    const map = new Map();
    photos.forEach(p => {
      if (p.waypoint_id && !map.has(p.waypoint_id)) {
        map.set(p.waypoint_id, {
          waypoint_id: p.waypoint_id,
          waypoint_name: p.waypoint_name,
        });
      }
    });
    return [...map.values()].sort((a, b) =>
      (a.waypoint_name || '').localeCompare(b.waypoint_name || ''),
    );
  }, [photos]);

  const selectPhoto = useCallback(
    photoId => navigate(`/view/photos/${photoId}`, { replace: true }),
    [navigate],
  );

  const selectWaypoint = useCallback(
    waypointId => {
      const newest = photos
        .filter(p => p.waypoint_id === waypointId)
        .sort(sortByTakenAtAsc)
        .pop();
      if (newest) selectPhoto(newest.photo_id);
    },
    [photos, selectPhoto],
  );

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 'min(70vh, 600px)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}
      >
        {current?.r2_url ? (
          <PanZoomImage
            src={current.r2_url}
            alt={current.waypoint_name || 'Photo'}
          />
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

        {current ? (
          <>
            <div
              style={{
                position: 'absolute',
                top: 'var(--space-md)',
                left: 'var(--space-md)',
                zIndex: 10,
              }}
            >
              <WaypointPhotoSwitcher
                orderedPhotos={sameWaypointPhotos}
                currentId={current.photo_id}
                onSelect={selectPhoto}
              />
            </div>
            <div
              style={{
                position: 'absolute',
                top: 'var(--space-md)',
                right: 'var(--space-md)',
                zIndex: 10,
              }}
            >
              <WaypointDropdown
                waypoints={waypoints}
                currentWaypointId={current.waypoint_id}
                onSelect={selectWaypoint}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default PhotoViewerPage;
