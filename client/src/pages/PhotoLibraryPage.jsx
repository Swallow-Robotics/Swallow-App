import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import { useViewMode, SITE_PLAN, FLOOR_PLAN } from '../context/ViewModeContext';
import apiClient from '../services/api';
import { dateKeyFromIso, dateLabelFromKey } from '../utils/dateTime';
import UploadPhotosModal from '../components/photo/UploadPhotosModal';
import DownloadByFolderModal from '../components/photo/DownloadByFolderModal';
import { downloadPhotosZip, photoFileName } from '../services/photoDownload';

const FolderIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--color-primary)"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 7.5a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" />
  </svg>
);

const PhotoLibraryPage = ({ onBack }) => {
  const { activeProject, roleForActiveProject } = useAuth();
  const { viewMode, setViewMode, isSitePlan } = useViewMode();
  const navigate = useNavigate();

  const activeProjectId =
    (typeof activeProject === 'string'
      ? activeProject
      : activeProject?.project_id) || null;

  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFolderDownloadOpen, setIsFolderDownloadOpen] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const photoRole = (
    roleForActiveProject ? roleForActiveProject() : ''
  ).toLowerCase();
  const canUploadPhotos =
    photoRole === 'owner' ||
    photoRole === 'administrator' ||
    photoRole === 'editor';

  const captureMethodFilter = isSitePlan ? 'drone' : '360_camera';

  const fetchPhotos = useCallback(async () => {
    if (!activeProjectId) {
      setPhotos([]);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const resp = await apiClient.get(
        `/v1/photos/project-photos?project_id=${activeProjectId}&capture_method=${captureMethodFilter}`,
      );
      setPhotos(resp?.photos || []);
    } catch (err) {
      setError(
        err?.payload?.error ||
          err?.message ||
          'Unable to load photos for this project.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, captureMethodFilter]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const folders = useMemo(() => {
    const counts = new Map();
    (photos || []).forEach(photo => {
      const key = dateKeyFromIso(photo.taken_at);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [photos]);

  const handleDownloadAll = async () => {
    setError('');
    const items = (photos || [])
      .filter(photo => photo.r2_url && dateKeyFromIso(photo.taken_at))
      .map(photo => ({
        url: photo.r2_url,
        name: `${dateKeyFromIso(photo.taken_at)}/${photoFileName(photo)}`,
      }));
    if (!items.length) {
      setError('No photos available to download.');
      return;
    }
    setIsDownloadingAll(true);
    try {
      await downloadPhotosZip(items);
    } catch (err) {
      setError(err?.message || 'Download failed.');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  if (!activeProjectId) {
    return (
      <div style={{ width: '100%', boxSizing: 'border-box' }}>
        <div className="page-header">
          <h2 className="page-header__title">Photo Library</h2>
        </div>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Select a project on the Projects page to view its photos.
        </p>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', boxSizing: 'border-box' }}>
      <div className="page-header">
        <div className="page-header__left">
          {onBack ? (
            <button
              type="button"
              className="btn-format-1"
              onClick={onBack}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}
            >
              ‹ Drawing
            </button>
          ) : null}
        </div>
        <div className="page-header__center">
          <h2 className="page-header__title">Photo Library</h2>
        </div>
        <div className="page-header__right" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <div className="view-mode-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={`view-mode-toggle__btn${viewMode === SITE_PLAN ? ' view-mode-toggle__btn--active' : ''}`}
              onClick={() => setViewMode(SITE_PLAN)}
            >
              Site
            </button>
            <div className="view-mode-toggle__divider" aria-hidden="true" />
            <button
              type="button"
              className={`view-mode-toggle__btn${viewMode === FLOOR_PLAN ? ' view-mode-toggle__btn--active' : ''}`}
              onClick={() => setViewMode(FLOOR_PLAN)}
            >
              Floor
            </button>
          </div>
          {canUploadPhotos ? (
            <button
              type="button"
              className="btn-primary btn-icon"
              title="Upload photos"
              onClick={() => setIsUploadOpen(true)}
            >
              +
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="page-error">{error}</div> : null}
      {isLoading ? <div className="page-empty">Loading photos...</div> : null}

      {!isLoading && !folders.length ? (
        <p className="page-empty">No photos yet. Use the + button to upload.</p>
      ) : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-sm)',
        }}
      >
        {folders.map(folder => (
          <button
            type="button"
            key={folder.key}
            onClick={() => navigate(`/view/photos/date/${folder.key}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-md)',
              padding: 'var(--space-md)',
              background: 'var(--color-surface-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-sm)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                color: 'var(--color-text-primary)',
                fontWeight: 'var(--font-weight-semibold)',
              }}
            >
              <FolderIcon />
              {dateLabelFromKey(folder.key)}
            </span>
            <span
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {folder.count} {folder.count === 1 ? 'photo' : 'photos'}
            </span>
          </button>
        ))}
      </div>

      {folders.length ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-sm)',
            marginTop: 'var(--space-lg)',
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={handleDownloadAll}
            disabled={isDownloadingAll}
          >
            {isDownloadingAll ? 'Downloading…' : 'Download all'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsFolderDownloadOpen(true)}
          >
            Download by folder
          </button>
        </div>
      ) : null}

      <UploadPhotosModal
        open={isUploadOpen}
        projectId={activeProjectId}
        mode={isSitePlan ? 'site_plan' : 'floor_plan'}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={fetchPhotos}
      />

      <DownloadByFolderModal
        open={isFolderDownloadOpen}
        photos={photos}
        onClose={() => setIsFolderDownloadOpen(false)}
      />
    </div>
  );
};

export default PhotoLibraryPage;
