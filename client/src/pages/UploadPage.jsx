import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import { dateKeyFromIso, dateLabelFromKey } from '../utils/dateTime';
import UploadPhotosModal from '../components/photo/UploadPhotosModal';

const PhotosPage = () => {
  const { activeProject, roleForActiveProject } = useAuth();
  const navigate = useNavigate();

  const activeProjectId =
    (typeof activeProject === 'string'
      ? activeProject
      : activeProject?.project_id) || null;
  const projectName =
    typeof activeProject === 'string' ? '' : activeProject?.project_name || '';

  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const photoRole = (
    roleForActiveProject ? roleForActiveProject() : ''
  ).toLowerCase();
  const canUploadPhotos =
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
      setError(
        err?.payload?.error ||
          err?.message ||
          'Unable to load photos for this project.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId]);

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

  if (!activeProjectId) {
    return (
      <div style={{ width: '100%', boxSizing: 'border-box' }}>
        <div className="page-header">
          <h2 className="page-header__title">Photos</h2>
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
        <div className="page-header__left" />
        <div className="page-header__center">
          <h2 className="page-header__title">Photos</h2>
          {projectName ? (
            <span
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {projectName}
            </span>
          ) : null}
        </div>
        <div className="page-header__right">
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
              <span aria-hidden="true">📁</span>
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

      <UploadPhotosModal
        open={isUploadOpen}
        projectId={activeProjectId}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={fetchPhotos}
      />
    </div>
  );
};

export default PhotosPage;
