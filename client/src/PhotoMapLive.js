import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAuth } from './context';
import EditLocationModal from './components/map/EditLocationModal';
import WaypointPhotosModal from './components/map/WaypointPhotosModal';
import { useActivePlanWaypoints } from './hooks/useActivePlanWaypoints';
import {
  addWaypointMarkersToMap,
  clearWaypointMarkers,
} from './utils/waypointMapRendering';

const STANDARD_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const SATELLITE_RASTER_SOURCE = {
  type: 'raster',
  tiles: [
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  attribution:
    'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
};

class BasemapToggleControl {
  constructor({ onSelect, getActive }) {
    this._onSelect = onSelect;
    this._getActive = getActive;
    this._container = null;
  }

  onAdd(map) {
    this._map = map;
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl';
    container.style.display = 'flex';
    container.style.background = 'var(--color-surface-primary)';
    container.style.border = '1px solid var(--color-border)';
    container.style.borderRadius = 'var(--radius-lg)';
    container.style.boxShadow = 'var(--shadow-xs)';
    container.style.overflow = 'hidden';

    const addButton = (label, value) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.padding = '6px 14px';
      btn.style.fontSize = 'var(--font-size-base)';
      btn.style.fontWeight = 'var(--font-weight-medium)';
      btn.style.fontFamily = 'var(--font-family-sans)';
      btn.style.border = 'none';
      btn.style.borderRadius = '0';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'background 150ms ease, color 150ms ease';
      btn.style.lineHeight = 'var(--line-height-snug)';
      btn.style.whiteSpace = 'nowrap';
      btn.onclick = () => this._onSelect(value);
      btn.onmouseenter = () => {
        if (this._getActive() !== value) {
          btn.style.background = 'rgba(183,205,230,0.28)';
        }
      };
      btn.onmouseleave = () => {
        if (this._getActive() !== value) {
          btn.style.background = 'var(--color-surface-primary)';
          btn.style.color = 'var(--color-text-primary)';
        }
      };
      container.appendChild(btn);
      return btn;
    };

    this._standardBtn = addButton('Standard', 'standard');

    const divider = document.createElement('div');
    divider.style.width = '1px';
    divider.style.background = 'var(--color-border)';
    divider.style.alignSelf = 'stretch';
    container.appendChild(divider);

    this._satelliteBtn = addButton('Satellite', 'satellite');
    this._container = container;
    this._updateActive();
    return container;
  }

  onRemove() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._map = undefined;
  }

  _updateActive() {
    const active = this._getActive();
    if (this._standardBtn) {
      const isActive = active === 'standard';
      this._standardBtn.style.background = isActive
        ? 'var(--color-primary)'
        : 'var(--color-surface-primary)';
      this._standardBtn.style.color = isActive
        ? 'var(--color-surface-primary)'
        : 'var(--color-text-primary)';
    }
    if (this._satelliteBtn) {
      const isActive = active === 'satellite';
      this._satelliteBtn.style.background = isActive
        ? 'var(--color-primary)'
        : 'var(--color-surface-primary)';
      this._satelliteBtn.style.color = isActive
        ? 'var(--color-surface-primary)'
        : 'var(--color-text-primary)';
    }
  }

  setActive() {
    this._updateActive();
  }
}

