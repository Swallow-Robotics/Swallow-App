import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import PlanFormModal from '../components/plan/PlanFormModal';

const WAYPOINT_ACTION_LABELS = {
  none: 'None',
  photo_45: '45 Photo',
  photo_90: '90 Photo',
  photo_360: '360 Photo',
};

const formatLastFlight = dateStr => {
  if (!dateStr) return 'Not flown yet';
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
};

const PlanTestPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { projects } = useAuth();

  const activeProjectId = searchParams.get('project_id') || null;
  const currentProject =
    (projects || []).find(p => p.project_id === activeProjectId) || null;

  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [createError, setCreateError] = useState('');
  const [editError, setEditError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [expandedPlanId, setExpandedPlanId] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const fetchPlans = useCallback(async () => {
    if (!activeProjectId) return;
    setIsLoading(true);
    setPageError('');
    try {
      const resp = await apiClient.get(
        `/v1/plans?project_id=${activeProjectId}`
      );
      setPlans(resp?.plans || []);
    } catch (err) {
      setPageError(
        err?.payload?.error || err?.message || 'Unable to load plans.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  useEffect(() => {
    const handler = e => {
      if (!e.target.closest('.plan-test-row-menu')) setMenuOpenId(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleCreate = useCallback(
    async ({ planName, planDescription, waypoints }) => {
      setCreateError('');
      try {
        await apiClient.post('/v1/plans', {
          project_id: activeProjectId,
          plan_name: planName,
          plan_description: planDescription,
          waypoints,
        });
        setIsCreateOpen(false);
        await fetchPlans();
      } catch (err) {
        setCreateError(
          err?.payload?.error || err?.message || 'Unable to create plan.'
        );
      }
    },
    [activeProjectId, fetchPlans]
  );

  const handleEdit = useCallback(
    async ({ planName, planDescription, waypoints }) => {
      if (!editingPlan?.plan_identifier) return;
      setEditError('');
      try {
        await apiClient.patch(`/v1/plans/${editingPlan.plan_identifier}`, {
          plan_name: planName,
          plan_description: planDescription,
          waypoints,
        });
        setEditingPlan(null);
        await fetchPlans();
      } catch (err) {
        setEditError(
          err?.payload?.error || err?.message || 'Unable to update plan.'
        );
      }
    },
    [editingPlan, fetchPlans]
  );

  const handleDelete = useCallback(async () => {
    if (!deletingPlan?.plan_identifier) return;
    setPageError('');
    try {
      await apiClient.delete(`/v1/plans/${deletingPlan.plan_identifier}`);
      setDeletingPlan(null);
      await fetchPlans();
    } catch (err) {
      setPageError(
        err?.payload?.error || err?.message || 'Unable to delete plan.'
      );
      setDeletingPlan(null);
    }
  }, [deletingPlan, fetchPlans]);

  return (
    <div className="page-container">
      <div className="page-content">
        <div className="page-header">
          <div className="page-header__left">
            <button
              type="button"
              onClick={() => navigate('/plan/projects')}
              className="btn-secondary"
            >
              ← Back
            </button>
          </div>
          <div className="page-header__center">
            <h2 className="page-header__title">Plan Test</h2>
            {currentProject ? (
              <p
                style={{
                  margin: 0,
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.9em',
                }}
              >
                {currentProject.project_name}
              </p>
            ) : null}
          </div>
          <div className="page-header__right">
            {activeProjectId ? (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                title="Create Plan"
                className="btn-primary btn-icon"
              >
                +
              </button>
            ) : null}
          </div>
        </div>

        {pageError ? <div className="page-error">{pageError}</div> : null}

        {!activeProjectId ? (
          <p className="page-empty">
            No active project selected. Go to Projects to select one.
          </p>
        ) : isLoading ? (
          <div className="page-empty">Loading...</div>
        ) : (
          <div
            className="data-table-container"
            style={{ overflowX: 'auto', overflowY: 'visible', position: 'relative' }}
          >
            <table
              className="data-table"
              style={{ minWidth: 580, tableLayout: 'fixed' }}
            >
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ width: '27%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '37%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: 36 }} />
              </colgroup>
              <thead>
                <tr>
                  <th />
                  <th>Plan</th>
                  <th>Version</th>
                  <th>Description</th>
                  <th>Last Flight</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map(plan => (
                  <React.Fragment key={plan.plan_id}>
                    <tr>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPlanId(prev =>
                              prev === plan.plan_id ? null : plan.plan_id
                            )
                          }
                          className="btn-secondary btn-icon-sm"
                          title="Toggle waypoints"
                          style={{ fontSize: '0.72em' }}
                        >
                          {expandedPlanId === plan.plan_id ? '▲' : '▼'}
                        </button>
                      </td>
                      <td>{plan.plan_name}</td>
                      <td>{plan.plan_version}</td>
                      <td>{plan.plan_description || ''}</td>
                      <td>{formatLastFlight(plan.last_flight)}</td>
                      <td>
                        <div
                          className="plan-test-row-menu"
                          style={{ position: 'relative', display: 'inline-block' }}
                        >
                          <button
                            type="button"
                            aria-label="Plan actions"
                            onClick={e => {
                              e.stopPropagation();
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              const menuWidth = 140;
                              const padding = 8;
                              const left = Math.min(
                                rect.left,
                                window.innerWidth - menuWidth - padding
                              );
                              setMenuPosition({
                                top: rect.bottom + 6,
                                left: Math.max(padding, left),
                              });
                              setMenuOpenId(prev =>
                                prev === plan.plan_id ? null : plan.plan_id
                              );
                            }}
                            className="btn-secondary btn-icon-sm"
                          >
                            ⋮
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedPlanId === plan.plan_id ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            padding:
                              '0 var(--space-md) var(--space-md) var(--space-xl)',
                          }}
                        >
                          {plan.waypoints?.length ? (
                            <table
                              className="data-table"
                              style={{
                                fontSize: '0.84em',
                                tableLayout: 'fixed',
                                minWidth: 480,
                              }}
                            >
                              <colgroup>
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '18%' }} />
                                <col style={{ width: '18%' }} />
                                <col style={{ width: '18%' }} />
                                <col style={{ width: '19%' }} />
                                <col style={{ width: '19%' }} />
                              </colgroup>
                              <thead>
                                <tr>
                                  <th>Seq</th>
                                  <th>Waypoint</th>
                                  <th>Action</th>
                                  <th>Alt (ft AGL)</th>
                                  <th>Latitude</th>
                                  <th>Longitude</th>
                                </tr>
                              </thead>
                              <tbody>
                                {plan.waypoints.map(wp => (
                                  <tr key={wp.waypoint_id}>
                                    <td>{wp.sequence}</td>
                                    <td>{wp.waypoint_name || ''}</td>
                                    <td>
                                      {WAYPOINT_ACTION_LABELS[wp.action] ||
                                        wp.action ||
                                        ''}
                                    </td>
                                    <td>
                                      {wp.alt != null ? wp.alt : ''}
                                    </td>
                                    <td>
                                      {wp.lat != null ? wp.lat : ''}
                                    </td>
                                    <td>
                                      {wp.lng != null ? wp.lng : ''}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <span
                              style={{
                                color: 'var(--color-text-secondary)',
                                fontSize: '0.85em',
                              }}
                            >
                              No waypoints
                            </span>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}

                {!plans.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      No plans yet. Create one to get started.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {menuOpenId ? (
          <div
            style={{
              position: 'fixed',
              top: menuPosition.top,
              left: menuPosition.left,
              background: 'var(--color-surface-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 2000,
              minWidth: 140,
              padding: 'var(--space-xs) 0',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn-menu-item"
              onClick={() => {
                const plan = plans.find(p => p.plan_id === menuOpenId);
                setMenuOpenId(null);
                setEditingPlan(plan || null);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn-menu-item btn-menu-item-destructive"
              onClick={() => {
                const plan = plans.find(p => p.plan_id === menuOpenId);
                setMenuOpenId(null);
                setDeletingPlan(plan || null);
              }}
            >
              Delete
            </button>
          </div>
        ) : null}

        <PlanFormModal
          open={isCreateOpen}
          onClose={() => {
            setIsCreateOpen(false);
            setCreateError('');
          }}
          onSubmit={handleCreate}
          initialPlan={null}
          mode="create"
          error={createError}
        />

        <PlanFormModal
          open={!!editingPlan}
          onClose={() => {
            setEditingPlan(null);
            setEditError('');
          }}
          onSubmit={handleEdit}
          initialPlan={editingPlan}
          mode="edit"
          error={editError}
        />

        {deletingPlan ? (
          <div className="modal-overlay" onClick={() => setDeletingPlan(null)}>
            <div className="modal-body" style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setDeletingPlan(null)}
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
              <h3 className="modal-header">Delete Plan</h3>
              <p style={{ color: 'var(--color-text-secondary)', marginTop: 0 }}>
                Are you sure you want to delete &ldquo;{deletingPlan.plan_name}
                &rdquo;? This cannot be undone.
              </p>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setDeletingPlan(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="btn-destructive"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PlanTestPage;
