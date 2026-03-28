/**
 * Fly tab map: Cesium 2D viewer with project location and photo/cluster markers.
 * Uses the same data pipeline as the View map (useProjectMapData).
 * Optional MAVLink telemetry from a serial radio via useMavlinkTelemetry().
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Viewer, Entity, Cesium3DTileset } from 'resium';
import {
  Cartesian3,
  SceneMode,
  HeadingPitchRoll,
  Transforms,
  Math as CesiumMath,
  IonResource,
  Terrain,
} from 'cesium';
import { useAuth, useMavlinkTelemetry } from '../context';
import { useProjectMapData } from '../hooks/useProjectMapData';
import { parseCoordinate } from '../utils/mapDataUtils';

// ~continental US extent when viewed in 2D (camera height in meters)
const MAX_CAMERA_HEIGHT = 6_000_000;
const DEFAULT_PROJECT_HEIGHT = 1000;
const WORLD_TERRAIN = Terrain.fromWorldTerrain();

// Persists across unmount/remount so the camera restores on tab switch
let lastCameraPosition = null; // { lat, lng, height }
let projectHome = null; // { lat, lng } — the project center for Home button / morph
let lastSceneMode = SceneMode.SCENE2D;
let isMorphing = false;

const FlyMapPage = () => {
  const { activeProject, projects, setActiveProject } = useAuth();
  const {
    isSupported: serialSupported,
    connectionStatus: telemetryStatus,
    error: telemetryError,
    heartbeat,
    gps,
    sysStatus,
    attitude,
    globalPosition,
    rawMessageCount,
    connect: connectTelemetry,
    disconnect: disconnectTelemetry,
  } = useMavlinkTelemetry();
  const activeProjectId = activeProject?.id || activeProject || null;
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [showConnectedNotification, setShowConnectedNotification] =
    useState(false);
  const viewerRef = useRef(null);
  const hasAutoFitRef = useRef(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [is3D, setIs3D] = useState(lastSceneMode === SceneMode.SCENE3D);

  const { projectMarker, clusters } = useProjectMapData(
    activeProjectId,
    refreshCounter
  );

  // Show a short "connected" notification when telemetry radio connects
  useEffect(() => {
    if (telemetryStatus === 'connected') {
      setShowConnectedNotification(true);
      const t = setTimeout(() => setShowConnectedNotification(false), 4000);
      return () => clearTimeout(t);
    }
  }, [telemetryStatus]);

  // Wait for the Cesium viewer to be ready, then restore camera position
  useEffect(() => {
    const checkViewer = () => {
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer) {
        // Clamp zoom-out so the view never exceeds roughly US size (2D only)
        viewer.scene.preRender.addEventListener(() => {
          if (isMorphing) return;
          if (viewer.scene.mode !== SceneMode.SCENE2D) return;
          const cart = viewer.camera.positionCartographic;
          if (cart && cart.height > MAX_CAMERA_HEIGHT) {
            viewer.camera.setView({
              destination: Cartesian3.fromRadians(
                cart.longitude,
                cart.latitude,
                MAX_CAMERA_HEIGHT
              ),
            });
          }
        });

        // Override the Home button to fly to the project center
        if (viewer.homeButton) {
          viewer.homeButton.viewModel.command.beforeExecute.addEventListener(
            e => {
              e.cancel = true;
              const home = projectHome || lastCameraPosition;
              if (home) {
                viewer.camera.flyTo({
                  destination: Cartesian3.fromDegrees(
                    home.lng,
                    home.lat,
                    DEFAULT_PROJECT_HEIGHT
                  ),
                  duration: 1.2,
                  complete: () => {
                    lastCameraPosition = {
                      lat: home.lat,
                      lng: home.lng,
                      height: DEFAULT_PROJECT_HEIGHT,
                    };
                  },
                });
              }
            }
          );
        }

        if (lastCameraPosition) {
          viewer.camera.setView({
            destination: Cartesian3.fromDegrees(
              lastCameraPosition.lng,
              lastCameraPosition.lat,
              lastCameraPosition.height ?? DEFAULT_PROJECT_HEIGHT
            ),
          });
          hasAutoFitRef.current = true;
        }
        // Restore 3D mode if that was the last mode (Viewer always starts in 2D)
        if (lastSceneMode === SceneMode.SCENE3D) {
          viewer.scene.morphTo3D(0);
        }
        setViewerReady(true);
      } else {
        requestAnimationFrame(checkViewer);
      }
    };
    checkViewer();
  }, []);

  // Fallback: coordinates from the project object (address geocode)
  const selectedProjectCoord = useMemo(() => {
    const current = projects.find(p => p.id === activeProjectId);
    if (!current) return null;
    const coord =
      current.address_coord ||
      current.addressCoord ||
      current.address_coordinates ||
      current.addressCoordinates ||
      null;
    if (coord) {
      const lat = Number(coord.lat ?? coord.latitude);
      const lon = Number(coord.lon ?? coord.lng ?? coord.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
    // Some projects store lat/lng directly on the row
    const directLat = parseCoordinate(current.latitude ?? current.lat);
    const directLng = parseCoordinate(
      current.longitude ?? current.lng ?? current.lon
    );
    if (
      directLat != null &&
      directLng != null &&
      Number.isFinite(directLat) &&
      Number.isFinite(directLng)
    ) {
      return { lat: directLat, lon: directLng };
    }
    return null;
  }, [projects, activeProjectId]);

  // TODO: remove TEST_DRONE after verifying model appearance
  const TEST_DRONE = true;

  // Derive drone position and heading from live telemetry
  const dronePosition = useMemo(() => {
    const src = globalPosition ?? gps;
    if (src && src.lat != null && src.lon != null &&
        Number.isFinite(src.lat) && Number.isFinite(src.lon) &&
        !(src.lat === 0 && src.lon === 0)) {
      return Cartesian3.fromDegrees(src.lon, src.lat, 0);
    }
    if (TEST_DRONE && selectedProjectCoord) {
      return Cartesian3.fromDegrees(selectedProjectCoord.lon, selectedProjectCoord.lat, 0);
    }
    return null;
  }, [globalPosition, gps, selectedProjectCoord]);

  const droneHeadingRad = useMemo(() => {
    if (globalPosition?.hdg != null && globalPosition.hdg !== 0)
      return CesiumMath.toRadians(globalPosition.hdg);
    if (attitude?.yaw != null) return attitude.yaw;
    return 0;
  }, [globalPosition, attitude]);

  const droneOrientation = useMemo(() => {
    if (!dronePosition) return undefined;
    return Transforms.headingPitchRollQuaternion(
      dronePosition,
      new HeadingPitchRoll(droneHeadingRad, 0, 0)
    );
  }, [dronePosition, droneHeadingRad]);

  // Center camera on project location when data loads (or project changes).
  // Priority: projectMarker (locations table) > selectedProjectCoord (project row).
  // First visit: jump instantly so tiles start loading at the right zoom, then
  // do a short settle animation. Subsequent switches: smooth fly-to.
  const hasEverCenteredRef = useRef(false);
  useEffect(() => {
    if (hasAutoFitRef.current) return;
    if (!viewerReady) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    let lat = projectMarker ? parseCoordinate(projectMarker.latitude) : null;
    let lng = projectMarker ? parseCoordinate(projectMarker.longitude) : null;

    if (
      (lat == null ||
        lng == null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)) &&
      selectedProjectCoord
    ) {
      lat = selectedProjectCoord.lat;
      lng = selectedProjectCoord.lon;
    }

    if (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      const dest = Cartesian3.fromDegrees(lng, lat, DEFAULT_PROJECT_HEIGHT);
      if (!hasEverCenteredRef.current) {
        viewer.camera.setView({ destination: dest });
        hasEverCenteredRef.current = true;
      } else {
        viewer.camera.flyTo({ destination: dest, duration: 1.2 });
      }
      projectHome = { lat, lng };
      lastCameraPosition = { lat, lng, height: DEFAULT_PROJECT_HEIGHT };
      hasAutoFitRef.current = true;
    }
    // refreshCounter included so re-selecting the same project triggers centering
  }, [projectMarker, selectedProjectCoord, viewerReady, refreshCounter]);

  // Continuously save camera position so the module-level variable is
  // always current when the component unmounts (Resium destroys the viewer
  // before React cleanup runs, so we can't read it in a cleanup function).
  useEffect(() => {
    if (!viewerReady) return;
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const handler = () => {
      if (isMorphing) return;
      try {
        const cart = viewer.camera.positionCartographic;
        if (cart) {
          const lat = (cart.latitude * 180) / Math.PI;
          const lng = (cart.longitude * 180) / Math.PI;
          const height = cart.height;
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            lastCameraPosition = { lat, lng, height };
          }
        }
      } catch {
        // ignore
      }
    };
    viewer.camera.moveEnd.addEventListener(handler);
    return () => {
      try {
        if (!viewer.isDestroyed()) {
          viewer.camera.moveEnd.removeEventListener(handler);
        }
      } catch {
        // ignore
      }
    };
  }, []);

  const getProjectHome = useCallback(() => {
    if (projectHome) return projectHome;
    if (selectedProjectCoord) return { lat: selectedProjectCoord.lat, lng: selectedProjectCoord.lon };
    if (lastCameraPosition) return lastCameraPosition;
    return null;
  }, [selectedProjectCoord]);

  const toggleSceneMode = useCallback(() => {
    setIs3D(prev => {
      const next = !prev;
      lastSceneMode = next ? SceneMode.SCENE3D : SceneMode.SCENE2D;
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && !viewer.isDestroyed()) {
        const home = getProjectHome();
        isMorphing = true;
        const onMorphDone = () => {
          viewer.scene.morphComplete.removeEventListener(onMorphDone);
          isMorphing = false;
          const ctrl = viewer.scene.screenSpaceCameraController;
          if (next) {
            ctrl.enableTilt = true;
            ctrl.enableRotate = true;
            ctrl.enableLook = true;
          }
          if (home) {
            viewer.camera.flyTo({
              destination: Cartesian3.fromDegrees(
                home.lng,
                home.lat,
                DEFAULT_PROJECT_HEIGHT
              ),
              duration: 1.2,
              complete: () => {
                projectHome = { lat: home.lat, lng: home.lng };
                lastCameraPosition = {
                  lat: home.lat,
                  lng: home.lng,
                  height: DEFAULT_PROJECT_HEIGHT,
                };
              },
            });
          }
        };
        viewer.scene.morphComplete.addEventListener(onMorphDone);
        if (next) viewer.scene.morphTo3D(1.5);
        else viewer.scene.morphTo2D(1.5);
      }
      return next;
    });
  }, [getProjectHome]);

  const handleProjectChange = useCallback(
    e => {
      const nextId = e.target.value;
      setActiveProject(nextId || null);
      hasAutoFitRef.current = false;
      setRefreshCounter(c => c + 1);
    },
    [setActiveProject]
  );

  const projectLat = projectMarker
    ? parseCoordinate(projectMarker.latitude)
    : null;
  const projectLng = projectMarker
    ? parseCoordinate(projectMarker.longitude)
    : null;
  const hasProjectPin =
    projectLat != null &&
    projectLng != null &&
    Number.isFinite(projectLat) &&
    Number.isFinite(projectLng);

  return (
    <div
      className="map-page fly-map-page"
      style={{
        width: '100%',
        height: '100%',
        minHeight: '60vh',
        position: 'relative',
      }}
    >
      {/* Controls panel */}
      <div
        className="fly-map-telemetry"
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          background: 'transparent',
          color: '#fff',
          padding: 0,
          borderRadius: 0,
          fontSize: 12,
          fontFamily: 'var(--font-family-sans)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="btn-format-1"
            value={activeProjectId || projects[0]?.id || ''}
            onChange={handleProjectChange}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleSceneMode}
            style={{
              padding: '4px 10px',
              cursor: 'pointer',
              fontWeight: 600,
              minWidth: 36,
            }}
          >
            {is3D ? '3D' : '2D'}
          </button>
          {serialSupported && telemetryStatus === 'disconnected' && (
            <button
              type="button"
              onClick={() => connectTelemetry(57600)}
              style={{ padding: '4px 10px', cursor: 'pointer' }}
            >
              Connect telemetry
            </button>
          )}
          {serialSupported && telemetryStatus === 'connected' && (
            <>
              <button
                type="button"
                onClick={disconnectTelemetry}
                style={{ padding: '4px 10px', cursor: 'pointer' }}
              >
                Disconnect
              </button>
              <span>MAVLink · {rawMessageCount} msgs</span>
            </>
          )}
          {serialSupported && telemetryStatus === 'connecting' && (
            <span>Connecting…</span>
          )}
          {serialSupported && telemetryStatus === 'error' && (
            <span style={{ color: '#f88' }}>{telemetryError || 'Error'}</span>
          )}
        </div>
        {showConnectedNotification && (
          <div
            style={{
              padding: '4px 0',
              color: '#8f8',
              fontWeight: 600,
            }}
          >
            ✓ Telemetry radio connected
          </div>
        )}
        {(heartbeat || gps || sysStatus) && (
          <div style={{ opacity: 0.9 }}>
            {heartbeat && <span>HB </span>}
            {gps && (
              <span>
                GPS {gps.lat?.toFixed(5)},{gps.lon?.toFixed(5)}{' '}
              </span>
            )}
            {sysStatus && (
              <span>
                Bat {sysStatus.voltage_battery}V {sysStatus.battery_remaining}%
              </span>
            )}
          </div>
        )}
      </div>
      <Viewer
        ref={viewerRef}
        full
        sceneMode={SceneMode.SCENE2D}
        sceneModePicker={false}
        timeline={false}
        animation={false}
        fullscreenButton={false}
        vrButton={false}
        terrain={WORLD_TERRAIN}
      >
        <Cesium3DTileset url={IonResource.fromAssetId(2275207)} show={is3D} />
        {hasProjectPin && (
          <Entity
            name="Project"
            position={Cartesian3.fromDegrees(projectLng, projectLat)}
            point={{ pixelSize: 12, color: '#3f6fa0' }}
            description="<p>Project location</p>"
          />
        )}
        {clusters.map((cluster, idx) => {
          const lat = parseCoordinate(cluster.latitude);
          const lng = parseCoordinate(cluster.longitude);
          if (
            lat == null ||
            lng == null ||
            !Number.isFinite(lat) ||
            !Number.isFinite(lng)
          ) {
            return null;
          }
          const photoCount = cluster.photos?.length ?? 0;
          return (
            <Entity
              key={`cluster-${cluster.latitude}-${cluster.longitude}-${idx}`}
              name={`Location (${photoCount} photo${photoCount !== 1 ? 's' : ''})`}
              position={Cartesian3.fromDegrees(lng, lat)}
              point={{ pixelSize: 8, color: '#2d7d46' }}
              description={`<p>${photoCount} photo${photoCount !== 1 ? 's' : ''}</p>`}
            />
          );
        })}
        {dronePosition && (
          <Entity
            name="Drone"
            position={dronePosition}
            orientation={droneOrientation}
            model={{
              uri: `${process.env.PUBLIC_URL}/models/CesiumDrone.glb`,
              minimumPixelSize: 64,
              maximumScale: 200,
            }}
            description="<p>Live drone position from MAVLink telemetry</p>"
          />
        )}
      </Viewer>
    </div>
  );
};

export default FlyMapPage;