const PhotoMapLive = () => {
  const navigate = useNavigate();
  const { activeProject, projects, roleForActiveProject } = useAuth();
  const activeProjectId = activeProject?.project_id || activeProject || null;
  const role = roleForActiveProject ? roleForActiveProject() : null;
  const canManage =
    (role || '').toLowerCase() === 'owner' ||
    (role || '').toLowerCase() === 'administrator';

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [projectMarkerOverride, setProjectMarkerOverride] = useState(null);
  const [editLocationOpen, setEditLocationOpen] = useState(false);
  const [isDragMode, setIsDragMode] = useState(false);
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const markersRef = useRef([]);
  const projectLocationPopupRef = useRef(null);
  const hasAutoFitRef = useRef(false);
  const userInteractedRef = useRef(false);

  const activeStyleRef = useRef('standard');
  const satelliteHiddenLayersRef = useRef({});
  const satelliteStyledSymbolsRef = useRef({});

  const { waypoints } = useActivePlanWaypoints(activeProjectId, refreshCounter);

  const activeProjectRow = useMemo(
    () => projects.find((p) => p.project_id === activeProjectId) || null,
    [projects, activeProjectId],
  );

  const selectedProjectName = activeProjectRow?.project_name || '';

  const addressCoord = useMemo(() => {
    if (!activeProjectRow) return null;
    const lat = Number(activeProjectRow.address_lat);
    const lon = Number(activeProjectRow.address_lng);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    return null;
  }, [activeProjectRow]);

  // Project marker comes from projects.address_lat/address_lng. The override is
  // applied immediately after an in-map edit so the pin updates without refetch.
  const projectMarker = useMemo(() => {
    if (projectMarkerOverride) return projectMarkerOverride;
    if (addressCoord) {
      return { latitude: addressCoord.lat, longitude: addressCoord.lon };
    }
    return null;
  }, [projectMarkerOverride, addressCoord]);

  const markerRefs = useMemo(
    () => ({ markersRef, projectLocationPopupRef }),
    [],
  );

  const handleLocationModeChange = useCallback((newMode) => {
    setIsDragMode(newMode === 'drag');
  }, []);

  const handleLocationSave = useCallback((data) => {
    const proj = data.project || {};
    let newLocation = null;
    if (proj.address_lat != null && proj.address_lng != null) {
      newLocation = {
        latitude: Number(proj.address_lat),
        longitude: Number(proj.address_lng),
      };
    } else if (data.location) {
      newLocation = data.location;
    }
    setProjectMarkerOverride(newLocation);
    setRefreshCounter((c) => c + 1);
    hasAutoFitRef.current = false;
    userInteractedRef.current = false;
    setIsDragMode(false);
    setEditLocationOpen(false);
    if (newLocation && mapInstance.current) {
      const newLat = Number(newLocation.latitude);
      const newLng = Number(newLocation.longitude);
      if (Number.isFinite(newLat) && Number.isFinite(newLng)) {
        mapInstance.current.jumpTo({
          center: [newLng, newLat],
          zoom: Math.max(mapInstance.current.getZoom?.() ?? 10, 15),
        });
      }
    }
  }, []);

  const openPhotoViewer = useCallback(
    (photo) => {
      if (!photo?.photo_id) return;
      navigate(`/view/photos/${photo.photo_id}`, { state: { from: 'map' } });
    },
    [navigate],
  );

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return undefined;

    try {
      mapInstance.current = new maplibregl.Map({
        container: mapRef.current,
        style: STANDARD_STYLE_URL,
        center: [-98.5, 39.8], // USA center
        zoom: 3.5,
        transformRequest: (url, resourceType) => {
          if (
            resourceType === 'Style' ||
            resourceType === 'Source' ||
            resourceType === 'Tile'
          ) {
            return { url, headers: {}, credentials: 'omit' };
          }
          return undefined;
        },
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error initializing map:', error);
      return undefined;
    }

    if (typeof mapInstance.current?.addControl === 'function') {
      mapInstance.current.addControl(
        new maplibregl.NavigationControl(),
        'top-right',
      );
    }

    const handleLoad = () => {
      setIsMapReady(true);
    };

    const handleError = (e) => {
      // eslint-disable-next-line no-console
      console.error('Map error:', e);
    };

    const supportsEvents = typeof mapInstance.current?.on === 'function';
    if (supportsEvents) {
      mapInstance.current.on('load', handleLoad);
      mapInstance.current.on('error', handleError);
      const setInteracted = () => {
        userInteractedRef.current = true;
      };
      mapInstance.current.on('dragstart', setInteracted);
      mapInstance.current.on('zoomstart', setInteracted);
      mapInstance.current.on('rotatestart', setInteracted);
      mapInstance.current.on('pitchstart', setInteracted);
      mapInstance.current.__setInteracted = setInteracted;
    }

    const applyStyle = (styleKey) => {
      const map = mapInstance.current;
      if (!map) return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      activeStyleRef.current = styleKey;

      const ensureSatelliteHybrid = () => {
        try {
          const style = map.getStyle();
          if (style && Array.isArray(style.layers)) {
            const backgroundLayer = style.layers.find(
              (l) => l.type === 'background',
            );
            if (backgroundLayer) {
              map.setPaintProperty(
                backgroundLayer.id,
                'background-color',
                'rgba(0,0,0,0)',
              );
            }
          }
          if (!map.getSource('satellite-raster')) {
            map.addSource('satellite-raster', SATELLITE_RASTER_SOURCE);
          }
          const firstLayerId = map.getStyle()?.layers?.[0]?.id;
          if (!map.getLayer('satellite-raster')) {
            if (firstLayerId) {
              map.addLayer(
                {
                  id: 'satellite-raster',
                  type: 'raster',
                  source: 'satellite-raster',
                  minzoom: 0,
                  maxzoom: 22,
                },
                firstLayerId,
              );
            } else {
              map.addLayer({
                id: 'satellite-raster',
                type: 'raster',
                source: 'satellite-raster',
                minzoom: 0,
                maxzoom: 22,
              });
            }
          }

          const layers = map.getStyle()?.layers || [];
          const hidden = {};
          const styledSymbols = {};
          layers.forEach((layer) => {
            const { id, type } = layer;
            if (!id || !type) return;

            if (
              type === 'fill' ||
              type === 'fill-extrusion' ||
              type === 'background'
            ) {
              try {
                const prevVisibility =
                  map.getLayoutProperty(id, 'visibility') || 'visible';
                map.setLayoutProperty(id, 'visibility', 'none');
                hidden[id] = prevVisibility;
              } catch {
                // ignore
              }
              return;
            }

            if (type === 'line') {
              const isRoad =
                id.includes('road') ||
                id.includes('street') ||
                id.includes('highway');
              const isBoundary =
                id.includes('boundary') || id.includes('admin');

              if (isBoundary) {
                return;
              }

              if (isRoad) {
                try {
                  const prevPaintColor = map.getPaintProperty(id, 'line-color');
                  const prevPaintOpacity = map.getPaintProperty(
                    id,
                    'line-opacity',
                  );
                  const prevVisibility =
                    map.getLayoutProperty(id, 'visibility') || 'visible';
                  styledSymbols[id] = {
                    lineColor: prevPaintColor,
                    lineOpacity: prevPaintOpacity,
                    visibility: prevVisibility,
                  };
                  map.setPaintProperty(id, 'line-color', '#000000');
                  map.setPaintProperty(id, 'line-opacity', 0.0);
                  map.setLayoutProperty(id, 'visibility', 'visible');
                } catch {
                  // ignore
                }
                return;
              }

              try {
                const prevVisibility =
                  map.getLayoutProperty(id, 'visibility') || 'visible';
                map.setLayoutProperty(id, 'visibility', 'none');
                hidden[id] = prevVisibility;
              } catch {
                // ignore
              }
              return;
            }

            if (type === 'symbol') {
              try {
                const prevVisibility =
                  map.getLayoutProperty(id, 'visibility') || 'visible';
                if (prevVisibility !== 'visible') {
                  hidden[id] = prevVisibility;
                  map.setLayoutProperty(id, 'visibility', 'visible');
                }
                const prevTextColor = map.getPaintProperty(id, 'text-color');
                const prevTextHaloColor = map.getPaintProperty(
                  id,
                  'text-halo-color',
                );
                const prevTextHaloWidth = map.getPaintProperty(
                  id,
                  'text-halo-width',
                );
                styledSymbols[id] = {
                  textColor: prevTextColor,
                  textHaloColor: prevTextHaloColor,
                  textHaloWidth: prevTextHaloWidth,
                };
                map.setPaintProperty(id, 'text-color', '#ffffff');
                map.setPaintProperty(id, 'text-halo-color', '#000000');
                map.setPaintProperty(id, 'text-halo-width', 1.5);
              } catch {
                // ignore
              }
            }
          });
          satelliteHiddenLayersRef.current = hidden;
          satelliteStyledSymbolsRef.current = styledSymbols;
        } catch {
          // Non-fatal: skip hybrid overlay if anything fails
        }
      };

      const removeSatelliteHybrid = () => {
        try {
          if (map.getLayer('satellite-raster')) {
            map.removeLayer('satellite-raster');
          }
          if (map.getSource('satellite-raster')) {
            map.removeSource('satellite-raster');
          }
        } catch {
          // ignore
        }

        const hidden = satelliteHiddenLayersRef.current || {};
        Object.entries(hidden).forEach(([layerId, prevVisibility]) => {
          try {
            const current = map.getLayoutProperty(layerId, 'visibility');
            if (current !== prevVisibility) {
              map.setLayoutProperty(layerId, 'visibility', prevVisibility);
            }
          } catch {
            // ignore
          }
        });
        satelliteHiddenLayersRef.current = {};

        const styled = satelliteStyledSymbolsRef.current || {};
        Object.entries(styled).forEach(([layerId, prevPaint]) => {
          try {
            if (prevPaint.textColor !== undefined) {
              map.setPaintProperty(layerId, 'text-color', prevPaint.textColor);
            }
            if (prevPaint.textHaloColor !== undefined) {
              map.setPaintProperty(
                layerId,
                'text-halo-color',
                prevPaint.textHaloColor,
              );
            }
            if (prevPaint.textHaloWidth !== undefined) {
              map.setPaintProperty(
                layerId,
                'text-halo-width',
                prevPaint.textHaloWidth,
              );
            }
            if (prevPaint.lineColor !== undefined) {
              map.setPaintProperty(layerId, 'line-color', prevPaint.lineColor);
            }
            if (prevPaint.lineOpacity !== undefined) {
              map.setPaintProperty(
                layerId,
                'line-opacity',
                prevPaint.lineOpacity,
              );
            }
            if (prevPaint.visibility !== undefined) {
              map.setLayoutProperty(
                layerId,
                'visibility',
                prevPaint.visibility,
              );
            }
          } catch {
            // ignore
          }
        });
        satelliteStyledSymbolsRef.current = {};
      };

      const applyStandard = () => {
        removeSatelliteHybrid();
        try {
          const style = map.getStyle();
          if (style && Array.isArray(style.layers)) {
            const backgroundLayer = style.layers.find(
              (l) => l.type === 'background',
            );
            if (backgroundLayer) {
              map.setPaintProperty(
                backgroundLayer.id,
                'background-color',
                '#f8f9fa',
              );
            }
          }
        } catch {
          // ignore background restore failures
        }
      };

      if (styleKey === 'satellite') {
        ensureSatelliteHybrid();
      } else {
        applyStandard();
      }

      map.jumpTo({ center, zoom, bearing, pitch });
      toggleControl?.setActive();
    };

    const toggleControl = new BasemapToggleControl({
      onSelect: applyStyle,
      getActive: () => activeStyleRef.current,
    });

    mapInstance.current.addControl(toggleControl, 'top-right');

    return () => {
      setIsMapReady(false);
      if (supportsEvents && typeof mapInstance.current?.off === 'function') {
        mapInstance.current.off('load', handleLoad);
        mapInstance.current.off('error', handleError);
        if (mapInstance.current.__setInteracted) {
          mapInstance.current.off(
            'dragstart',
            mapInstance.current.__setInteracted,
          );
          mapInstance.current.off(
            'zoomstart',
            mapInstance.current.__setInteracted,
          );
          mapInstance.current.off(
            'rotatestart',
            mapInstance.current.__setInteracted,
          );
          mapInstance.current.off(
            'pitchstart',
            mapInstance.current.__setInteracted,
          );
          delete mapInstance.current.__setInteracted;
        }
      }
      clearWaypointMarkers(markerRefs);
      if (typeof mapInstance.current?.remove === 'function') {
        mapInstance.current.remove();
      }
      mapInstance.current = null;
    };
  }, [markerRefs]);

  useEffect(() => {
    // Close the project-location popup when clicking the map background.
    const mapContainer = mapRef.current;
    if (!mapContainer) return undefined;

    const handleDocumentClickCapture = (evt) => {
      const target = evt?.target;
      if (!target || typeof target.closest !== 'function') return;
      if (
        target.closest('.maplibregl-marker') ||
        target.closest('.maplibregl-popup') ||
        target.closest('.maplibregl-ctrl')
      ) {
        return;
      }
      if (!target.closest('[data-photo-map-live="1"]')) return;
      if (projectLocationPopupRef.current) {
        try {
          projectLocationPopupRef.current.remove();
        } catch {
          // ignore
        }
        projectLocationPopupRef.current = null;
      }
    };

    document.addEventListener('click', handleDocumentClickCapture, true);
    return () => {
      document.removeEventListener('click', handleDocumentClickCapture, true);
    };
  }, []);

  useEffect(() => {
    setProjectMarkerOverride(null);
    hasAutoFitRef.current = false;
    userInteractedRef.current = false;
  }, [activeProjectId]);

  useEffect(() => {
    if (!mapInstance.current || !isMapReady) return undefined;
    const map = mapInstance.current;

    const { bounds, hasProjectPin, pmLat, pmLng } = addWaypointMarkersToMap(
      map,
      markerRefs,
      {
        waypoints,
        projectMarker,
        canManage,
        selectedProjectName,
        onWaypointClick: setSelectedWaypoint,
        onEditProjectLocation: () => setEditLocationOpen(true),
        isDragMode,
      },
    );

    if (!hasAutoFitRef.current && !userInteractedRef.current && !isDragMode) {
      const hasWaypoints = bounds && !bounds.isEmpty();
      let projLngLat = null;
      if (hasProjectPin) projLngLat = [pmLng, pmLat];
      else if (addressCoord) projLngLat = [addressCoord.lon, addressCoord.lat];

      if (projLngLat && hasWaypoints) {
        bounds.extend(projLngLat);
        map.fitBounds(bounds, { padding: 80, maxZoom: 17, animate: false });
        hasAutoFitRef.current = true;
      } else if (projLngLat) {
        map.jumpTo({ center: projLngLat, zoom: 15 });
        hasAutoFitRef.current = true;
      } else if (hasWaypoints) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 17, animate: false });
        hasAutoFitRef.current = true;
      }
    }

    return () => clearWaypointMarkers(markerRefs);
  }, [
    waypoints,
    projectMarker,
    canManage,
    selectedProjectName,
    addressCoord,
    isDragMode,
    isMapReady,
    markerRefs,
  ]);

  return (
    <div
      data-photo-map-live="1"
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      <EditLocationModal
        open={editLocationOpen}
        onClose={() => {
          setEditLocationOpen(false);
          setIsDragMode(false);
        }}
        onSave={handleLocationSave}
        projectId={activeProjectId}
        projectMarker={projectMarker}
        mapInstance={mapInstance}
        onModeChange={handleLocationModeChange}
      />
      <WaypointPhotosModal
        open={!!selectedWaypoint}
        waypoint={selectedWaypoint}
        onClose={() => setSelectedWaypoint(null)}
        onPhotoClick={openPhotoViewer}
      />
    </div>
  );
};

export default PhotoMapLive;
