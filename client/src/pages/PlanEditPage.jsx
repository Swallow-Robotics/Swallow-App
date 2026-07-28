import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
 * Plan/Edit: pick one of the project's active plans, view its waypoints,
 * then optionally edit them visually on a map or aligned drawing (same
 * builder mechanics as Plan/Create).
 */
const PlanEditPage = () => {
  const location = useLocation();
  const { activeProject } = useAuth();
  const projectId = activeProject?.project_id || activeProject || null;

  const projectCenter = useMemo(() => {
    const lat = Number(activeProject?.address_lat);
    const lng = Number(activeProject?.address_lng);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [activeProject]);

  const [plans, setPlans] = useState([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [pageError, setPageError] = useState('');
  const [selectedPlanIdentifier, setSelectedPlanIdentifier] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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

  const {
    drawings,
    activeDrawingId,
    setActiveDrawingId,
    activeDrawing,
    applyDrawingsSaved,
    applyAlignmentSaved,
    drawingType,
  } = usePlanDrawings(projectId, { alignedOnly: isEditing });

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

  const selectedPlan = useMemo(
    () =>
      plans.find((p) => p.plan_identifier === selectedPlanIdentifier) || null,
    [plans, selectedPlanIdentifier],
  );

  const fetchPlans = useCallback(async () => {
    if (!projectId) {
      setPlans([]);
      return;
    }
    setIsLoadingPlans(true);
    setPageError('');
    try {
      const resp = await apiClient.get(`/v1/plans?project_id=${projectId}`);
      setPlans(resp?.plans || []);
    } catch (err) {
      setPageError(
        err?.payload?.error || err?.message || 'Unable to load plans.',
      );
    } finally {
      setIsLoadingPlans(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Auto-select the plan just created on Plan/Create.
  useEffect(() => {
    const wantedIdentifier = location.state?.planIdentifier;
    if (
      wantedIdentifier &&
      !selectedPlanIdentifier &&
      plans.some((p) => p.plan_identifier === wantedIdentifier)
    ) {
      setSelectedPlanIdentifier(wantedIdentifier);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, location.state]);

  // Load the selected plan's waypoints into the table whenever the plan
  // (or a saved new version of it) changes.
  useEffect(() => {
    if (selectedPlan) {
      setPlanName(selectedPlan.plan_name || '');
      setPlanDescription(selectedPlan.plan_description || '');
      reset(selectedPlan.waypoints || []);
    } else {
      setPlanName('');
      setPlanDescription('');
      reset([]);
    }
    setIsEditing(false);
    setSaveError('');
    setContextMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlan?.plan_id]);

  const drawingDisabled = isEditing && drawings.length === 0;

  useEffect(() => {
    if (drawingDisabled && subView === 'drawing') setSubView('map');
  }, [drawingDisabled, subView]);

  const getDefaultLocation = useCallback(() => {
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

  const handleStartEdit = () => {
    setSaveError('');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSaveError('');
    setContextMenu(null);
    if (selectedPlan) {
      setPlanName(selectedPlan.plan_name || '');
      setPlanDescription(selectedPlan.plan_description || '');
      reset(selectedPlan.waypoints || []);
    }
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
    if (!selectedPlan) return;
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
      await apiClient.patch(`/v1/plans/${selectedPlan.plan_identifier}`, {
        plan_name: planName.trim(),
        plan_description: planDescription.trim() || null,
        waypoints: toPayload(),
      });
      await fetchPlans();
    } catch (err) {
      setSaveError(
        err?.payload?.error || err?.message || 'Unable to update plan.',
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
      {selectedPlan ? (
        <PlanWaypointTable
          planName={planName}
          onPlanNameChange={setPlanName}
          planDescription={planDescription}
          onPlanDescriptionChange={setPlanDescription}
          waypoints={waypoints}
          editable={isEditing}
          collapsible={!isEditing}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          selectedLocalId={selectedLocalId}
          onSelectRow={setSelectedLocalId}
          onRowContextMenu={isEditing ? handleWaypointContextMenu : undefined}
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
        showOptionsButton={!isEditing}
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
        topCenter={
          <div
            style={{
              background: 'var(--color-surface-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-md)',
              padding: 'var(--space-xs) var(--space-sm)',
            }}
          >
            <select
              className="form-select"
              value={selectedPlanIdentifier || ''}
              onChange={(e) =>
                setSelectedPlanIdentifier(e.target.value || null)
              }
              disabled={isEditing || isLoadingPlans}
              style={{ minWidth: 220, border: 'none' }}
            >
              <option value="">
                {isLoadingPlans ? 'Loading plans…' : 'Select a plan…'}
              </option>
              {plans.map((plan) => (
                <option key={plan.plan_identifier} value={plan.plan_identifier}>
                  {plan.plan_name}
                </option>
              ))}
            </select>
          </div>
        }
        bottomRight={
          selectedPlan && !isEditing ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleStartEdit}
            >
              Edit Plan
            </button>
          ) : null
        }
      >
        {subView === 'map' ? (
          <PlanMapCanvas
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
            interactive={isEditing}
            onSelectWaypoint={setSelectedLocalId}
            onDragWaypoint={updateLocation}
            onWaypointContextMenu={handleWaypointContextMenu}
            onMapContextMenu={
              isEditing ? handleEmptyAreaContextMenu : undefined
            }
          />
        ) : (
          <PlanDrawingCanvas
            drawing={activeDrawing}
            waypoints={waypoints}
            selectedLocalId={selectedLocalId}
            interactive={isEditing}
            onSelectWaypoint={setSelectedLocalId}
            onDragWaypoint={updateLocation}
            onWaypointContextMenu={handleWaypointContextMenu}
            onDrawingContextMenu={
              isEditing ? handleEmptyAreaContextMenu : undefined
            }
          />
        )}
      </PlanBuilderChrome>

      {pageError ? (
        <div
          className="page-error"
          style={{
            position: 'absolute',
            top: 'var(--space-md)',
            left: 'var(--space-md)',
            zIndex: 10,
          }}
        >
          {pageError}
        </div>
      ) : null}

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

export default PlanEditPage;
