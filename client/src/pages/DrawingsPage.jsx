import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import { useViewMode } from '../context/ViewModeContext';
import apiClient from '../services/api';
import { useActivePlanWaypoints } from '../hooks/useActivePlanWaypoints';
import DrawingSwitcher from '../components/drawings/DrawingSwitcher';
import DrawingsModal from '../components/drawings/DrawingsModal';
import AlignDrawingModal from '../components/drawings/AlignDrawingModal';
import DrawingCanvas from '../components/drawings/DrawingCanvas';
import WaypointPhotosModal from '../components/map/WaypointPhotosModal';
import EditLocationModal from '../components/map/EditLocationModal';
import {
  geoToPixel,
  isDrawingAligned,
  waypointsToPixelPositions,
} from '../utils/drawingAffineTransform';

// ---------------------------------------------------------------------------
// Floor plan waypoint name prompt (inline mini-modal)
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
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
          >
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
// Main page
// ---------------------------------------------------------------------------
const DrawingsPage = () => {
  const navigate = useNavigate();
  const { activeProject, roleForActiveProject, projects } = useAuth();
  const { isSitePlan, isFloorPlan } = useViewMode();

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
    ) {
      return null;
    }
    const lat = Number(activeProjectRow.address_lat);
    const lng = Number(activeProjectRow.address_lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [activeProjectRow]);

  // Shared drawing list state
  const [drawings, setDrawings] = useState([]);
  const [activeDrawingId, setActiveDrawingId] = useState(null);
  const [activeDrawingDetail, setActiveDrawingDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawingsModalOpen, setDrawingsModalOpen] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Site plan only
  const [alignModalOpen, setAlignModalOpen] = useState(false);
  const [editLocationOpen, setEditLocationOpen] = useState(false);

  // Shared waypoint photo modal
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);

  // Floor plan only
  const [isAddWaypointMode, setIsAddWaypointMode] = useState(false);
  const [pendingWaypointPixel, setPendingWaypointPixel] = useState(null);
  const [floorWaypoints, setFloorWaypoints] = useState([]);
  const [isLoadingWaypoints, setIsLoadingWaypoints] = useState(false);

  const drawingType = isSitePlan ? 'site_plan' : 'floor_plan';

  const orderedDrawings = useMemo(
    () =>
      [...drawings].sort(
        (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0),
      ),
    [drawings],
  );

  const activeDrawing = useMemo(() => {
    if (activeDrawingDetail?.drawing_id === activeDrawingId) {
      return activeDrawingDetail;
    }
    return orderedDrawings.find(d => d.drawing_id === activeDrawingId) || null;
  }, [activeDrawingDetail, activeDrawingId, orderedDrawings]);

  // ---- Site plan: waypoints from active plan (drone photos only) ----
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

  // ---- Floor plan: waypoints from /api/v1/waypoints ----
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
      .map(wp => ({ ...wp, pixelX: wp.pixel_x, pixelY: wp.pixel_y }));
  }, [isFloorPlan, floorWaypoints, activeDrawingId]);

  // ---- Fetch drawings ----
  const fetchDrawings = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError('');
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
    } catch (err) {
      setDrawings([]);
      setError(
        err?.payload?.message || err?.message || 'Unable to load drawings.',
      );
    } finally {
      setIsLoading(false);
    }
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
    // Reset mode-specific state when mode changes
    setIsAddWaypointMode(false);
    setPendingWaypointPixel(null);
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

  // ---- Floor plan: canvas click → create waypoint ----
  const handleCanvasClick = useCallback(
    pixel => {
      if (!isFloorPlan || !isAddWaypointMode || !activeDrawingId) return;
      setPendingWaypointPixel(pixel);
    },
    [isFloorPlan, isAddWaypointMode, activeDrawingId],
  );

  const handleCreateWaypoint = useCallback(
    async waypointName => {
      if (!pendingWaypointPixel || !projectId || !activeDrawingId) return;
      setPendingWaypointPixel(null);
      try {
        await apiClient.post('/v1/waypoints', {
          project_id: projectId,
          drawing_id: activeDrawingId,
          pixel_x: pendingWaypointPixel.x,
          pixel_y: pendingWaypointPixel.y,
          waypoint_name: waypointName,
        });
        fetchFloorWaypoints();
      } catch (err) {
        setError(err?.payload?.message || err?.message || 'Failed to create waypoint.');
      }
    },
    [pendingWaypointPixel, projectId, activeDrawingId, fetchFloorWaypoints],
  );

  const handleDeleteFloorWaypoint = useCallback(
    async waypointId => {
      try {
        await apiClient.delete(`/v1/waypoints/${waypointId}`);
        fetchFloorWaypoints();
      } catch (err) {
        setError(err?.payload?.message || err?.message || 'Failed to delete waypoint.');
      }
    },
    [fetchFloorWaypoints],
  );

  // ---- Empty / loading / error states ----
  if (!projectId) {
    return (
      <div className="drawings-page drawings-page--empty">
        <p className="drawings-page__message">Select a project to view drawings.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="drawings-page drawings-page--empty">
        <p className="drawings-page__message">Loading drawings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="drawings-page drawings-page--empty">
        <p className="drawings-page__message drawings-page__message--error">
          {error}
        </p>
      </div>
    );
  }

  if (!orderedDrawings.length) {
    return (
      <>
        <div className="drawings-page drawings-page--empty">
          <p className="drawings-page__message">No drawings uploaded</p>
          {canManage ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setDrawingsModalOpen(true)}
            >
              Drawings
            </button>
          ) : null}
        </div>
        <DrawingsModal
          open={drawingsModalOpen}
          projectId={projectId}
          drawings={drawings}
          drawingType={drawingType}
          onClose={() => setDrawingsModalOpen(false)}
          onSaved={handleDrawingsSaved}
        />
      </>
    );
  }

  // Active markers differ by mode
  const waypointMarkers = isSitePlan
    ? sitePlanWaypointMarkers
    : floorWaypointMarkers;

  return (
    <div className="drawings-page">
      {pendingWaypointPixel ? (
        <WaypointNamePrompt
          onConfirm={handleCreateWaypoint}
          onCancel={() => setPendingWaypointPixel(null)}
        />
      ) : null}

      <div className="drawings-page__canvas-wrapper">
        {activeDrawing?.r2_url ? (
          <DrawingCanvas
            src={activeDrawing.r2_url}
            alt={activeDrawing.drawing_name || 'Drawing'}
            width={activeDrawing.width}
            height={activeDrawing.height}
            waypointMarkers={isSitePlan ? waypointMarkers : (isLoadingWaypoints ? [] : floorWaypointMarkers)}
            projectMarker={isSitePlan ? projectMarker : null}
            onWaypointClick={wp => setSelectedWaypoint(wp)}
            onProjectMarkerClick={
              isSitePlan && canManage
                ? () => setEditLocationOpen(true)
                : undefined
            }
            onImageClick={
              isFloorPlan && isAddWaypointMode ? handleCanvasClick : undefined
            }
          />
        ) : null}

        {isSitePlan && !aligned ? (
          <p className="drawings-page__align-hint">
            Align this drawing to view waypoints.
          </p>
        ) : null}

        <div className="drawings-page__controls">
          <DrawingSwitcher
            orderedDrawings={orderedDrawings}
            currentId={activeDrawingId}
            onSelect={setActiveDrawingId}
          />
          {canManage ? (
            <>
              <button
                type="button"
                className="btn-format-1 drawings-page__tool-btn"
                onClick={() => setDrawingsModalOpen(true)}
              >
                Drawings
              </button>
              {isSitePlan ? (
                <button
                  type="button"
                  className="btn-format-1 drawings-page__tool-btn"
                  onClick={() => setAlignModalOpen(true)}
                  disabled={!activeDrawing}
                >
                  Align Drawing
                </button>
              ) : null}
              {isFloorPlan ? (
                <button
                  type="button"
                  className={`btn-format-1 drawings-page__tool-btn${isAddWaypointMode ? ' btn-format-1--active' : ''}`}
                  onClick={() => {
                    setIsAddWaypointMode(prev => !prev);
                    setPendingWaypointPixel(null);
                  }}
                >
                  {isAddWaypointMode ? 'Done Adding' : 'Add Waypoint'}
                </button>
              ) : null}
            </>
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
        onDeleteWaypoint={
          isFloorPlan && canManage
            ? wp => {
                setSelectedWaypoint(null);
                handleDeleteFloorWaypoint(wp.waypoint_id);
              }
            : undefined
        }
      />
    </div>
  );
};

export default DrawingsPage;
