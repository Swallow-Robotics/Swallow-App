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

const MINI_SIZE = { width: 168, height: 128 };

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

  if (collapsed) {
    return (
      <button
        type="button"
        className="btn-format-1 drawings-page__tool-btn"
        onClick={() => setCollapsed(false)}
        aria-label="Show mini map"
        style={{ boxShadow: 'var(--shadow-md)' }}
      >
        Map
      </button>
    );
  }

  return (
    <div
      style={{
        width: MINI_SIZE.width,
        height: MINI_SIZE.height,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-md)',
        background: 'var(--color-surface-primary)',
        position: 'relative',
      }}
    >
      <button
        type="button"
        aria-label="Hide mini map"
        onClick={() => setCollapsed(true)}
        className="btn-format-1 drawings-page__tool-btn"
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          zIndex: 5,
          padding: '2px 8px',
          fontSize: 'var(--font-size-sm)',
          minHeight: 0,
          height: 26,
        }}
      >
        ✕
      </button>

      {useDrawing ? (
        <DrawingPanZoomSurface
          src={link.drawing.r2_url}
          alt="Mini drawing"
          width={Number(link.drawing.width) || 1}
          height={Number(link.drawing.height) || 1}
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
      mapInstance.current.fitBounds(bounds, {
        padding: 28,
        maxZoom: 17,
        animate: false,
      });
      hasAutoFitRef.current = true;
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
