import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import DrawingPanZoomSurface from '../drawings/DrawingPanZoomSurface';
import { SimpleWaypointMarker } from '../drawings/DrawingMarkerOverlay';
import {
  addSimpleWaypointMarkersToMap,
  clearWaypointMarkers,
} from '../../utils/waypointMapRendering';
import { STANDARD_STYLE_URL } from '../../utils/basemapStyle';
import {
  isDrawingAligned,
  waypointsToPixelPositions,
} from '../../utils/drawingAffineTransform';
import { WAYPOINT_MARKER_SIZE_MINI } from '../../utils/waypointMarkerIcons';
import {
  MINI_MAP_MAX_SCALE,
  MINI_MAP_MIN_SCALE,
} from '../../utils/drawingPanZoom';

const MINI_SIZE = { width: 168, height: 128 };
const COLLAPSE_BAR_HEIGHT = 22;

const ChevronIcon = ({ direction }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    {direction === 'up' ? (
      <path
        d="M3 9L7 5L11 9"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <path
        d="M3 5L7 9L11 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

const collapseBarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: MINI_SIZE.width,
  height: COLLAPSE_BAR_HEIGHT,
  border: 'none',
  borderTop: '1px solid var(--color-border)',
  background: 'var(--color-surface-primary)',
  color: 'var(--color-mid-sky-blue)',
  cursor: 'pointer',
  lineHeight: 1,
  padding: 0,
};

/**
 * Collapsible bottom-left mini map for the Public Link photo view.
 * Prefers the frozen drawing when available; otherwise shows the MapLibre map.
 * Markers match the main public viewer (scaled down); the active waypoint is
 * accent-highlighted. Clicks jump to that waypoint in the photo viewer.
 */
const PublicLinkMiniMap = ({
  link,
  captureMethod,
  activeWaypointId,
  onWaypointSelect,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const useDrawing = !!link?.drawing?.r2_url;

  const drawingMarkers = useMemo(() => {
    if (!link?.drawing) return [];
    if (captureMethod === '360_camera') {
      return (link.waypoints || [])
        .filter((wp) => wp.pixel_x != null && wp.pixel_y != null)
        .map((wp) => ({ ...wp, pixelX: wp.pixel_x, pixelY: wp.pixel_y }));
    }
    if (
      captureMethod === 'drone' &&
      link.drawing &&
      isDrawingAligned(link.drawing)
    ) {
      return waypointsToPixelPositions(link.drawing, link.waypoints);
    }
    return [];
  }, [link, captureMethod]);

  const mapWaypoints = useMemo(
    () =>
      (link?.waypoints || []).filter((wp) => wp.lat != null && wp.lng != null),
    [link]
  );

  const shellStyle = {
    width: MINI_SIZE.width,
    borderRadius: 'var(--radius-lg)',
    overflow: 'hidden',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-md)',
    background: 'var(--color-surface-primary)',
    position: 'relative',
  };

  if (collapsed) {
    return (
      <div style={shellStyle}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand mini map"
          style={{ ...collapseBarStyle, borderTop: 'none' }}
        >
          <ChevronIcon direction="up" />
        </button>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div
        style={{
          position: 'relative',
          width: MINI_SIZE.width,
          height: MINI_SIZE.height,
        }}
      >
        {useDrawing ? (
          <DrawingPanZoomSurface
            src={link.drawing.r2_url}
            alt="Mini drawing"
            width={Number(link.drawing.width) || 1}
            height={Number(link.drawing.height) || 1}
            minScale={MINI_MAP_MIN_SCALE}
            maxScale={MINI_MAP_MAX_SCALE}
            constrainPan
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--color-charcoal-slate)',
            }}
            fixedOverlay={({ toScreen }) => (
              <>
                {drawingMarkers.map((marker) => {
                  const pos = toScreen(marker.pixelX, marker.pixelY);
                  return (
                    <SimpleWaypointMarker
                      key={marker.waypoint_id}
                      marker={marker}
                      screenX={pos.x}
                      screenY={pos.y}
                      onClick={onWaypointSelect}
                      captureMethod={captureMethod}
                      size={WAYPOINT_MARKER_SIZE_MINI.width}
                      isActive={marker.waypoint_id === activeWaypointId}
                    />
                  );
                })}
              </>
            )}
          />
        ) : (
          <MiniMapLibre
            waypoints={mapWaypoints}
            captureMethod={captureMethod}
            activeWaypointId={activeWaypointId}
            onWaypointClick={onWaypointSelect}
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label="Collapse mini map"
        style={collapseBarStyle}
      >
        <ChevronIcon direction="down" />
      </button>
    </div>
  );
};

const MiniMapLibre = ({
  waypoints,
  captureMethod,
  activeWaypointId,
  onWaypointClick,
}) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const markersRef = useRef([]);
  const hasAutoFitRef = useRef(false);
  const markerRefs = useMemo(() => ({ markersRef }), []);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return undefined;

    mapInstance.current = new maplibregl.Map({
      container: mapRef.current,
      style: STANDARD_STYLE_URL,
      center: [-98.5, 39.8],
      zoom: 3.5,
      attributionControl: false,
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

    const handleLoad = () => setIsMapReady(true);
    mapInstance.current.on('load', handleLoad);

    return () => {
      setIsMapReady(false);
      mapInstance.current?.off('load', handleLoad);
      clearWaypointMarkers(markerRefs);
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [markerRefs]);

  useEffect(() => {
    if (!mapInstance.current || !isMapReady) return undefined;
    const { bounds } = addSimpleWaypointMarkersToMap(
      mapInstance.current,
      markerRefs,
      {
        waypoints,
        onWaypointClick,
        captureMethod,
        markerSize: WAYPOINT_MARKER_SIZE_MINI,
        activeWaypointId,
      }
    );
    if (!hasAutoFitRef.current && bounds && !bounds.isEmpty()) {
      const map = mapInstance.current;
      map.fitBounds(bounds, {
        padding: 28,
        maxZoom: 17,
        animate: false,
      });
      hasAutoFitRef.current = true;

      // Limit pan/zoom so the fitted area cannot be scrolled away.
      const applyLimits = () => {
        const z = map.getZoom();
        map.setMinZoom(Math.max(0, z - 0.15));
        map.setMaxZoom(z + 2.5);
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const latSpan = Math.max(Math.abs(ne.lat - sw.lat), 0.001);
        const lngSpan = Math.max(Math.abs(ne.lng - sw.lng), 0.001);
        const latPad = latSpan * 0.35;
        const lngPad = lngSpan * 0.35;
        map.setMaxBounds([
          [sw.lng - lngPad, sw.lat - latPad],
          [ne.lng + lngPad, ne.lat + latPad],
        ]);
      };
      map.once('idle', applyLimits);
    }
    return () => clearWaypointMarkers(markerRefs);
  }, [
    waypoints,
    onWaypointClick,
    captureMethod,
    activeWaypointId,
    isMapReady,
    markerRefs,
  ]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default PublicLinkMiniMap;
