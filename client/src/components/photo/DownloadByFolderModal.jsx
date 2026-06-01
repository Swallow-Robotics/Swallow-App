import React, { useEffect, useMemo, useState } from 'react';
import { dateKeyFromIso, dateLabelFromKey } from '../../utils/dateTime';
import { downloadPhotosZip, photoFileName } from '../../services/photoDownload';

const groupByDate = photos => {
  const groups = new Map();
  (photos || []).forEach(photo => {
    const key = dateKeyFromIso(photo.taken_at);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(photo);
  });
  return Array.from(groups.entries())
    .map(([key, items]) => ({ key, items }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));
};

const DownloadByFolderModal = ({ open, photos, onClose }) => {
  const [expanded, setExpanded] = useState(() => new Set());
  const [checked, setChecked] = useState(() => new Set());
  const [error, setError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (open) {
      setChecked(new Set());
      setExpanded(new Set());
      setError('');
    }
  }, [open]);

  const folders = useMemo(() => groupByDate(photos), [photos]);

  if (!open) return null;

  const toggleExpand = key => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePhoto = photoId => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const isFolderChecked = folder =>
    folder.items.length > 0 && folder.items.every(p => checked.has(p.photo_id));

  const toggleFolder = folder => {
    const allChecked = isFolderChecked(folder);
    setChecked(prev => {
      const next = new Set(prev);
      folder.items.forEach(p => {
        if (allChecked) next.delete(p.photo_id);
        else next.add(p.photo_id);
      });
      return next;
    });
  };

  const handleDownload = async () => {
    setError('');
    const items = [];
    folders.forEach(folder => {
      folder.items.forEach(photo => {
        if (checked.has(photo.photo_id) && photo.r2_url) {
          items.push({
            url: photo.r2_url,
            name: `${folder.key}/${photoFileName(photo)}`,
          });
        }
      });
    });
    if (!items.length) {
      setError('Select at least one photo to download.');
      return;
    }
    setIsDownloading(true);
    try {
      await downloadPhotosZip(items);
      onClose();
    } catch (err) {
      setError(err?.message || 'Download failed.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay">
      <div
        className="modal-body"
        style={{
          maxWidth: 560,
          width: '96%',
          maxHeight: 'calc(100vh - 4rem)',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 'var(--space-sm)',
            right: 'var(--space-sm)',
            background: 'none',
            border: 'none',
            fontSize: '1.2em',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            lineHeight: 1,
          }}
          aria-label="Close modal"
        >
          ✕
        </button>

        <h3 className="modal-header">Download by Folder</h3>

        {error ? (
          <p
            style={{
              color: '#9B4A2F',
              margin: '0 0 var(--space-sm) 0',
              fontSize: '0.9em',
            }}
          >
            {error}
          </p>
        ) : null}

        {!folders.length ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            No photos available.
          </p>
        ) : null}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-xs)',
          }}
        >
          {folders.map(folder => (
            <div key={folder.key}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-sm)',
                  padding: 'var(--space-sm)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--color-surface-primary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={isFolderChecked(folder)}
                  onChange={() => toggleFolder(folder)}
                  style={{
                    width: 16,
                    height: 16,
                    accentColor: 'var(--color-primary)',
                  }}
                  aria-label={`Select all photos for ${folder.key}`}
                />
                <button
                  type="button"
                  onClick={() => toggleExpand(folder.key)}
                  className="btn-secondary btn-icon-sm"
                  title="Toggle photos"
                  style={{ fontSize: '0.72em' }}
                >
                  {expanded.has(folder.key) ? '▲' : '▼'}
                </button>
                <span
                  style={{
                    color: 'var(--color-text-primary)',
                    fontWeight: 'var(--font-weight-semibold)',
                    flex: 1,
                  }}
                >
                  {dateLabelFromKey(folder.key)}
                </span>
                <span
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  {folder.items.length}
                </span>
              </div>

              {expanded.has(folder.key) ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-xs)',
                    padding:
                      'var(--space-sm) 0 var(--space-sm) var(--space-xl)',
                  }}
                >
                  {folder.items.map(photo => (
                    <label
                      key={photo.photo_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-sm)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(photo.photo_id)}
                        onChange={() => togglePhoto(photo.photo_id)}
                        style={{
                          width: 16,
                          height: 16,
                          accentColor: 'var(--color-primary)',
                        }}
                      />
                      <img
                        src={photo.thumbnail_r2_url || photo.r2_url}
                        alt={photo.waypoint_name || 'Photo'}
                        style={{
                          width: 44,
                          height: 44,
                          objectFit: 'cover',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--color-surface-secondary)',
                        }}
                      />
                      <span
                        style={{
                          color: 'var(--color-text-secondary)',
                          fontSize: 'var(--font-size-sm)',
                        }}
                      >
                        {photo.waypoint_name || 'No waypoint'}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="btn-primary"
            disabled={isDownloading}
          >
            {isDownloading ? 'Downloading…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DownloadByFolderModal;
