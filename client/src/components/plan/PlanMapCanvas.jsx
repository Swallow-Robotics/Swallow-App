import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  STANDARD_STYLE_URL,
  createBasemapStyleController,
} from '../../utils/basemapStyle';

const PIN_SVG = (selected) =>
  '<svg width="30" height="38" viewBox="0 0 24 32" fill="none" aria-hidden="true">' +
  '<path d="M12 1C6.477 1 2 5.477 2 11c0 7.732 10 20 10 20s10-12.268 10-20C22 5.477 17.523 1 12 1z"' +
  ` fill="${selected ? 'var(--color-accent)' : 'var(--color-primary)'}" stroke="var(--color-surface-primary)" stroke-width="1.5"/>` +
  '<circle cx="12" cy="11" r="4.5" fill="var(--color-surface-primary)"/>' +
  '</svg>';

const CLICK_MOVE_THRESHOLD_PX = 5;

const markerFilter = (selected) =>
  selected
    ? 'drop-shadow(0 0 4px var(--color-accent)) drop-shadow(0 0 8px var(--color-accent)) drop-shadow(0 2px 6px rgba(31,58,95,0.5))'
    : 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))';

function createMarkerEl(selected) {
  const el = document.createElement('div');
  el.style.width = '30px';
  el.style.height = '38px';
  el.style.cursor = 'pointer';
  el.style.userSelect = 'none';
  el.style.lineHeight = '0';
  el.style.filter = markerFilter(selected);
  el.innerHTML = PIN_SVG(selected);
  return el;
}

/**
 * MapLibre map for Plan/Create and Plan/Edit: Standard/Satellite basemap
 * (driven by the `basemapStyle` prop) plus draggable/clickable/right-clickable
 * waypoint markers.
 */
const PlanMapCanvas = forwardRef(function PlanMapCanvas(
  {
    basemapStyle = 'standard',
    initialCenter = null,
    fitPoints = null,
    waypoints = [],
    selectedLocalId = null,
    interactive = false,
    onSelectWaypoint,
    onDragWaypoint,
    onWaypointContextMenu,
    onMapContextMenu,
  },
  ref,
) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleControllerRef = useRef(null);
  const markersRef = useRef(new Map());
  const hasFitRef = useRef(false);
  const [isReady, setIsReady] = useState(false);

  const callbacksRef = useRef({});
  callbacksRef.current = {
    onSelectWaypoint,
    onDragWaypoint,
    onWaypointContextMenu,
    onMapContextMenu,
  };

  useImperativeHandle(ref, () => ({
    getCenter: () => {
      const center = mapRef.current?.getCenter?.();
      return center ? { lat: center.lat, lng: center.lng } : null;
    },
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STANDARD_STYLE_URL,
      center: initialCenter
        ? [initialCenter.lng, initialCenter.lat]
        : [-98.5, 39.8],
      zoom: initialCenter ? 17 : 3.5,
    });
    mapRef.current = map;
    styleControllerRef.current = createBasemapStyleController(map);

    map.addControl(new maplibregl.NavigationControl(), 'bottom-left');

    const handleLoad = () => setIsReady(true);
    map.on('load', handleLoad);

    const handleContextMenu = (e) => {
      if (!interactiveRef.current) return;
      callbacksRef.current.onMapContextMenu?.(
        e.lngLat.lat,
        e.lngLat.lng,
        e.originalEvent.clientX,
        e.originalEvent.clientY,
      );
    };
    map.on('contextmenu', handleContextMenu);

    return () => {
      map.off('load', handleLoad);
      map.off('contextmenu', handleContextMenu);
      /* eslint-disable react-hooks/exhaustive-deps */
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      /* eslint-enable react-hooks/exhaustive-deps */
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  useEffect(() => {
    styleControllerRef.current?.applyStyle(basemapStyle);
  }, [basemapStyle, isReady]);

  useEffect(() => {
    if (!isReady || hasFitRef.current) return;
    const map = mapRef.current;
    if (!map) return;
    if (fitPoints && fitPoints.length > 1) {
      const bounds = fitPoints.reduce(
        (b, p) => b.extend(p),
        new maplibregl.LngLatBounds(fitPoints[0], fitPoints[0]),
      );
      map.fitBounds(bounds, { padding: 80, maxZoom: 19, duration: 0 });
      hasFitRef.current = true;
    } else if (fitPoints && fitPoints.length === 1) {
      map.jumpTo({ center: fitPoints[0], zoom: 18 });
      hasFitRef.current = true;
    } else if (initialCenter) {
      hasFitRef.current = true;
    }
  }, [isReady, fitPoints, initialCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const seen = new Set();

    waypoints.forEach((wp) => {
      if (wp.lat == null || wp.lng == null) return;
      seen.add(wp.localId);
      const selected = wp.localId === selectedLocalId;
      let marker = markersRef.current.get(wp.localId);

      if (!marker) {
        const el = createMarkerEl(selected);
        marker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom',
          draggable: interactive,
        }).setLngLat([wp.lng, wp.lat]);
        marker.addTo(map);

        // Track mousedown/mouseup distance ourselves (rather than relying on
        // the browser's native `click`) so selecting a marker is unaffected
        // by MapLibre's own drag handling on this same element.
        let downPos = null;
        el.addEventListener('mousedown', (evt) => {
          if (evt.button !== 0) return;
          downPos = { x: evt.clientX, y: evt.clientY };
        });
        el.addEventListener('mouseup', (evt) => {
          const start = downPos;
          downPos = null;
          if (!start) return;
          const dx = evt.clientX - start.x;
          const dy = evt.clientY - start.y;
          if (Math.hypot(dx, dy) < CLICK_MOVE_THRESHOLD_PX) {
            evt.stopPropagation();
            callbacksRef.current.onSelectWaypoint?.(wp.localId);
          }
        });
        el.addEventListener('contextmenu', (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          if (!interactiveRef.current) return;
          callbacksRef.current.onWaypointContextMenu?.(
            wp.localId,
            evt.clientX,
            evt.clientY,
          );
        });
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          callbacksRef.current.onDragWaypoint?.(
            wp.localId,
            lngLat.lat,
            lngLat.lng,
          );
        });

        markersRef.current.set(wp.localId, marker);
      } else {
        const current = marker.getLngLat();
        if (
          Math.abs(current.lat - wp.lat) > 1e-9 ||
          Math.abs(current.lng - wp.lng) > 1e-9
        ) {
          marker.setLngLat([wp.lng, wp.lat]);
        }
        marker.setDraggable(interactive);
        marker
          .getElement()
          .replaceChildren(...Array.from(createMarkerEl(selected).childNodes));
        marker.getElement().style.filter = markerFilter(selected);
      }
    });

    markersRef.current.forEach((marker, localId) => {
      if (!seen.has(localId)) {
        marker.remove();
        markersRef.current.delete(localId);
      }
    });
  }, [waypoints, selectedLocalId, interactive, isReady]);

  return (
    <div
      ref={containerRef}
      data-plan-map="1"
      style={{ position: 'absolute', inset: 0 }}
    />
  );
});

export default PlanMapCanvas;
