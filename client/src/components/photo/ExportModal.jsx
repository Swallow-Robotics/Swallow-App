import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../services/api';
import { dateKeyFromIso, dateLabelFromKey } from '../../utils/dateTime';
import photosLinkExportService from '../../services/photosLinkExportService';
import {
  requestPhotoPdfExport,
  triggerPdfBlobDownload,
} from '../../services/pdfExportService';

const ALL_DATES_VALUE = 'all';
const CUSTOM_DATES_VALUE = 'custom';

/** Distinct date keys present in `photos`, newest first (matches Photo Library). */
const groupDatesDesc = photos => {
  const keys = new Set();
  (photos || []).forEach(photo => {
    const key = dateKeyFromIso(photo.taken_at);
    if (key) keys.add(key);
  });
  return [...keys].sort((a, b) => (a < b ? 1 : -1));
};

/**
 * Export modal for the Photos page: one Date Selection control (all dates,
 * a single date, or a custom set of dates) that drives both Public Link and
 * PDF Export. The server always re-derives the included photos from this
 * date filter — no photo/waypoint items are sent from the client.
 */
const ExportModal = ({ open, projectId, drawingId, isSitePlan, onClose }) => {
  const captureMethod = isSitePlan ? 'drone' : '360_camera';

  const [photos, setPhotos] = useState([]);
  const [isLoadingDates, setIsLoadingDates] = useState(false);
  const [dropdownValue, setDropdownValue] = useState(ALL_DATES_VALUE);
  const [customDates, setCustomDates] = useState(() => new Set());
  const [actionError, setActionError] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [linkPanel, setLinkPanel] = useState(null);

  useEffect(() => {
    if (open) {
      setDropdownValue(ALL_DATES_VALUE);
      setCustomDates(new Set());
      setActionError('');
      setLinkPanel(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) {
      setPhotos([]);
      return undefined;
    }
    let cancelled = false;
    setIsLoadingDates(true);
    apiClient
      .get(
        `/v1/photos/project-photos?project_id=${projectId}&capture_method=${captureMethod}`,
      )
      .then(resp => {
        if (!cancelled) setPhotos(resp?.photos || []);
      })
      .catch(err => {
        if (!cancelled) {
          setActionError(
            err?.payload?.error || err?.message || 'Unable to load dates.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, captureMethod]);

  const dateKeys = useMemo(() => groupDatesDesc(photos), [photos]);

  const { dateMode, dates } = useMemo(() => {
    if (dropdownValue === ALL_DATES_VALUE) return { dateMode: 'all', dates: [] };
    if (dropdownValue === CUSTOM_DATES_VALUE) {
      return { dateMode: 'custom', dates: [...customDates].sort() };
    }
    return { dateMode: 'single', dates: [dropdownValue] };
  }, [dropdownValue, customDates]);

  const dateSelectionKey = `${dateMode}:${dates.join(',')}`;

  // Any change to the effective date selection invalidates a previously
  // shown Public Link — it must not look like it belongs to new dates.
  useEffect(() => {
    setLinkPanel(null);
    setActionError('');
  }, [dateSelectionKey]);

  const canExport =
    !isLoadingDates &&
    dateKeys.length > 0 &&
    (dropdownValue !== CUSTOM_DATES_VALUE || customDates.size > 0);

  const toggleCustomDate = key => {
    setCustomDates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handlePublicLink = useCallback(async () => {
    if (!canExport) return;
    setActionError('');
    setIsGeneratingLink(true);
    try {
      const resp = await photosLinkExportService.createOrReuse({
        projectId,
        captureMethod,
        drawingId,
        dateMode,
        dates,
      });
      setLinkPanel({ url: resp?.url || '' });
    } catch (err) {
      setActionError(
        err?.payload?.error || err?.message || 'Failed to create Public Link.',
      );
    } finally {
      setIsGeneratingLink(false);
    }
  }, [canExport, projectId, captureMethod, drawingId, dateMode, dates]);

  const handlePdfExport = useCallback(async () => {
    if (!canExport || !drawingId) return;
    setActionError('');
    setIsGeneratingPdf(true);
    try {
      const { blob, filename } = await requestPhotoPdfExport({
        projectId,
        drawingId,
        captureMethod,
        dateMode,
        dates,
      });
      triggerPdfBlobDownload(blob, filename);
    } catch (err) {
      setActionError(
        err?.payload?.error || err?.message || 'Failed to generate PDF.',
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [canExport, drawingId, projectId, captureMethod, dateMode, dates]);

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay" onClick={onClose}>
      <div
        className="modal-body"
        style={{ maxWidth: 460, width: '96%', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 'var(--space-sm)',
            right: 'var(--space-sm)',
            zIndex: 1,
            background: 'none',
            border: 'none',
            fontSize: '1.2em',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            lineHeight: 1,
            padding: 'var(--space-xs)',
          }}
          aria-label="Close modal"
        >
          ✕
        </button>

        <h3 className="modal-header" style={{ paddingRight: 'var(--space-xl)' }}>
          Export
        </h3>

        <div className="modal-form">
          <label className="form-label" htmlFor="export-date-selection">
            Date Selection
            <select
              id="export-date-selection"
              className="form-select"
              value={dropdownValue}
              onChange={e => setDropdownValue(e.target.value)}
              disabled={isLoadingDates || !dateKeys.length}
            >
              <option value={ALL_DATES_VALUE}>All dates</option>
              {dateKeys.map(key => (
                <option key={key} value={key}>
                  {dateLabelFromKey(key)}
                </option>
              ))}
              <option value={CUSTOM_DATES_VALUE}>Custom dates</option>
            </select>
          </label>

          {dropdownValue === CUSTOM_DATES_VALUE ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-xs)',
                maxHeight: 220,
                overflowY: 'auto',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-sm) var(--space-md)',
              }}
            >
              {dateKeys.map(key => (
                <label
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={customDates.has(key)}
                    onChange={() => toggleCustomDate(key)}
                    style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                    {dateLabelFromKey(key)}
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </div>

        {isLoadingDates ? (
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-md)' }}>
            Loading dates…
          </p>
        ) : !dateKeys.length ? (
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-md)' }}>
            No photos available to export.
          </p>
        ) : null}

        {actionError ? (
          <p
            style={{
              color: '#9B4A2F',
              margin: 'var(--space-md) 0 0 0',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {actionError}
          </p>
        ) : null}

        {linkPanel ? (
          <div
            style={{
              marginTop: 'var(--space-md)',
              paddingTop: 'var(--space-md)',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <h4
              style={{
                margin: 0,
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-base)',
                fontWeight: 'var(--font-weight-semibold)',
              }}
            >
              Public Link
            </h4>
            <p
              style={{
                margin: '0 0 var(--space-sm) 0',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              (no login required)
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-sm)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-sm) var(--space-md)',
                background: 'var(--color-surface-secondary)',
              }}
            >
              <a
                href={linkPanel.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--color-primary-dark)',
                  fontWeight: 'var(--font-weight-medium)',
                }}
              >
                {linkPanel.url}
              </a>
              <button
                type="button"
                className="btn-secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(linkPanel.url);
                    setLinkPanel(prev => (prev ? { ...prev, copied: true } : prev));
                  } catch {
                    // ignore clipboard failures
                  }
                }}
              >
                {linkPanel.copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePublicLink}
            disabled={!canExport || isGeneratingLink}
          >
            {isGeneratingLink ? 'Generating…' : 'Public Link'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePdfExport}
            disabled={!canExport || isGeneratingPdf}
          >
            {isGeneratingPdf ? 'Generating…' : 'PDF Export'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
