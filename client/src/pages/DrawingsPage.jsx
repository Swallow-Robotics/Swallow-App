import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
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

const DrawingsPage = () => {
  const navigate = useNavigate();
  const { activeProject, roleForActiveProject, projects } = useAuth();

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

  const [drawings, setDrawings] = useState([]);
  const [activeDrawingId, setActiveDrawingId] = useState(null);
  const [activeDrawingDetail, setActiveDrawingDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawingsModalOpen, setDrawingsModalOpen] = useState(false);
  const [alignModalOpen, setAlignModalOpen] = useState(false);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [editLocationOpen, setEditLocationOpen] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const { waypoints } = useActivePlanWaypoints(projectId, refreshCounter);

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

  const aligned = activeDrawing && isDrawingAligned(activeDrawing);

  const waypointMarkers = useMemo(() => {
    if (!aligned) return [];
    return waypointsToPixelPositions(activeDrawing, waypoints);
  }, [activeDrawing, aligned, waypoints]);

  const projectMarker = useMemo(() => {
    if (!aligned || !projectCenter) return null;
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
  }, [activeDrawing, aligned, projectCenter, activeProjectRow]);

  const fetchDrawings = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError('');
    try {
      const resp = await apiClient.get(`/v1/drawings?project_id=${projectId}`);
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
  }, [projectId]);

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
          await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        }
      }
    }
    setActiveDrawingDetail(null);
  }, []);

  useEffect(() => {
    fetchDrawings();
  }, [fetchDrawings]);

  useEffect(() => {
    fetchDrawingDetail(activeDrawingId);
  }, [activeDrawingId, fetchDrawingDetail]);

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
          onClose={() => setDrawingsModalOpen(false)}
          onSaved={handleDrawingsSaved}
        />
      </>
    );
  }

  return (
    <div className="drawings-page">
      <div className="drawings-page__canvas-wrapper">
        {activeDrawing?.r2_url ? (
          <DrawingCanvas
            src={activeDrawing.r2_url}
            alt={activeDrawing.drawing_name || 'Drawing'}
            width={activeDrawing.width}
            height={activeDrawing.height}
            waypointMarkers={waypointMarkers}
            projectMarker={projectMarker}
            onWaypointClick={setSelectedWaypoint}
            onProjectMarkerClick={
              canManage ? () => setEditLocationOpen(true) : undefined
            }
          />
        ) : null}

        {!aligned ? (
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
              <button
                type="button"
                className="btn-format-1 drawings-page__tool-btn"
                onClick={() => setAlignModalOpen(true)}
                disabled={!activeDrawing}
              >
                Align Drawing
              </button>
            </>
          ) : null}
        </div>
      </div>

      <DrawingsModal
        open={drawingsModalOpen}
        projectId={projectId}
        drawings={drawings}
        onClose={() => setDrawingsModalOpen(false)}
        onSaved={handleDrawingsSaved}
      />

      <AlignDrawingModal
        open={alignModalOpen}
        drawing={activeDrawingDetail || activeDrawing}
        projectCenter={projectCenter}
        onClose={() => setAlignModalOpen(false)}
        onSaved={handleAlignmentSaved}
      />

      <WaypointPhotosModal
        open={!!selectedWaypoint}
        waypoint={selectedWaypoint}
        onClose={() => setSelectedWaypoint(null)}
        onPhotoClick={photo => {
          if (!photo?.photo_id) return;
          navigate(`/view/photos/${photo.photo_id}`);
        }}
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
    </div>
  );
};

export default DrawingsPage;
