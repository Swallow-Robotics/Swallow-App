import React, { useEffect, useState } from 'react';
import apiClient from '../../services/api';
import WeatherLineChart from './WeatherLineChart';
import { formatFieldValue } from './weatherFields';

const RANGE_OPTIONS = [
  { key: '1h', label: '1H' },
  { key: '1d', label: '24H' },
  { key: '7d', label: '7D' },
];

const WeatherHistoryModal = ({ projectId, bsId, bsName, field, onClose }) => {
  const [range, setRange] = useState('1h');
  const [points, setPoints] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!field) return undefined;
    let cancelled = false;
    setIsLoading(true);
    setError('');
    apiClient
      .get(
        `/v1/weather/history?project_id=${projectId}&bs_id=${bsId}&range=${range}`
      )
      .then(data => {
        if (cancelled) return;
        const mapped = (data?.points || []).map(row => ({
          t: new Date(row.recorded_at).getTime(),
          v: row[field.key] != null ? Number(row[field.key]) : null,
        }));
        setPoints(mapped);
      })
      .catch(err => {
        if (!cancelled) {
          setError(err?.payload?.error || err?.message || 'Unable to load history.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, bsId, range, field]);

  if (!field) return null;

  const valueFormatter = v => formatFieldValue(field, v);

  return (
    <div role="dialog" aria-modal="true" className="modal-overlay" onClick={onClose}>
      <div
        className="modal-body"
        style={{ width: 'min(760px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 'var(--space-md)',
          }}
        >
          <div>
            <h5 style={{ margin: 0 }}>{field.label}</h5>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              {bsName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 'var(--font-size-xl)',
              lineHeight: 1,
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              padding: 'var(--space-xs)',
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-md)',
            gap: 'var(--space-sm)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRange(opt.key)}
                className={range === opt.key ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: 'var(--space-xs) var(--space-md)' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowTable(v => !v)}
          >
            {showTable ? 'View chart' : 'View table'}
          </button>
        </div>

        {error ? (
          <div className="page-error">{error}</div>
        ) : (
          <div style={{ opacity: isLoading ? 0.5 : 1, transition: 'opacity 150ms ease' }}>
            {showTable ? (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 'var(--space-xs) var(--space-sm)' }}>
                        Time
                      </th>
                      <th style={{ textAlign: 'right', padding: 'var(--space-xs) var(--space-sm)' }}>
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points].reverse().map(p => (
                      <tr key={p.t} style={{ borderTop: '1px solid var(--color-border)' }}>
                        <td
                          style={{
                            padding: 'var(--space-xs) var(--space-sm)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {new Date(p.t).toLocaleString()}
                        </td>
                        <td
                          style={{
                            padding: 'var(--space-xs) var(--space-sm)',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {valueFormatter(p.v)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <WeatherLineChart points={points} range={range} valueFormatter={valueFormatter} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WeatherHistoryModal;
