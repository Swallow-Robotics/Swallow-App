import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import PlanCreateProjectModal from '../components/projects/PlanCreateProjectModal';
import PlanEditProjectModal from '../components/projects/PlanEditProjectModal';

const PlanProjectsPage = () => {
  const { projects, refreshProjects, isLoading, user } = useAuth();
  const [pageError, setPageError] = useState('');
  const [createError, setCreateError] = useState('');
  const [editError, setEditError] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    refreshProjects({ redirectWhenEmpty: false });
  }, [refreshProjects]);

  useEffect(() => {
    const handler = event => {
      if (!event.target.closest('.plan-row-menu')) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const visibleProjects = useMemo(
    () => (projects || []).filter(p => !p.archived),
    [projects]
  );

  const handleCreate = useCallback(
    async ({ name, orgId, address }) => {
      setCreateError('');
      try {
        await apiClient.post('/v1/projects', { name, org_id: orgId, address });
        await refreshProjects({ redirectWhenEmpty: false, force: true });
        setIsCreateOpen(false);
      } catch (err) {
        setCreateError(
          err?.payload?.error ||
            err?.message ||
            'Unable to create project. Please try again.'
        );
      }
    },
    [refreshProjects]
  );

  const handleEditSubmit = useCallback(
    async ({ name, orgId, address }) => {
      if (!editingProject?.project_id) return;
      setEditError('');
      try {
        await apiClient.patch(`/v1/projects/${editingProject.project_id}`, {
          name,
          org_id: orgId,
          address,
        });
        setEditingProject(null);
        await refreshProjects({ redirectWhenEmpty: false, force: true });
      } catch (err) {
        setEditError(
          err?.payload?.error ||
            err?.message ||
            'Unable to update project. Please try again.'
        );
      }
    },
    [editingProject, refreshProjects]
  );

  const handleArchive = useCallback(
    async project => {
      if (!project?.project_id) return;
      setPageError('');
      setMenuOpenId(null);
      try {
        await apiClient.delete(`/v1/projects/${project.project_id}`);
        await refreshProjects({ redirectWhenEmpty: false, force: true });
      } catch (err) {
        setPageError(
          err?.payload?.error ||
            err?.message ||
            'Unable to archive project. Please try again.'
        );
      }
    },
    [refreshProjects]
  );

  return (
    <div className="projects-page page-container">
      <div className="page-content">
        <div className="page-header">
          <div className="page-header__left" />
          <div className="page-header__center">
            <h2 className="page-header__title">Projects</h2>
          </div>
          <div className="page-header__right">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              title="Create Project"
              className="btn-primary btn-icon"
            >
              +
            </button>
          </div>
        </div>

        {pageError ? <div className="page-error">{pageError}</div> : null}

        {isLoading && !user ? (
          <div className="page-empty">Loading...</div>
        ) : (
          <div
            className="data-table-container"
            style={{ overflowX: 'auto', overflowY: 'visible', position: 'relative' }}
          >
            <table
              className="data-table"
              style={{ minWidth: 700, tableLayout: 'fixed' }}
            >
              <colgroup>
                <col style={{ width: '22%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '6%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Organization</th>
                  <th>Address</th>
                  <th>No. Plans</th>
                  <th>No. Flights</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map(project => {
                  const isOwner =
                    (project.role || '').toLowerCase() === 'owner';
                  return (
                    <tr key={project.project_id}>
                      <td>{project.project_name || ''}</td>
                      <td>{project.org_name || ''}</td>
                      <td>
                        {project.project_address ? (
                          project.project_address
                        ) : (
                          <span
                            style={{
                              color: '#9B4A2F',
                              fontStyle: 'italic',
                            }}
                          >
                            Project address missing
                          </span>
                        )}
                      </td>
                      <td>{project.plan_count ?? 0}</td>
                      <td>{project.flight_count ?? 0}</td>
                      <td>
                        {isOwner ? (
                          <div
                            className="plan-row-menu"
                            style={{
                              position: 'relative',
                              display: 'inline-block',
                            }}
                          >
                            <button
                              type="button"
                              aria-label="Project actions"
                              onClick={e => {
                                e.stopPropagation();
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                const menuWidth = 160;
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
                                  prev === project.project_id
                                    ? null
                                    : project.project_id
                                );
                              }}
                              className="btn-secondary btn-icon-sm"
                            >
                              ⋮
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {!visibleProjects.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ color: 'var(--color-text-secondary)' }}
                    >
                      No projects found.
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
              minWidth: 160,
              padding: 'var(--space-xs) 0',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="btn-menu-item"
              onClick={() => {
                const project = visibleProjects.find(
                  p => p.project_id === menuOpenId
                );
                setMenuOpenId(null);
                setEditingProject(project || null);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn-menu-item"
              onClick={() => {
                const projectId = menuOpenId;
                setMenuOpenId(null);
                navigate(`/plan/test?project_id=${projectId}`);
              }}
            >
              Test
            </button>
            <button
              type="button"
              className="btn-menu-item btn-menu-item-destructive"
              onClick={() => {
                const project = visibleProjects.find(
                  p => p.project_id === menuOpenId
                );
                handleArchive(project);
              }}
            >
              Archive
            </button>
          </div>
        ) : null}

        <PlanCreateProjectModal
          open={isCreateOpen}
          onClose={() => {
            setIsCreateOpen(false);
            setCreateError('');
          }}
          onSubmit={handleCreate}
          error={createError}
        />
        <PlanEditProjectModal
          open={!!editingProject}
          onClose={() => {
            setEditingProject(null);
            setEditError('');
          }}
          onSubmit={handleEditSubmit}
          initial={editingProject || {}}
          error={editError}
        />
      </div>
    </div>
  );
};

export default PlanProjectsPage;
