import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../services/api';
import { usePlanWaypoints } from '../hooks/usePlanWaypoints';
import { usePlanDrawings } from '../hooks/usePlanDrawings';
import PlanBuilderChrome from '../components/plan/PlanBuilderChrome';
import PlanMapCanvas from '../components/plan/PlanMapCanvas';
import PlanDrawingCanvas from '../components/plan/PlanDrawingCanvas';
import PlanWaypointTable from '../components/plan/PlanWaypointTable';
import PlanOptionsPopup from '../components/plan/PlanOptionsPopup';
import WaypointContextMenu from '../components/plan/WaypointContextMenu';
import AddWaypointContextMenu from '../components/plan/AddWaypointContextMenu';
import DrawingsModal from '../components/drawings/DrawingsModal';
import AlignDrawingModal from '../components/drawings/AlignDrawingModal';
import { isDrawingAligned, pixelToGeo } from '../utils/drawingAffineTransform';

const DEFAULT_CENTER = { lat: 39.8, lng: -98.5 };

/**
 * Plan/Create: visually build a drone flight plan on a map or aligned
 * drawing. Idle state shows a "Create Plan" button; pressing it enters
 * creation mode with an editable waypoint table + draggable markers.
 */
const PlanCreatePage = () => {
  const navigate = useNavigate();
  const { activeProject } = useAuth();
  const projectId = activeProject?.project_id || activeProject || null;

  const projectCenter = useMemo(() => {
    const lat = Number(activeProject?.address_lat);
    const lng = Number(activeProject?.address_lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [activeProject]);

  const [isBuilding, setIsBuilding] = useState(false);
  const [subView, setSubView] = useState('map');
  const [basemapStyle, setBasemapStyle] = useState('standard');
  const [drawingsModalOpen, setDrawingsModalOpen] = useState(false);
  const [alignModalOpen, setAlignModalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [planName, setPlanName] = useState('');
  const [planDescription, setPlanDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const mapCanvasRef = useRef(null);

  const {
    drawings,
    activeDrawingId,
    setActiveDrawingId,
    activeDrawing,
    applyDrawingsSaved,
    applyAlignmentSaved,
    drawingType,
  } = usePlanDrawings(projectId, { alignedOnly: isBuilding });

  const {
    waypoints,
    reset,
    addWaypoint,
    updateField,
    updateLocation,
    removeWaypoint,
    reorder,
    validate,
    toPayload,
    selectedLocalId,
    setSelectedLocalId,
  } = usePlanWaypoints([]);

  const drawingDisabled = isBuilding && drawings.length === 0;

  useEffect(() => {
    if (drawingDisabled && subView === 'drawing') setSubView('map');
  }, [drawingDisabled, subView]);

  const getDefaultLocation = useCallback(() => {
    if (subView === 'map') {
      const center = mapCanvasRef.current?.getCenter();
      if (center) return center;
    }
    if (
      subView === 'drawing' &&
      activeDrawing &&
      isDrawingAligned(activeDrawing)
    ) {
      const geo = pixelToGeo(
        activeDrawing,
        (activeDrawing.width || 0) / 2,
        (activeDrawing.height || 0) / 2,
      );
      if (geo) return geo;
    }
    return projectCenter || DEFAULT_CENTER;
  }, [subView, activeDrawing, projectCenter]);

  const handleStartCreate = () => {
    setSaveError('');
    setIsBuilding(true);
  };

  const handleCancel = () => {
    setIsBuilding(false);
    setPlanName('');
    setPlanDescription('');
    setSaveError('');
    setContextMenu(null);
    reset([]);
  };

  const handleAddRow = useCallback(() => {
    const loc = getDefaultLocation();
    addWaypoint({ lat: loc.lat, lng: loc.lng });
  }, [getDefaultLocation, addWaypoint]);

  const handleWaypointContextMenu = useCallback(
    (localId, screenX, screenY) => {
      const wp = waypoints.find((w) => w.localId === localId);
      if (!wp) return;
      setContextMenu({
        kind: 'waypoint',
        localId,
        screenX,
        screenY,
        lat: wp.lat,
        lng: wp.lng,
      });
    },
    [waypoints],
  );

  const handleEmptyAreaContextMenu = useCallback(
    (lat, lng, screenX, screenY) => {
      setContextMenu({ kind: 'add', lat, lng, screenX, screenY });
    },
    [],
  );

  const handleSave = async () => {
    setSaveError('');
    if (!planName.trim()) {
      setSaveError('Plan name is required.');
      return;
    }
    const { valid, error } = validate();
    if (!valid) {
      setSaveError(error);
      return;
    }
    setIsSaving(true);
    try {
      const resp = await apiClient.post('/v1/plans', {
        project_id: projectId,
        plan_name: planName.trim(),
        plan_description: planDescription.trim() || null,
        waypoints: toPayload(),
      });
      navigate('/plan/edit', {
        state: { planIdentifier: resp?.plan_identifier },
      });
    } catch (err) {
      setSaveError(
        err?.payload?.error || err?.message || 'Unable to create plan.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const fitPoints = useMemo(
    () =>
      waypoints
        .filter((wp) => wp.lat != null && wp.lng != null)
        .map((wp) => [wp.lng, wp.lat]),
    [waypoints],
  );

  if (!projectId) {
    return (
      <div className="page-container">
        <div className="page-content">
          <p className="page-empty">
            No active project selected. Go to Plan / Projects to select one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-builder-page">
      {isBuilding ? (
        <PlanWaypointTable
          planName={planName}
          onPlanNameChange={setPlanName}
          planDescription={planDescription}
          onPlanDescriptionChange={setPlanDescription}
          waypoints={waypoints}
          editable
          selectedLocalId={selectedLocalId}
          onSelectRow={setSelectedLocalId}
          onRowContextMenu={handleWaypointContextMenu}
          onUpdateField={updateField}
          onRemoveRow={removeWaypoint}
          onReorder={reorder}
          onAddRow={handleAddRow}
          onSave={handleSave}
          onCancel={handleCancel}
          isSaving={isSaving}
          error={saveError}
        />
      ) : null}

      <PlanBuilderChrome
        subView={subView}
        onSubViewChange={setSubView}
        drawingDisabled={drawingDisabled}
        basemapStyle={basemapStyle}
        onBasemapChange={setBasemapStyle}
        drawings={drawings}
        activeDrawingId={activeDrawingId}
        onSelectDrawing={setActiveDrawingId}
        showOptionsButton={!isBuilding}
        optionsOpen={optionsOpen}
        onToggleOptions={() => setOptionsOpen((o) => !o)}
        optionsContent={
          <PlanOptionsPopup
            hasActiveDrawing={!!activeDrawing}
            onDrawings={() => {
              setOptionsOpen(false);
              setDrawingsModalOpen(true);
            }}
            onAlignDrawing={() => {
              setOptionsOpen(false);
              setAlignModalOpen(true);
            }}
            onClose={() => setOptionsOpen(false)}
          />
        }
        bottomRight={
          !isBuilding ? (
            <button
              type="button"
              className="btn-primary btn-icon"
              title="Create Plan"
              onClick={handleStartCreate}
            >
              +
            </button>
          ) : null
        }
      >
        {subView === 'map' ? (
          <PlanMapCanvas
            ref={mapCanvasRef}
            basemapStyle={basemapStyle}
            initialCenter={projectCenter}
            fitPoints={
              fitPoints.length
                ? fitPoints
                : projectCenter
                  ? [[projectCenter.lng, projectCenter.lat]]
                  : null
            }
            waypoints={waypoints}
            selectedLocalId={selectedLocalId}
            interactive={isBuilding}
            onSelectWaypoint={setSelectedLocalId}
            onDragWaypoint={updateLocation}
            onWaypointContextMenu={handleWaypointContextMenu}
            onMapContextMenu={
              isBuilding ? handleEmptyAreaContextMenu : undefined
            }
          />
        ) : (
          <PlanDrawingCanvas
            drawing={activeDrawing}
            waypoints={waypoints}
            selectedLocalId={selectedLocalId}
            interactive={isBuilding}
            onSelectWaypoint={setSelectedLocalId}
            onDragWaypoint={updateLocation}
            onWaypointContextMenu={handleWaypointContextMenu}
            onDrawingContextMenu={
              isBuilding ? handleEmptyAreaContextMenu : undefined
            }
          />
        )}
      </PlanBuilderChrome>

      <DrawingsModal
        open={drawingsModalOpen}
        projectId={projectId}
        drawings={drawings}
        drawingType={drawingType}
        onClose={() => setDrawingsModalOpen(false)}
        onSaved={applyDrawingsSaved}
      />
      <AlignDrawingModal
        open={alignModalOpen}
        drawing={activeDrawing}
        projectCenter={projectCenter}
        onClose={() => setAlignModalOpen(false)}
        onSaved={applyAlignmentSaved}
      />

      {contextMenu?.kind === 'waypoint' ? (
        <WaypointContextMenu
          screenX={contextMenu.screenX}
          screenY={contextMenu.screenY}
          lat={contextMenu.lat}
          lng={contextMenu.lng}
          onSave={(lat, lng) => updateLocation(contextMenu.localId, lat, lng)}
          onDelete={() => removeWaypoint(contextMenu.localId)}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {contextMenu?.kind === 'add' ? (
        <AddWaypointContextMenu
          screenX={contextMenu.screenX}
          screenY={contextMenu.screenY}
          onAdd={() =>
            addWaypoint({ lat: contextMenu.lat, lng: contextMenu.lng })
          }
          onClose={() => setContextMenu(null)}
        />
      ) : null}
    </div>
  );
};

export default PlanCreatePage;
