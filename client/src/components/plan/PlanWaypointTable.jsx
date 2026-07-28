import React, { useRef, useState } from 'react';
import { WAYPOINT_ACTIONS } from '../../constants/waypointActions';

/**
 * Left-side waypoint panel shared by Plan/Create and Plan/Edit.
 *
 * Shows Plan Name/Description above a Seq/Waypoint/Action/Alt table. Rows
 * are draggable to reorder, clickable to highlight (in sync with the map or
 * drawing marker), and right-clickable for the lat/lng-edit + delete menu.
 * When `editable` is false the table is a read-only, collapsible summary.
 */
const PlanWaypointTable = ({
  planName,
  onPlanNameChange,
  planDescription,
  onPlanDescriptionChange,
  waypoints,
  editable,
  collapsible,
  collapsed,
  onToggleCollapsed,
  selectedLocalId,
  onSelectRow,
  onRowContextMenu,
  onUpdateField,
  onRemoveRow,
  onReorder,
  onAddRow,
  onSave,
  onCancel,
  saveLabel = 'Save',
  cancelLabel = 'Cancel',
  isSaving = false,
  error = '',
}) => {
  const dragSrcIndex = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    dragSrcIndex.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    const src = dragSrcIndex.current;
    setDragOverIndex(null);
    dragSrcIndex.current = null;
    if (src === null || src === index) return;
    onReorder?.(src, index);
  };

  const isOpen = !collapsible || !collapsed;

  return (
    <div className="plan-panel">
      <div className="plan-panel__header">
        <span className="plan-panel__title">Flight Plan</span>
        {collapsible ? (
          <button
            type="button"
            className="btn-secondary btn-icon-sm"
            onClick={onToggleCollapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
            style={{ fontSize: '0.72em' }}
          >
            {collapsed ? '▼' : '▲'}
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <>
          <div className="plan-panel__fields">
            <label className="form-label">
              Plan Name (required)
              <input
                type="text"
                className="form-input"
                value={planName}
                onChange={(e) => onPlanNameChange?.(e.target.value)}
                disabled={!editable}
              />
            </label>
            <label className="form-label">
              Plan Description (optional)
              <input
                type="text"
                className="form-input"
                value={planDescription}
                onChange={(e) => onPlanDescriptionChange?.(e.target.value)}
                disabled={!editable}
              />
            </label>
          </div>

          <div className="plan-panel__table-wrap">
            <table
              className="data-table"
              style={{
                width: '100%',
                tableLayout: 'fixed',
                fontSize: '0.88em',
              }}
            >
              <colgroup>
                <col style={{ width: 34 }} />
                {editable ? <col style={{ width: 22 }} /> : null}
                <col style={{ width: editable ? '25%' : '30%' }} />
                <col style={{ width: editable ? '20%' : '24%' }} />
                <col style={{ width: editable ? '29%' : '30%' }} />
                {editable ? <col style={{ width: 30 }} /> : null}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Seq</th>
                  {editable ? <th /> : null}
                  <th>Waypoint</th>
                  <th>Action</th>
                  <th>Alt (ft AGL)</th>
                  {editable ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {waypoints.map((wp, index) => {
                  const isSelected = wp.localId === selectedLocalId;
                  const isDragOver = dragOverIndex === index;
                  return (
                    <tr
                      key={wp.localId}
                      onClick={() => onSelectRow?.(wp.localId)}
                      onContextMenu={(e) => {
                        if (!editable) return;
                        e.preventDefault();
                        onRowContextMenu?.(wp.localId, e.clientX, e.clientY);
                      }}
                      draggable={editable}
                      onDragStart={
                        editable ? (e) => handleDragStart(e, index) : undefined
                      }
                      onDragOver={
                        editable ? (e) => handleDragOver(e, index) : undefined
                      }
                      onDrop={
                        editable ? (e) => handleDrop(e, index) : undefined
                      }
                      className={isSelected ? 'plan-panel__row--selected' : ''}
                      style={{
                        cursor: 'pointer',
                        background: isDragOver
                          ? 'var(--color-surface-hover)'
                          : isSelected
                            ? 'var(--color-surface-secondary)'
                            : undefined,
                      }}
                    >
                      <td
                        style={{
                          textAlign: 'center',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        {index + 1}
                      </td>
                      {editable ? (
                        <td
                          style={{
                            textAlign: 'center',
                            color: 'var(--color-text-secondary)',
                            cursor: 'grab',
                            userSelect: 'none',
                          }}
                        >
                          ≡
                        </td>
                      ) : null}
                      <td>
                        {editable ? (
                          <input
                            type="text"
                            value={wp.waypoint_name}
                            maxLength={25}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              onUpdateField?.(
                                wp.localId,
                                'waypoint_name',
                                e.target.value,
                              )
                            }
                            className="form-input"
                            style={{ width: '100%', padding: '2px 4px' }}
                          />
                        ) : (
                          wp.waypoint_name
                        )}
                      </td>
                      <td>
                        {editable ? (
                          <select
                            value={wp.action}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              onUpdateField?.(
                                wp.localId,
                                'action',
                                e.target.value,
                              )
                            }
                            className="form-select"
                            style={{
                              width: '100%',
                              padding: '2px 20px 2px 4px',
                            }}
                          >
                            {WAYPOINT_ACTIONS.map((a) => (
                              <option key={a.value} value={a.value}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          WAYPOINT_ACTIONS.find((a) => a.value === wp.action)
                            ?.label || wp.action
                        )}
                      </td>
                      <td>
                        {editable ? (
                          <input
                            type="number"
                            value={wp.alt}
                            step="any"
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              onUpdateField?.(wp.localId, 'alt', e.target.value)
                            }
                            className="form-input plan-panel__alt-input"
                            style={{ width: '100%', padding: '2px 4px' }}
                          />
                        ) : (
                          wp.alt
                        )}
                      </td>
                      {editable ? (
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveRow?.(wp.localId);
                            }}
                            className="btn-secondary btn-icon-sm"
                            title="Delete waypoint"
                            style={{ fontSize: '0.78em' }}
                          >
                            ✕
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}

                {!waypoints.length ? (
                  <tr>
                    <td
                      colSpan={editable ? 6 : 4}
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      No waypoints yet.
                    </td>
                  </tr>
                ) : null}

                {editable ? (
                  <tr
                    onClick={onAddRow}
                    className="plan-panel__add-row"
                    style={{ cursor: 'pointer', opacity: 0.55 }}
                  >
                    <td
                      colSpan={6}
                      style={{
                        textAlign: 'center',
                        padding: 'var(--space-sm)',
                      }}
                    >
                      + Add Waypoint
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {error ? (
            <p role="alert" className="plan-panel__error">
              {error}
            </p>
          ) : null}

          {editable ? (
            <div className="plan-panel__footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={onCancel}
                disabled={isSaving}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={onSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : saveLabel}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

export default PlanWaypointTable;
