import React, { useState } from 'react';
import DrawingPanZoomSurface from './DrawingPanZoomSurface';
import { SimpleWaypointMarker } from './DrawingMarkerOverlay';
import WaypointHoverPreview, {
  PREVIEW_SIZE,
} from '../photo/WaypointHoverPreview';
import {
  DRAWING_MAX_SCALE,
  MINI_MAP_MIN_SCALE,
} from '../../utils/drawingPanZoom';
import { newestThumbnailUrl } from '../../utils/publicLinkNavigation';

/**
 * Read-only drawing view for the public Photos Link viewer. Reuses the same
 * pan/zoom engine as the authenticated Photos page (DrawingCanvas) and the
 * same circle markers, but exposes no edit affordances. Pan/zoom is clamped
 * like the photo-view mini map so the drawing cannot leave a usable frame.
 * Hovering a marker shows the newest photo thumbnail for that waypoint.
 */
const PublicDrawingCanvas = ({
  src,
  alt,
  width,
  height,
  waypointMarkers,
  onWaypointClick,
  captureMethod,
}) => {
  const nativeW = Number(width) || 1;
  const nativeH = Number(height) || 1;
  const [hover, setHover] = useState(null);

  return (
    <DrawingPanZoomSurface
      src={src}
      alt={alt}
      width={nativeW}
      height={nativeH}
      minScale={MINI_MAP_MIN_SCALE}
      maxScale={DRAWING_MAX_SCALE}
      constrainPan
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-charcoal-slate)',
      }}
      fixedOverlay={({ toScreen }) => (
        <>
          {(waypointMarkers || []).map((marker) => {
            const pos = toScreen(marker.pixelX, marker.pixelY);
            return (
              <SimpleWaypointMarker
                key={marker.waypoint_id}
                marker={marker}
                screenX={pos.x}
                screenY={pos.y}
                onClick={onWaypointClick}
                onMouseEnter={(m) => {
                  const thumb = newestThumbnailUrl(m);
                  if (!thumb) return;
                  setHover({
                    src: thumb,
                    label: m.waypoint_name,
                    x: pos.x,
                    y: pos.y,
                  });
                }}
                onMouseLeave={() => setHover(null)}
                captureMethod={captureMethod}
              />
            );
          })}
          <WaypointHoverPreview
            visible={!!hover}
            src={hover?.src}
            label={hover?.label}
            style={{
              left: hover ? hover.x + 18 : 0,
              top: hover ? hover.y - PREVIEW_SIZE / 2 : 0,
            }}
          />
        </>
      )}
    />
  );
};

export default PublicDrawingCanvas;
