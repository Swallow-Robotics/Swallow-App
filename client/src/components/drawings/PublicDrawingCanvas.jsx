import React from 'react';
import DrawingPanZoomSurface from './DrawingPanZoomSurface';
import { SimpleWaypointMarker } from './DrawingMarkerOverlay';

/**
 * Read-only drawing view for the public Photos Link viewer. Reuses the same
 * pan/zoom engine as the authenticated Photos page (DrawingCanvas) and the
 * same camera-icon pins, but exposes no edit affordances.
 */
const PublicDrawingCanvas = ({
  src,
  alt,
  width,
  height,
  waypointMarkers,
  onWaypointClick,
}) => {
  const nativeW = Number(width) || 1;
  const nativeH = Number(height) || 1;

  return (
    <DrawingPanZoomSurface
      src={src}
      alt={alt}
      width={nativeW}
      height={nativeH}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-charcoal-slate)',
      }}
      fixedOverlay={({ toScreen }) => (
        <>
          {(waypointMarkers || []).map(marker => {
            const pos = toScreen(marker.pixelX, marker.pixelY);
            return (
              <SimpleWaypointMarker
                key={marker.waypoint_id}
                marker={marker}
                screenX={pos.x}
                screenY={pos.y}
                onClick={onWaypointClick}
              />
            );
          })}
        </>
      )}
    />
  );
};

export default PublicDrawingCanvas;
