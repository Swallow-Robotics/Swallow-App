import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import { dateKeyFromIso } from '../utils/dateTime';
import EditPhotoModal from '../components/photo/EditPhotoModal';
import DateDropdown from '../components/photo/DateDropdown';
import { downloadPhotosZip, photoFileName } from '../services/photoDownload';

const PhotosDatePage = () => {
  const { date } = useParams();
  const navigate = useNavigate();
  const { activeProject, roleForActiveProject } = useAuth();

  const activeProjectId =
    (typeof activeProject === 'string'
      ? activeProject
      : activeProject?.project_id) || null;

  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  const photoRole = (
    roleForActiveProject ? roleForActiveProject() : ''
  ).toLowerCase();
  const canManagePhotos =
    photoRole === 'owner' ||
    photoRole === 'administrator' ||
    photoRole === 'editor';

  const fetchPhotos = useCallback(async () => {
    if (!activeProjectId) {
      setPhotos([]);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const resp = await apiClient.get(
        `/v1/photos/project-photos?project_id=${activeProjectId}`,
      );
      setPhotos(resp?.photos || []);
    } catch (err) {
      setError(err?.payload?.error || err?.message || 'Unable to load photos.');
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!openMenuId) return;
      if (!e.target.closest?.('.photo-menu')) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('click', handleClickOutside, true);
    return () =>
      document.removeEventListener('click', handleClickOutside, true);
  }, [openMenuId]);

  const datePhotos = useMemo(
    () =>
      (photos || []).filter((photo) => dateKeyFromIso(photo.taken_at) === date),
    [photos, date],
  );

  const availableDates = useMemo(() => {
    const keys = new Set();
    (photos || []).forEach((photo) => {
      const key = dateKeyFromIso(photo.taken_at);
      if (key) keys.add(key);
    });
    return Array.from(keys).sort((a, b) => (a < b ? 1 : -1));
  }, [photos]);

  const deletePhoto = async (photoId) => {
    try {
      await apiClient.delete(`/v1/photos/manage/${photoId}`);
      fetchPhotos();
    } catch (err) {
      setError(
        err?.payload?.error || err?.message || 'Unable to delete photo.',
      );
    }
  };

  const toggleSelect = (photoId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const buildItems = (list) =>
    list
      .filter((photo) => photo.r2_url)
      .map((photo) => ({ url: photo.r2_url, name: photoFileName(photo) }));

  const runDownload = async (list) => {
    setError('');
    const items = buildItems(list);
    if (!items.length) {
      setError('No photos available to download.');
      return;
    }
    setIsDownloading(true);
    try {
      await downloadPhotosZip(items, `photos-${date}.zip`);
    } catch (err) {
      setError(err?.message || 'Download failed.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadSelected = async () => {
    const selected = datePhotos.filter((photo) =>
      selectedIds.has(photo.photo_id),
    );
    await runDownload(selected);
  };

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="page-header">
        <div className="page-header__left">
          <button
            type="button"
            onClick={() => navigate('/view/photos')}
            className="btn-secondary"
          >
            ← Back
          </button>
        </div>
        <div className="page-header__center">
          <h2 className="page-header__title">Photos</h2>
        </div>
        <div className="page-header__right">
          <DateDropdown
            dates={availableDates}
            currentKey={date}
            onSelect={(key) => navigate(`/view/photos/date/${key}`)}
          />
        </div>
      </div>

      {error ? <div className="page-error">{error}</div> : null}
      {isLoading ? <div className="page-empty">Loading photos...</div> : null}

      {!isLoading && !datePhotos.length ? (
        <p className="page-empty">No photos for this date.</p>
      ) : null}

      <div className="photo-grid">
        {datePhotos.map((photo) => (
          <div
            key={photo.photo_id}
            className="photo-grid-card"
            onClick={() => {
              if (selectionMode) {
                toggleSelect(photo.photo_id);
              } else {
                navigate(`/view/photos/${photo.photo_id}`);
              }
            }}
          >
            {selectionMode ? (
              <input
                type="checkbox"
                checked={selectedIds.has(photo.photo_id)}
                onChange={() => toggleSelect(photo.photo_id)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 'var(--space-sm)',
                  left: 'var(--space-sm)',
                  zIndex: 2,
                  width: 18,
                  height: 18,
                  accentColor: 'var(--color-primary)',
                }}
              />
            ) : null}
            <div
              className="photo-menu"
              style={{
                position: 'absolute',
                top: 'var(--space-sm)',
                right: 'var(--space-sm)',
                zIndex: 2,
              }}
            >
              <button
                type="button"
                aria-label="Photo actions"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId((prev) =>
                    prev === photo.photo_id ? null : photo.photo_id,
                  );
                }}
                className="btn-secondary btn-icon-sm"
              >
                ⋮
              </button>
              {openMenuId === photo.photo_id ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 34,
                    right: 0,
                    background: 'var(--color-surface-primary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 5,
                    minWidth: 160,
                    padding: 'var(--space-xs) 0',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="btn-menu-item"
                    onClick={() => {
                      setOpenMenuId(null);
                      setEditingPhoto(photo);
                    }}
                  >
                    Edit
                  </button>
                  {canManagePhotos ? (
                    <button
                      type="button"
                      className="btn-menu-item btn-menu-item-destructive"
                      onClick={() => {
                        setOpenMenuId(null);
                        deletePhoto(photo.photo_id);
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              style={{
                width: '100%',
                overflow: 'hidden',
                background: 'var(--color-surface-secondary)',
                aspectRatio: '4 / 3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={photo.thumbnail_r2_url || photo.r2_url}
                alt={photo.waypoint_name || 'Photo'}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
                onError={(e) => {
                  if (photo.r2_url && e.target.src !== photo.r2_url) {
                    e.target.src = photo.r2_url;
                  } else {
                    e.target.style.display = 'none';
                  }
                }}
              />
            </div>
            <div
              className="App-subnav__project"
              style={{
                display: 'flex',
                justifyContent: 'center',
                width: '100%',
                marginLeft: 0,
                maxWidth: 'none',
                padding: 'var(--space-sm)',
                borderTop: '1px solid var(--color-border)',
                background: 'var(--color-surface-primary)',
                boxSizing: 'border-box',
              }}
            >
              {photo.waypoint_name ? (
                <>
                  <span className="App-subnav__projectLabel">Waypoint</span>
                  <span className="App-subnav__projectName">
                    {photo.waypoint_name}
                  </span>
                </>
              ) : (
                <span style={{ color: 'var(--color-text-secondary)' }}>
                  No waypoint
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {datePhotos.length ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-sm)',
            marginTop: 'var(--space-lg)',
          }}
        >
          {selectionMode ? (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedIds(new Set());
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDownloadSelected}
                disabled={isDownloading || !selectedIds.size}
              >
                {isDownloading ? 'Downloading…' : 'Download'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => runDownload(datePhotos)}
                disabled={isDownloading}
              >
                {isDownloading ? 'Downloading…' : 'Download all'}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setSelectedIds(new Set());
                  setSelectionMode(true);
                }}
              >
                Download by photo
              </button>
            </>
          )}
        </div>
      ) : null}

      <EditPhotoModal
        open={!!editingPhoto}
        photo={editingPhoto}
        onClose={() => setEditingPhoto(null)}
        onSaved={fetchPhotos}
      />
    </div>
  );
};

export default PhotosDatePage;
