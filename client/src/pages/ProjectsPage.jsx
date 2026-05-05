import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import EditProjectModal from '../components/projects/EditProjectModal';

const ProjectsPage = () => {
  const {
    projects,
    activeProject,
    setActiveProject,
    refreshProjects,
    isLoading,
    user,
  } = useAuth();
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const navigate = useNavigate();

  const activeProjectId = activeProject?.project_id || activeProject || null;

  const visibleProjects = useMemo(
    () => (projects || []).filter(p => !p.archived),
    [projects]
  );

  useEffect(() => {
    refreshProjects({ redirectWhenEmpty: false });
  }, [refreshProjects]);

  useEffect(() => {
    const handler = event => {
      if (!event.target.closest('.view-row-menu')) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleActivate = useCallback(
    project => {
      setActiveProject(project);
      navigate('/view/dashboard');
    },
    [navigate, setActiveProject]
  );

  const handleEdit = useCallback(project => {
    setEditingProject(project);
    setMenuOpenId(null);
  }, []);

  const handleEditSubmit = useCallback(
    async values => {
      if (!editingProject?.project_id) return;
      setError('');
      try {
        await apiClient.patch(`/v1/projects/${editingProject.project_id}`, values);
        setEditingProject(null);
        await refreshProjects({ redirectWhenEmpty: false, force: true });
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to update project. Please try again.'
        );
      }
    },
    [editingProject, refreshProjects]
  );

  const handleMembers = useCallback(
    project => {
      if (project?.project_id) {
        setMenuOpenId(null);
        navigate(`/view/projects/${project.project_id}/members`);
      }
    },
    [navigate]
  );

  const handleDelete = useCallback(
    async project => {
      if (!project?.project_id) return;
      setError('');
      setMenuOpenId(null);
      try {
        await apiClient.delete(`/v1/projects/${project.project_id}`);
        if (activeProjectId === project.project_id) {
          setActiveProject(null);
        }
        await refreshProjects({ redirectWhenEmpty: false, force: true });
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to archive project. Please try again.'
        );
      }
    },
    [activeProjectId, refreshProjects, setActiveProject]
  );

  const handleUnjoin = useCallback(
    async project => {
      if (!project?.project_id) return;
      setError('');
      setMenuOpenId(null);
      try {
        await apiClient.post(`/v1/projects/${project.project_id}/unjoin`);
        if (activeProjectId === project.project_id) {
          setActiveProject(null);
        }
        await refreshProjects({ redirectWhenEmpty: false, force: true });
      } catch (err) {
        setError(
          err?.payload?.error ||
            err?.message ||
            'Unable to unjoin project. Please try again.'
        );
      }
    },
    [activeProjectId, refreshProjects, setActiveProject]
  );

  const handleCreate = useCallback(
    async ({ name, orgId, address }) => {
      setCreateError('');
      try {
        const project = await apiClient.post('/v1/projects', {
          name,
          org_id: orgId,
          address,
        });
        await refreshProjects({ redirectWhenEmpty: false, force: true });
        setActiveProject(project);
        setIsModalOpen(false);
        navigate('/view/dashboard');
      } catch (err) {
        setCreateError(
          err?.payload?.error ||
            err?.message ||
            'Unable to create project. Please try again.'
        );
      }
    },
    [navigate, refreshProjects, setActiveProject]
  );

  const handleArchived = useCallback(() => {
    navigate('/view/projects/archived');
  }, [navigate]);

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
              onClick={() => setIsModalOpen(true)}
              title="Create Project"
              className="btn-primary btn-icon"
            >
              +
            </button>
          </div>
        </div>

        {error ? <div className="page-error">{error}</div> : null}

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
                <col style={{ width: '28%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '38%' }} />
                <col style={{ width: '6%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Organization</th>
                  <th>Address</th>
                  <th>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {visibleProjects.map(project => {
                  const isActive = project.project_id === activeProjectId;
                  const role = (project.role || '').toLowerCase();
                  const isOwner = role === 'owner';
                  const canManage =
                    role === 'owner' || role === 'administrator';
                  const canUnjoin =
                    role === 'administrator' ||
                    role === 'editor' ||
                    role === 'viewer';

                  return (
                    <tr
                      key={project.project_id}
                      onClick={() => handleActivate(project)}
                      style={{
                        cursor: 'pointer',
                        background: isActive
                          ? 'var(--color-surface-secondary)'
                          : undefined,
                      }}
                    >
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
                      <td>
                        <div
                          className="view-row-menu"
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
                              const menuWidth = 180;
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
                      </td>
                    </tr>
                  );
                })}
                {!visibleProjects.length ? (
                  <tr>
                    <td
                      colSpan={4}
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
              minWidth: 180,
              padding: 'var(--space-xs) 0',
            }}
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const project = visibleProjects.find(
                p => p.project_id === menuOpenId
              );
              if (!project) return null;
              const role = (project.role || '').toLowerCase();
              const isOwner = role === 'owner';
              const canManage =
                role === 'owner' || role === 'administrator';
              const canUnjoin =
                role === 'administrator' ||
                role === 'editor' ||
                role === 'viewer';

              return (
                <>
                  {canManage ? (
                    <button
                      type="button"
                      className="btn-menu-item"
                      onClick={() => handleEdit(project)}
                    >
                      Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-menu-item"
                    onClick={() => handleMembers(project)}
                  >
                    Project Members
                  </button>
                  {isOwner ? (
                    <button
                      type="button"
                      className="btn-menu-item btn-menu-item-destructive"
                      onClick={() => handleDelete(project)}
                    >
                      Archive
                    </button>
                  ) : null}
                  {canUnjoin ? (
                    <button
                      type="button"
                      className="btn-menu-item"
                      onClick={() => handleUnjoin(project)}
                    >
                      Unjoin
                    </button>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}

        <div
          style={{
            marginTop: 'var(--space-lg)',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={handleArchived}
            className="btn-secondary"
          >
            Archived Projects
          </button>
        </div>

        <CreateProjectModal
          open={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setCreateError('');
          }}
          onSubmit={handleCreate}
          error={createError}
        />
        <EditProjectModal
          open={!!editingProject}
          onClose={() => setEditingProject(null)}
          onSubmit={handleEditSubmit}
          initial={editingProject || {}}
        />
      </div>
    </div>
  );
};

export default ProjectsPage;
