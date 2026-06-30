import React, { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../../services/api';

const MAX_DRAWINGS = 5;
const ACCEPT_FILES = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

let localIdCounter = 0;
const nextLocalId = () => ++localIdCounter;

const makeGhostRow = () => ({
  localId: nextLocalId(),
  drawing_id: null,
  drawing_name: '',
  file: null,
  fileName: '',
  isGhost: true,
});

const buildInitialRows = drawings => {
  if (!drawings?.length) return [makeGhostRow()];
  const rows = drawings.map(d => ({
    localId: nextLocalId(),
    drawing_id: d.drawing_id,
    drawing_name: d.drawing_name || '',
    file: null,
    fileName: d.file_type ? `Existing (${d.file_type})` : 'Existing file',
    isGhost: false,
  }));
  if (rows.length < MAX_DRAWINGS) rows.push(makeGhostRow());
  return rows;
};

const isRowComplete = row =>
  !!row.drawing_name?.trim() && (row.drawing_id || row.file);

const DrawingsModal = ({
  open,
  projectId,
  drawings,
  drawingType,
  onClose,
  onSaved,
}) => {
  const [rows, setRows] = useState([makeGhostRow()]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const dragSrcIndex = useRef(null);
  const fileInputs = useRef({});

  useEffect(() => {
    if (!open) return;
    setError('');
    setRows(buildInitialRows(drawings));
  }, [open, drawings]);

  const activeRows = rows.filter(r => !r.isGhost);

  const updateRow = (localId, changes) => {
    setRows(prev => {
      let activated = false;
      const updated = prev.map(row => {
        if (row.localId !== localId) return row;
        const next = { ...row, ...changes };
        if (row.isGhost) {
          next.isGhost = false;
          activated = true;
        }
        return next;
      });
      if (activated) {
        const count = updated.filter(r => !r.isGhost).length;
        if (count < MAX_DRAWINGS && !updated.some(r => r.isGhost)) {
          updated.push(makeGhostRow());
        }
      }
      return updated;
    });
  };

  const removeRow = localId => {
    setRows(prev => {
      const filtered = prev.filter(r => r.localId !== localId);
      const count = filtered.filter(r => !r.isGhost).length;
      if (!filtered.some(r => r.isGhost) && count < MAX_DRAWINGS) {
        filtered.push(makeGhostRow());
      }
      return filtered.length ? filtered : [makeGhostRow()];
    });
  };

  const handleDragStart = (e, index) => {
    dragSrcIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    const srcIndex = dragSrcIndex.current;
    if (srcIndex === null || srcIndex === dropIndex) return;
    setRows(prev => {
      const active = prev.filter(r => !r.isGhost);
      const ghost = prev.find(r => r.isGhost);
      const reordered = [...active];
      const [moved] = reordered.splice(srcIndex, 1);
      reordered.splice(dropIndex, 0, moved);
      return ghost ? [...reordered, ghost] : reordered;
    });
    dragSrcIndex.current = null;
  }, []);

  const handleFile = (localId, fileList) => {
    const file = fileList?.[0];
    if (!file) return;
    updateRow(localId, { file, fileName: file.name });
  };

  const handleSave = async () => {
    setError('');
    if (!activeRows.length) {
      setError('Add at least one drawing.');
      return;
    }
    const incomplete = activeRows.find(r => !isRowComplete(r));
    if (incomplete) {
      setError('Fill in the name and file for every drawing.');
      return;
    }

    const formData = new FormData();
    formData.append('project_id', projectId);
    const payload = activeRows.map((row, i) => {
      const entry = {
        drawing_name: row.drawing_name.trim(),
        order: i + 1,
      };
      if (drawingType) {
        entry.drawing_type = drawingType;
      }
      if (row.drawing_id) {
        entry.drawing_id = row.drawing_id;
      } else {
        const key = `file_${row.localId}`;
        entry.file_key = key;
        formData.append(key, row.file);
      }
      return entry;
    });
    formData.append('payload', JSON.stringify(payload));

    setIsSaving(true);
    try {
      const resp = await apiClient.request('/v1/drawings', {
        method: 'PUT',
        body: formData,
      });
      onSaved?.(resp?.drawings || []);
      onClose();
    } catch (err) {
      setError(
        err?.payload?.message || err?.message || 'Unable to save drawings.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-body"
        style={{ maxWidth: 640, width: '96%', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
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
        >
          ✕
        </button>

        <h3 className="modal-header">Drawings</h3>

        <div style={{ overflowX: 'auto', marginBottom: 'var(--space-md)' }}>
          <table
            className="data-table"
            style={{ width: '100%', fontSize: 'var(--font-size-sm)' }}
          >
            <thead>
              <tr>
                <th style={{ width: 48, textAlign: 'center' }}>Order</th>
                <th />
                <th>Name</th>
                <th>File</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const activeIndex = activeRows.findIndex(
                  a => a.localId === row.localId,
                );
                const seq = row.isGhost ? '' : activeIndex + 1;
                const opacity = row.isGhost ? 0.4 : 1;

                return (
                  <tr
                    key={row.localId}
                    style={{ opacity }}
                    draggable={!row.isGhost}
                    onDragStart={
                      !row.isGhost
                        ? e => handleDragStart(e, activeIndex)
                        : undefined
                    }
                    onDrop={
                      !row.isGhost
                        ? e => handleDrop(e, activeIndex)
                        : undefined
                    }
                    onDragOver={!row.isGhost ? handleDragOver : undefined}
                  >
                    <td
                      style={{
                        textAlign: 'center',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {seq}
                    </td>
                    <td
                      style={{
                        textAlign: 'center',
                        cursor: row.isGhost ? 'default' : 'grab',
                        userSelect: 'none',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {row.isGhost ? '' : '≡'}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.drawing_name}
                        onChange={e =>
                          updateRow(row.localId, {
                            drawing_name: e.target.value,
                          })
                        }
                        className="form-input"
                        style={{ width: '100%', padding: '2px 4px' }}
                        placeholder="Drawing name"
                      />
                    </td>
                    <td>
                      {row.drawing_id && !row.file ? (
                        <span
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {row.fileName}
                        </span>
                      ) : (
                        <>
                          <input
                            ref={el => {
                              fileInputs.current[row.localId] = el;
                            }}
                            type="file"
                            accept={ACCEPT_FILES}
                            style={{ display: 'none' }}
                            onChange={e => handleFile(row.localId, e.target.files)}
                          />
                          <button
                            type="button"
                            className="btn-secondary btn-choose-file"
                            onClick={() =>
                              fileInputs.current[row.localId]?.click()
                            }
                          >
                            {row.fileName || 'Choose file'}
                          </button>
                        </>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!row.isGhost ? (
                        <button
                          type="button"
                          onClick={() => removeRow(row.localId)}
                          className="btn-secondary btn-icon-sm"
                          title="Remove drawing"
                          style={{ fontSize: '0.78em' }}
                        >
                          ✕
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {error ? (
          <p
            role="alert"
            style={{
              color: 'var(--color-error, #b91c1c)',
              fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--space-sm)',
            }}
          >
            {error}
          </p>
        ) : null}

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DrawingsModal;
