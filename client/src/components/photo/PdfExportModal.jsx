import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../services/api';
import { dateKeyFromIso, dateLabelFromKey } from '../../utils/dateTime';
import {
  requestPhotoPdfExport,
  triggerPdfBlobDownload,
} from '../../services/pdfExportService';

/** Distinct date keys present in `photos`, newest first (matches Photo Library). */
const groupDatesDesc = photos => {
  const keys = new Set();
  (photos || []).forEach(photo => {
    const key = dateKeyFromIso(photo.taken_at);
    if (key) keys.add(key);
  });
  return [...keys].sort((a, b) => (a < b ? 1 : -1));
};

/** One photo per waypoint for the given date — the oldest by taken_at. */
const oldestPhotoPerWaypoint = (photos, dateKey) => {
  const byWaypoint = new Map();
  (photos || []).forEach(photo => {
    if (!photo.waypoint_id) return;
    if (dateKeyFromIso(photo.taken_at) !== dateKey) return;
    const takenMs = new Date(photo.taken_at || 0).getTime();
    const existing = byWaypoint.get(photo.waypoint_id);
    if (!existing || takenMs < existing.takenMs) {
      byWaypoint.set(photo.waypoint_id, { photo, takenMs });
    }
  });
  return [...byWaypoint.values()].map(({ photo }) => ({
    waypoint_id: photo.waypoint_id,
    photo_id: photo.photo_id,
  }));
};

/**
 * PDF export modal for the Photos page. Lets the user pick a capture date —
 * matching the Photo Library's date folders for the current site/floor mode —
 * then downloads a PDF of the active drawing with waypoint markers
 * hyperlinked to the public photo viewer.
 */
const PdfExportModal = ({ open, projectId, drawingId, isSitePlan, onClose }) => {
  const captureMethod = isSitePlan ? 'drone' : '360_camera';

  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedDateKey(null);
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) {
      setPhotos([]);
      return undefined;
    }
    let cancelled = false;
    setIsLoading(true);
    apiClient
      .get(
        `/v1/photos/project-photos?project_id=${projectId}&capture_method=${captureMethod}`,
      )
      .then(resp => {
        if (!cancelled) setPhotos(resp?.photos || []);
      })
      .catch(err => {
        if (!cancelled) {
          setError(
            err?.payload?.error || err?.message || 'Unable to load dates.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, captureMethod]);

  const dateKeys = useMemo(() => groupDatesDesc(photos), [photos]);

  const handleDownload = useCallback(async () => {
    if (!selectedDateKey || !drawingId) return;
    const items = oldestPhotoPerWaypoint(photos, selectedDateKey);
    if (!items.length) {
      setError('No photos found for the selected date.');
      return;
    }
    setError('');
    setIsGenerating(true);
    try {
      const { blob, filename } = await requestPhotoPdfExport({
        projectId,
        drawingId,
        captureMethod,
        dateKey: selectedDateKey,
        items,
      });
      triggerPdfBlobDownload(blob, filename);
      onClose();
    } catch (err) {
      setError(
        err?.payload?.error || err?.message || 'Failed to generate PDF.',
      );
    } finally {
      setIsGenerating(false);
    }
  }, [selectedDateKey, drawingId, photos, projectId, captureMethod, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-body"
        style={{ maxWidth: 420, width: '96%', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="modal-header">PDF Export</h3>

        {error ? (
          <p
            style={{
              color: '#9B4A2F',
              margin: '0 0 var(--space-sm) 0',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Loading dates…
          </p>
        ) : !dateKeys.length ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>
            No photos available to export.
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-xs)',
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {dateKeys.map(key => {
              const isSelected = key === selectedDateKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDateKey(key)}
                  style={{
                    textAlign: 'left',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-sm) var(--space-md)',
                    background: isSelected
                      ? 'var(--color-surface-active)'
                      : 'var(--color-surface-primary)',
                    color: isSelected
                      ? 'var(--color-primary-dark)'
                      : 'var(--color-text-primary)',
                    fontWeight: isSelected
                      ? 'var(--font-weight-bold)'
                      : 'var(--font-weight-regular)',
                    cursor: 'pointer',
                  }}
                >
                  {dateLabelFromKey(key)}
                </button>
              );
            })}
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {selectedDateKey ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleDownload}
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating…' : 'Download'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PdfExportModal;
