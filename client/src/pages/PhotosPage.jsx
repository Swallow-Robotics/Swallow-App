import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context';
import {
  useViewMode,
  SITE_PLAN,
  FLOOR_PLAN,
} from '../context/ViewModeContext';
import apiClient from '../services/api';
import { useActivePlanWaypoints } from '../hooks/useActivePlanWaypoints';
import DrawingSwitcher from '../components/drawings/DrawingSwitcher';
import DrawingsModal from '../components/drawings/DrawingsModal';
import AlignDrawingModal from '../components/drawings/AlignDrawingModal';
import DrawingCanvas from '../components/drawings/DrawingCanvas';
import WaypointPhotosModal from '../components/map/WaypointPhotosModal';
import EditLocationModal from '../components/map/EditLocationModal';
import UploadPhotosModal from '../components/photo/UploadPhotosModal';
import ExportModal from '../components/photo/ExportModal';
import PhotoMapLive from '../PhotoMapLive';
import PhotoLibraryPage from './PhotoLibraryPage';
import {
  geoToPixel,
  isDrawingAligned,
  waypointsToPixelPositions,
} from '../utils/drawingAffineTransform';

// ---------------------------------------------------------------------------
// Waypoint name prompt (inline mini-modal)
// ---------------------------------------------------------------------------
const WaypointNamePrompt = ({ onConfirm, onCancel }) => {
  const [name, setName] = useState('');
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      onClick={onCancel}
    >
      <div
        className="modal-body"
        style={{ maxWidth: 320, width: '96%', position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="modal-header">New Waypoint</h3>
        <input
          type="text"
          className="form-input"
          placeholder="Waypoint name (optional)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onConfirm(name.trim() || null);
            if (e.key === 'Escape') onCancel();
          }}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          style={{ width: '100%', marginBottom: 'var(--space-md)' }}
        />
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onConfirm(name.trim() || null)}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Floating context menu container
// ---------------------------------------------------------------------------
const FloatingMenu = ({ screenX, screenY, onClose, children }) => {
  useEffect(() => {
    const close = () => onClose();
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: screenY,
        left: screenX,
        zIndex: 1100,
        background: 'var(--color-surface-primary)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        minWidth: 160,
        padding: 'var(--space-xs) 0',
        overflow: 'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Right-click context menu on the drawing surface (Add Waypoint)
// ---------------------------------------------------------------------------
const DrawingContextMenu = ({ screenX, screenY, onAddWaypoint, onClose }) => (
  <FloatingMenu screenX={screenX} screenY={screenY} onClose={onClose}>
    <button type="button" className="btn-menu-item" onClick={onAddWaypoint}>
      Add Waypoint
    </button>
  </FloatingMenu>
);

// ---------------------------------------------------------------------------
// Right-click context menu on an existing waypoint
// ---------------------------------------------------------------------------
const WaypointContextMenu = ({
  screenX,
  screenY,
  onAddPhoto,
  onMove,
  onDelete,
  onClose,
}) => (
  <FloatingMenu screenX={screenX} screenY={screenY} onClose={onClose}>
    <button type="button" className="btn-menu-item" onClick={onAddPhoto}>
      Add Photo
    </button>
    <button type="button" className="btn-menu-item" onClick={onMove}>
      Move
    </button>
    <button
      type="button"
      className="btn-menu-item btn-menu-item-destructive"
      onClick={onDelete}
    >
      Delete
    </button>
  </FloatingMenu>
);

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------
const DeleteConfirmDialog = ({ waypoint, onConfirm, onCancel }) => (
  <div
    role="dialog"
    aria-modal="true"
    className="modal-overlay"
    onClick={onCancel}
  >
    <div
      className="modal-body"
      style={{ maxWidth: 360, width: '96%' }}
      onClick={e => e.stopPropagation()}
    >
      <h3 className="modal-header">Delete Waypoint</h3>
      <p
        style={{
          margin: 'var(--space-sm) 0 var(--space-md)',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-sm)',
        }}
      >
        Delete{' '}
        <strong>{waypoint.waypoint_name || 'this waypoint'}</strong> and all its
        photos? This cannot be undone.
      </p>
      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-critical" onClick={onConfirm}>
          Delete
        </button>
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Options popup
// ---------------------------------------------------------------------------
const OptionsPopup = ({
  isSitePlan,
  canManage,
  hasActiveDrawing,
  onMapView,
  onDrawings,
  onAlignDrawing,
  onAddWaypoint,
  onLibrary,
  onClose,
}) => {
  const popupRef = useRef(null);

  useEffect(() => {
    const handleClick = e => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={popupRef} className="photos-page__options-popup">
      {isSitePlan ? (
        <button type="button" className="btn-menu-item" onClick={onMapView}>
          Map View
        </button>
      ) : null}
      {canManage ? (
        <button type="button" className="btn-menu-item" onClick={onDrawings}>
          Add/Edit Drawings
        </button>
      ) : null}
      {isSitePlan && canManage ? (
        <button
          type="button"
          className="btn-menu-item"
          onClick={onAlignDrawing}
          disabled={!hasActiveDrawing}
        >
          Align Drawing
        </button>
      ) : null}
      {!isSitePlan && canManage ? (
        <button type="button" className="btn-menu-item" onClick={onAddWaypoint}>
          Add Waypoint
        </button>
      ) : null}
      <button type="button" className="btn-menu-item" onClick={onLibrary}>
        Photo Library
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Site / Floor mode toggle — matches Standard / Satellite basemap toggle style
// ---------------------------------------------------------------------------
const ModeToggle = ({ viewMode, setViewMode }) => (
  <div className="view-mode-toggle" role="group" aria-label="View mode">
    <button
      type="button"
      className={`view-mode-toggle__btn${viewMode === SITE_PLAN ? ' view-mode-toggle__btn--active' : ''}`}
      onClick={() => setViewMode(SITE_PLAN)}
    >
      Site
    </button>
    <div className="view-mode-toggle__divider" aria-hidden="true" />
    <button
      type="button"
      className={`view-mode-toggle__btn${viewMode === FLOOR_PLAN ? ' view-mode-toggle__btn--active' : ''}`}
      onClick={() => setViewMode(FLOOR_PLAN)}
    >
      Floor
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Main Photos page
// ---------------------------------------------------------------------------
const PhotosPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const subView = searchParams.get('v') || 'drawing';

  const navigate = useNavigate();
  const { activeProject, roleForActiveProject, projects } = useAuth();
  const { viewMode, setViewMode, isSitePlan, isFloorPlan } = useViewMode();

  const projectId =
    (typeof activeProject === 'string'
      ? activeProject
      : activeProject?.project_id || activeProject?.id) || null;

  const role = useMemo(
    () => (projectId ? roleForActiveProject(projectId) : null),
    [projectId, roleForActiveProject],
  );
  const canManage = useMemo(() => {
    const r = (role || '').toLowerCase();
    return r === 'owner' || r === 'administrator';
  }, [role]);

  const activeProjectRow = useMemo(
    () => (projects || []).find(p => p.project_id === projectId) || null,
    [projects, projectId],
  );

  const projectCenter = useMemo(() => {
    if (
      !activeProjectRow ||
      activeProjectRow.address_lat == null ||
      activeProjectRow.address_lng == null
    )
      return null;
    const lat = Number(activeProjectRow.address_lat);
    const lng = Number(activeProjectRow.address_lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [activeProjectRow]);

  // Drawing state
  const [drawings, setDrawings] = useState([]);
  const [activeDrawingId, setActiveDrawingId] = useState(null);
  const [activeDrawingDetail, setActiveDrawingDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawingsModalOpen, setDrawingsModalOpen] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Site plan only
  const [alignModalOpen, setAlignModalOpen] = useState(false);
  const [editLocationOpen, setEditLocationOpen] = useState(false);

  // Shared waypoint photo modal
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);

  // Floor plan only
  const [isAddWaypointMode, setIsAddWaypointMode] = useState(false);
  const [pendingWaypointPixel, setPendingWaypointPixel] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [movingWaypointId, setMovingWaypointId] = useState(null);
  const [deleteWaypoint, setDeleteWaypoint] = useState(null);
  const [uploadWaypointId, setUploadWaypointId] = useState(null);
  const [uploadDrawingId, setUploadDrawingId] = useState(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [floorWaypoints, setFloorWaypoints] = useState([]);
  const [isLoadingWaypoints, setIsLoadingWaypoints] = useState(false);

  const drawingType = isSitePlan ? 'site_plan' : 'floor_plan';

  const setSubView = useCallback(
    v => {
      if (v === 'drawing') setSearchParams({});
      else setSearchParams({ v });
    },
    [setSearchParams],
  );

  // Redirect map sub-view to drawing if in floor plan mode
  useEffect(() => {
    if (subView === 'map' && isFloorPlan) {
      setSubView('drawing');
    }
  }, [subView, isFloorPlan, setSubView]);

  const orderedDrawings = useMemo(
    () =>
      [...drawings].sort(
        (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0),
      ),
    [drawings],
  );

  const activeDrawing = useMemo(() => {
    if (activeDrawingDetail?.drawing_id === activeDrawingId)
      return activeDrawingDetail;
    return orderedDrawings.find(d => d.drawing_id === activeDrawingId) || null;
  }, [activeDrawingDetail, activeDrawingId, orderedDrawings]);

  // Site plan: waypoints from active plan
  const { waypoints: sitePlanWaypoints } = useActivePlanWaypoints(
    isSitePlan ? projectId : null,
    refreshCounter,
    'drone',
  );

  const aligned = activeDrawing && isDrawingAligned(activeDrawing);

  const sitePlanWaypointMarkers = useMemo(() => {
    if (!isSitePlan || !aligned) return [];
    return waypointsToPixelPositions(activeDrawing, sitePlanWaypoints);
  }, [isSitePlan, activeDrawing, aligned, sitePlanWaypoints]);

  const projectMarker = useMemo(() => {
    if (!isSitePlan || !aligned || !projectCenter) return null;
    const pos = geoToPixel(
      activeDrawing,
      projectCenter.lat,
      projectCenter.lng,
    );
    if (!pos) return null;
    return {
      pixelX: pos.x,
      pixelY: pos.y,
      name: activeProjectRow?.project_name || 'Project location',
    };
  }, [isSitePlan, activeDrawing, aligned, projectCenter, activeProjectRow]);

  // Floor plan: waypoints from /api/v1/waypoints
  const fetchFloorWaypoints = useCallback(async () => {
    if (!projectId || !activeDrawingId || isFloorPlan === false) return;
    setIsLoadingWaypoints(true);
    try {
      const resp = await apiClient.get(
        `/v1/waypoints?project_id=${projectId}&drawing_id=${activeDrawingId}`,
      );
      setFloorWaypoints(resp?.waypoints || []);
    } catch {
      setFloorWaypoints([]);
    } finally {
      setIsLoadingWaypoints(false);
    }
  }, [projectId, activeDrawingId, isFloorPlan]);

  useEffect(() => {
    if (isFloorPlan) fetchFloorWaypoints();
  }, [isFloorPlan, fetchFloorWaypoints]);

  const floorWaypointMarkers = useMemo(() => {
    if (!isFloorPlan) return [];
    return floorWaypoints
      .filter(
        wp =>
          wp.drawing_id === activeDrawingId &&
          wp.pixel_x != null &&
          wp.pixel_y != null,
      )
      .map(wp => ({
        ...wp,
        pixelX: wp.pixel_x,
        pixelY: wp.pixel_y,
        isMoving: wp.waypoint_id === movingWaypointId,
      }));
  }, [isFloorPlan, floorWaypoints, activeDrawingId, movingWaypointId]);

  // Fetch drawings
  const fetchDrawings = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError('');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const resp = await apiClient.get(
          `/v1/drawings?project_id=${projectId}&drawing_type=${drawingType}`,
        );
        const list = resp?.drawings || [];
        setDrawings(list);
        if (list.length) {
          const sorted = [...list].sort(
            (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0),
          );
          setActiveDrawingId(prev =>
            prev && sorted.some(d => d.drawing_id === prev)
              ? prev
              : sorted[0].drawing_id,
          );
        } else {
          setActiveDrawingId(null);
          setActiveDrawingDetail(null);
        }
        setIsLoading(false);
        return;
      } catch (err) {
        if (attempt < 2) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise(resolve =>
            setTimeout(resolve, 250 * (attempt + 1)),
          );
          // eslint-disable-next-line no-continue
          continue;
        }
        setDrawings([]);
        setError(
          err?.payload?.message || err?.message || 'Unable to load drawings.',
        );
      }
    }
    setIsLoading(false);
  }, [projectId, drawingType]);

  const fetchDrawingDetail = useCallback(async drawingId => {
    if (!drawingId) {
      setActiveDrawingDetail(null);
      return;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const resp = await apiClient.get(`/v1/drawings/${drawingId}`);
        setActiveDrawingDetail(resp?.drawing || null);
        return;
      } catch {
        if (attempt < 2) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise(resolve =>
            setTimeout(resolve, 250 * (attempt + 1)),
          );
        }
      }
    }
    setActiveDrawingDetail(null);
  }, []);

  useEffect(() => {
    fetchDrawings();
    setIsAddWaypointMode(false);
    setPendingWaypointPixel(null);
    setContextMenu(null);
    setMovingWaypointId(null);
    setDeleteWaypoint(null);
  }, [fetchDrawings]);

  useEffect(() => {
    if (isSitePlan) fetchDrawingDetail(activeDrawingId);
  }, [isSitePlan, activeDrawingId, fetchDrawingDetail]);

  useEffect(() => {
    if (isFloorPlan && activeDrawingId) fetchFloorWaypoints();
  }, [isFloorPlan, activeDrawingId, fetchFloorWaypoints]);

  const handleDrawingsSaved = list => {
    setDrawings(list);
    if (list.length) {
      const sorted = [...list].sort(
        (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0),
      );
      setActiveDrawingId(sorted[0].drawing_id);
    }
  };

  const handleAlignmentSaved = drawing => {
    setActiveDrawingDetail(drawing);
    setDrawings(prev =>
      prev.map(d => (d.drawing_id === drawing.drawing_id ? drawing : d)),
    );
  };

  const handleLocationSave = useCallback(() => {
    setEditLocationOpen(false);
    setRefreshCounter(c => c + 1);
  }, []);

  // Canvas click — floor plan add/move modes
  const handleCanvasClick = useCallback(
    pixel => {
      if (!isFloorPlan || !activeDrawingId) return;
      if (movingWaypointId) {
        const wpId = movingWaypointId;
        setMovingWaypointId(null);
        setFloorWaypoints(prev =>
          prev.map(wp =>
            wp.waypoint_id === wpId
              ? { ...wp, pixel_x: pixel.pixel_x, pixel_y: pixel.pixel_y }
              : wp,
          ),
        );
        apiClient
          .patch(`/v1/waypoints/${wpId}`, {
            pixel_x: pixel.pixel_x,
            pixel_y: pixel.pixel_y,
          })
          .catch(err => {
            setError(
              err?.payload?.message ||
                err?.message ||
                'Failed to move waypoint.',
            );
            fetchFloorWaypoints();
          });
        return;
      }
      if (isAddWaypointMode) {
        setContextMenu(null);
        setPendingWaypointPixel(pixel);
      }
    },
    [
      isFloorPlan,
      activeDrawingId,
      movingWaypointId,
      isAddWaypointMode,
      fetchFloorWaypoints,
    ],
  );

  // Right-click on drawing surface → "Add Waypoint"
  const handleCanvasContextMenu = useCallback(
    ({ pixel, screenX, screenY }) => {
      if (!isFloorPlan || !activeDrawingId || !canManage) return;
      setContextMenu({ kind: 'drawing', pixel, screenX, screenY });
    },
    [isFloorPlan, activeDrawingId, canManage],
  );

  const handleContextMenuAddWaypoint = useCallback(() => {
    if (!contextMenu) return;
    setPendingWaypointPixel(contextMenu.pixel);
    setContextMenu(null);
    setIsAddWaypointMode(false);
  }, [contextMenu]);

  // Right-click on waypoint marker
  const handleWaypointContextMenu = useCallback(
    (marker, screenX, screenY) => {
      if (!isFloorPlan || !canManage) return;
      setContextMenu({ kind: 'waypoint', waypoint: marker, screenX, screenY });
    },
    [isFloorPlan, canManage],
  );

  // Create new waypoint after name prompt
  const handleCreateWaypoint = useCallback(
    async waypointName => {
      if (!pendingWaypointPixel || !projectId || !activeDrawingId) return;
      const px = pendingWaypointPixel.pixel_x;
      const py = pendingWaypointPixel.pixel_y;
      setPendingWaypointPixel(null);
      try {
        await apiClient.post('/v1/waypoints', {
          project_id: projectId,
          drawing_id: activeDrawingId,
          pixel_x: px,
          pixel_y: py,
          waypoint_name: waypointName,
        });
        fetchFloorWaypoints();
      } catch (err) {
        setError(
          err?.payload?.message || err?.message || 'Failed to create waypoint.',
        );
      }
    },
    [pendingWaypointPixel, projectId, activeDrawingId, fetchFloorWaypoints],
  );

  // Delete after confirmation
  const handleDeleteWaypointConfirm = useCallback(async () => {
    if (!deleteWaypoint) return;
    const waypointId = deleteWaypoint.waypoint_id;
    setDeleteWaypoint(null);
    try {
      await apiClient.delete(`/v1/waypoints/${waypointId}`);
      fetchFloorWaypoints();
    } catch (err) {
      setError(
        err?.payload?.message || err?.message || 'Failed to delete waypoint.',
      );
    }
  }, [deleteWaypoint, fetchFloorWaypoints]);

  const cancelAddWaypoint = useCallback(() => {
    setIsAddWaypointMode(false);
    setMovingWaypointId(null);
    setPendingWaypointPixel(null);
  }, []);

  const waypointMarkers = isSitePlan
    ? sitePlanWaypointMarkers
    : floorWaypointMarkers;

  // ----- No project -----
  if (!projectId) {
    return (
      <div className="drawings-page drawings-page--empty">
        <p className="drawings-page__message">
          Select a project to view photos.
        </p>
      </div>
    );
  }

  // ----- Photo Library sub-view -----
  if (subView === 'library') {
    return (
      <div className="drawings-page">
        <div className="photos-page__library">
          <PhotoLibraryPage onBack={() => setSubView('drawing')} />
        </div>
        <DrawingsModal
          open={drawingsModalOpen}
          projectId={projectId}
          drawings={drawings}
          drawingType={drawingType}
          onClose={() => setDrawingsModalOpen(false)}
          onSaved={handleDrawingsSaved}
        />
      </div>
    );
  }

  // ----- Map sub-view -----
  if (subView === 'map') {
    return (
      <div className="drawings-page">
        <div className="drawings-page__canvas-wrapper">
          <PhotoMapLive onExport={() => setExportModalOpen(true)} />
          <div className="drawings-page__controls">
            <button
              type="button"
              className="btn-format-1 drawings-page__tool-btn"
              onClick={() => setSubView('drawing')}
            >
              ‹ Back
            </button>
          </div>
        </div>
        <EditLocationModal
          open={editLocationOpen}
          onClose={() => setEditLocationOpen(false)}
          onSave={handleLocationSave}
          projectId={projectId}
          projectMarker={
            projectCenter
              ? { latitude: projectCenter.lat, longitude: projectCenter.lng }
              : null
          }
          mapInstance={null}
        />
        <ExportModal
          open={exportModalOpen}
          projectId={projectId}
          drawingId={activeDrawingId}
          isSitePlan={isSitePlan}
          onClose={() => setExportModalOpen(false)}
        />
      </div>
    );
  }

  // ----- Drawing sub-view (default) -----

  const renderDrawingContent = () => {
    if (isLoading) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p className="drawings-page__message">Loading drawings…</p>
        </div>
      );
    }
    if (error) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p className="drawings-page__message drawings-page__message--error">
            {error}
          </p>
        </div>
      );
    }
    if (!orderedDrawings.length) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-md)',
          }}
        >
          <p className="drawings-page__message">No drawings uploaded</p>
        </div>
      );
    }
    return (
      <>
        {activeDrawing?.r2_url ? (
          <DrawingCanvas
            src={activeDrawing.r2_url}
            alt={activeDrawing.drawing_name || 'Drawing'}
            width={activeDrawing.width}
            height={activeDrawing.height}
            waypointMarkers={
              isSitePlan
                ? waypointMarkers
                : isLoadingWaypoints
                  ? []
                  : floorWaypointMarkers
            }
            projectMarker={isSitePlan ? projectMarker : null}
            onWaypointClick={wp => setSelectedWaypoint(wp)}
            onWaypointContextMenu={
              isFloorPlan && canManage ? handleWaypointContextMenu : undefined
            }
            onProjectMarkerClick={
              isSitePlan && canManage
                ? () => setEditLocationOpen(true)
                : undefined
            }
            onImageClick={
              isFloorPlan && (isAddWaypointMode || !!movingWaypointId)
                ? handleCanvasClick
                : undefined
            }
            onContextMenu={
              isFloorPlan && canManage ? handleCanvasContextMenu : undefined
            }
          />
        ) : null}
        {isSitePlan && !aligned && orderedDrawings.length ? (
          <p className="drawings-page__align-hint">
            Align this drawing to view waypoints.
          </p>
        ) : null}
        {isFloorPlan && movingWaypointId ? (
          <p className="drawings-page__align-hint">
            Click anywhere on the drawing to move the waypoint.
          </p>
        ) : isFloorPlan && isAddWaypointMode ? (
          <p className="drawings-page__align-hint">
            Click anywhere on the drawing to place a waypoint.
          </p>
        ) : null}
      </>
    );
  };

  return (
    <>
      {pendingWaypointPixel ? (
        <WaypointNamePrompt
          onConfirm={handleCreateWaypoint}
          onCancel={() => setPendingWaypointPixel(null)}
        />
      ) : null}

      {deleteWaypoint ? (
        <DeleteConfirmDialog
          waypoint={deleteWaypoint}
          onConfirm={handleDeleteWaypointConfirm}
          onCancel={() => setDeleteWaypoint(null)}
        />
      ) : null}

      {contextMenu?.kind === 'drawing' ? (
        <DrawingContextMenu
          screenX={contextMenu.screenX}
          screenY={contextMenu.screenY}
          onAddWaypoint={handleContextMenuAddWaypoint}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {contextMenu?.kind === 'waypoint' ? (
        <WaypointContextMenu
          screenX={contextMenu.screenX}
          screenY={contextMenu.screenY}
          onAddPhoto={() => {
            const wp = contextMenu.waypoint;
            setUploadWaypointId(wp.waypoint_id);
            setUploadDrawingId(wp.drawing_id);
            setUploadModalOpen(true);
            setContextMenu(null);
          }}
          onMove={() => {
            setMovingWaypointId(contextMenu.waypoint.waypoint_id);
            setContextMenu(null);
          }}
          onDelete={() => {
            setDeleteWaypoint(contextMenu.waypoint);
            setContextMenu(null);
          }}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      <div className="drawings-page">
        <div className="drawings-page__canvas-wrapper">
          {renderDrawingContent()}

          {/* Top-left: Drawing navigator */}
          <div className="drawings-page__controls">
            {orderedDrawings.length ? (
              <DrawingSwitcher
                orderedDrawings={orderedDrawings}
                currentId={activeDrawingId}
                onSelect={setActiveDrawingId}
              />
            ) : null}
          </div>

          {/* Top-right: Mode toggle + Options */}
          <div className="photos-page__controls-right">
            <ModeToggle viewMode={viewMode} setViewMode={setViewMode} />
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn-format-1 drawings-page__tool-btn"
                onClick={() => {
                  setExportModalOpen(false);
                  setOptionsOpen(o => !o);
                }}
              >
                Options
              </button>
              {optionsOpen ? (
                <OptionsPopup
                  isSitePlan={isSitePlan}
                  canManage={canManage}
                  hasActiveDrawing={!!activeDrawing}
                  onMapView={() => {
                    setOptionsOpen(false);
                    setSubView('map');
                  }}
                  onDrawings={() => {
                    setOptionsOpen(false);
                    setDrawingsModalOpen(true);
                  }}
                  onAlignDrawing={() => {
                    setOptionsOpen(false);
                    setAlignModalOpen(true);
                  }}
                  onAddWaypoint={() => {
                    setOptionsOpen(false);
                    setIsAddWaypointMode(true);
                    setPendingWaypointPixel(null);
                  }}
                  onLibrary={() => {
                    setOptionsOpen(false);
                    setSubView('library');
                  }}
                  onClose={() => setOptionsOpen(false)}
                />
              ) : null}
            </div>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn-format-1 drawings-page__tool-btn"
                onClick={() => {
                  setOptionsOpen(false);
                  setExportModalOpen(true);
                }}
              >
                Export
              </button>
            </div>
            {(isAddWaypointMode || !!movingWaypointId) ? (
              <button
                type="button"
                className="btn-secondary drawings-page__tool-btn"
                onClick={cancelAddWaypoint}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        <DrawingsModal
          open={drawingsModalOpen}
          projectId={projectId}
          drawings={drawings}
          drawingType={drawingType}
          onClose={() => setDrawingsModalOpen(false)}
          onSaved={handleDrawingsSaved}
        />

        {isSitePlan ? (
          <>
            <AlignDrawingModal
              open={alignModalOpen}
              drawing={activeDrawingDetail || activeDrawing}
              projectCenter={projectCenter}
              onClose={() => setAlignModalOpen(false)}
              onSaved={handleAlignmentSaved}
            />
            <EditLocationModal
              open={editLocationOpen}
              onClose={() => setEditLocationOpen(false)}
              onSave={handleLocationSave}
              projectId={projectId}
              projectMarker={
                projectCenter
                  ? {
                      latitude: projectCenter.lat,
                      longitude: projectCenter.lng,
                    }
                  : null
              }
              mapInstance={null}
            />
          </>
        ) : null}

        <WaypointPhotosModal
          open={!!selectedWaypoint}
          waypoint={selectedWaypoint}
          onClose={() => setSelectedWaypoint(null)}
          onPhotoClick={photo => {
            if (!photo?.photo_id) return;
            navigate(`/view/photos/${photo.photo_id}`);
          }}
        />

        <UploadPhotosModal
          open={uploadModalOpen}
          projectId={projectId}
          mode="floor_plan"
          preselectedWaypointId={uploadWaypointId}
          preselectedDrawingId={uploadDrawingId}
          onClose={() => {
            setUploadModalOpen(false);
            setUploadWaypointId(null);
            setUploadDrawingId(null);
          }}
          onUploaded={fetchFloorWaypoints}
        />

        <ExportModal
          open={exportModalOpen}
          projectId={projectId}
          drawingId={activeDrawingId}
          isSitePlan={isSitePlan}
          onClose={() => setExportModalOpen(false)}
        />
      </div>
    </>
  );
};

export default PhotosPage;
