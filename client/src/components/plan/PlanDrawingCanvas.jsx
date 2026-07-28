import React, { useMemo, useRef, useState } from 'react';
import DrawingPanZoomSurface from '../drawings/DrawingPanZoomSurface';
import {
  geoToPixel,
  pixelToGeo,
  isDrawingAligned,
} from '../../utils/drawingAffineTransform';

const pinSvg = (selected) =>
  '<svg width="30" height="38" viewBox="0 0 24 32" fill="none" aria-hidden="true">' +
  '<path d="M12 1C6.477 1 2 5.477 2 11c0 7.732 10 20 10 20s10-12.268 10-20C22 5.477 17.523 1 12 1z"' +
  ` fill="${selected ? 'var(--color-accent)' : 'var(--color-primary)'}" stroke="var(--color-surface-primary)" stroke-width="1.5"/>` +
  '<circle cx="12" cy="11" r="4.5" fill="var(--color-surface-primary)"/></svg>';

const markerFilter = (selected) =>
  selected
    ? 'drop-shadow(0 0 4px var(--color-accent)) drop-shadow(0 0 8px var(--color-accent)) drop-shadow(0 2px 6px rgba(31,58,95,0.5))'
    : 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))';

// Movement below this (in screen px) is treated as a click/select rather
// than a drag, matching DRAWING_CLICK_THRESHOLD_PX used elsewhere for the
// pan/zoom surface.
const DRAG_MOVE_THRESHOLD_PX = 5;

/** A single draggable/clickable/right-clickable waypoint pin on the drawing. */
const DrawingWaypointMarker = ({
  waypoint,
  pixelX,
  pixelY,
  selected,
  draggable,
  toScreen,
  toImage,
  onSelect,
  onContextMenu,
  onDragEnd,
}) => {
  // Tracks the pointer-down origin (in both screen and image-pixel space)
  // so a drag moves the marker by the cursor's delta instead of snapping it
  // to wherever inside the icon the pointer happens to be. This also lets
  // us tell a plain click (no meaningful movement) apart from a real drag,
  // so clicking a marker only selects it instead of also repositioning it.
  const dragStateRef = useRef(null);
  const [livePixel, setLivePixel] = useState(null);

  const effective = livePixel || { pixel_x: pixelX, pixel_y: pixelY };
  const screen = toScreen(effective.pixel_x, effective.pixel_y);
  if (!screen) return null;

  const handlePointerDown = (e) => {
    if (!draggable || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragStateRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPixelX: pixelX,
      startPixelY: pixelY,
      moved: false,
    };
  };

  const handlePointerMove = (e) => {
    const state = dragStateRef.current;
    if (!state) return;
    e.stopPropagation();
    const dx = e.clientX - state.startClientX;
    const dy = e.clientY - state.startClientY;
    if (!state.moved && Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_PX) return;
    state.moved = true;
    const startImage = toImage(state.startClientX, state.startClientY);
    const currentImage = toImage(e.clientX, e.clientY);
    if (!startImage || !currentImage) return;
    setLivePixel({
      pixel_x: state.startPixelX + (currentImage.pixel_x - startImage.pixel_x),
      pixel_y: state.startPixelY + (currentImage.pixel_y - startImage.pixel_y),
    });
  };

  const endDrag = (e) => {
    const state = dragStateRef.current;
    if (!state) return;
    dragStateRef.current = null;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!state.moved) {
      setLivePixel(null);
      return;
    }
    const pixel = livePixel || {
      pixel_x: state.startPixelX,
      pixel_y: state.startPixelY,
    };
    setLivePixel(null);
    onDragEnd(pixel.pixel_x, pixel.pixel_y);
  };

  const handlePointerCancel = (e) => {
    dragStateRef.current = null;
    setLivePixel(null);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={handlePointerCancel}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e.clientX, e.clientY);
      }}
      title={waypoint.waypoint_name}
      aria-label={`Waypoint ${waypoint.waypoint_name || ''}`}
      style={{
        position: 'absolute',
        left: screen.x,
        top: screen.y,
        transform: 'translate(-50%, -100%)',
        width: 30,
        height: 38,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: draggable ? 'grab' : 'pointer',
        pointerEvents: 'auto',
        touchAction: 'none',
        lineHeight: 0,
        filter: markerFilter(selected),
      }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: pinSvg(selected) }}
    />
  );
};

/**
 * Drawing-based canvas for Plan/Create and Plan/Edit. Wraps
 * DrawingPanZoomSurface directly (rather than the View domain's
 * DrawingCanvas) so waypoint markers can support drag-to-reposition without
 * touching shared View-domain drawing components.
 */
const PlanDrawingCanvas = ({
  drawing,
  waypoints = [],
  selectedLocalId = null,
  interactive = false,
  onSelectWaypoint,
  onDragWaypoint,
  onWaypointContextMenu,
  onDrawingContextMenu,
}) => {
  const aligned = isDrawingAligned(drawing);

  const positioned = useMemo(() => {
    if (!drawing || !aligned) return [];
    return waypoints
      .filter((wp) => wp.lat != null && wp.lng != null)
      .map((wp) => {
        const p = geoToPixel(drawing, wp.lat, wp.lng);
        return p ? { ...wp, pixelX: p.x, pixelY: p.y } : null;
      })
      .filter(Boolean);
  }, [drawing, waypoints, aligned]);

  if (!drawing) {
    return (
      <div
        className="drawings-page--empty"
        style={{ position: 'absolute', inset: 0, display: 'flex' }}
      >
        <p className="drawings-page__message">No drawing selected.</p>
      </div>
    );
  }

  if (!aligned) {
    return (
      <div
        className="drawings-page--empty"
        style={{ position: 'absolute', inset: 0, display: 'flex' }}
      >
        <p className="drawings-page__message">
          This drawing has not been aligned yet.
        </p>
      </div>
    );
  }

  return (
    <DrawingPanZoomSurface
      src={drawing.r2_url}
      alt={drawing.drawing_name || 'Site plan'}
      width={drawing.width}
      height={drawing.height}
      onContextMenu={
        interactive
          ? ({ pixel, screenX, screenY }) => {
              const geo = pixelToGeo(drawing, pixel.pixel_x, pixel.pixel_y);
              if (geo)
                onDrawingContextMenu?.(geo.lat, geo.lng, screenX, screenY);
            }
          : undefined
      }
      style={{ position: 'absolute', inset: 0 }}
      fixedOverlay={({ toScreen, toImage }) =>
        positioned.map((wp) => (
          <DrawingWaypointMarker
            key={wp.localId}
            waypoint={wp}
            pixelX={wp.pixelX}
            pixelY={wp.pixelY}
            selected={wp.localId === selectedLocalId}
            draggable={interactive}
            toScreen={toScreen}
            toImage={toImage}
            onSelect={() => onSelectWaypoint?.(wp.localId)}
            onContextMenu={(x, y) =>
              interactive && onWaypointContextMenu?.(wp.localId, x, y)
            }
            onDragEnd={(px, py) => {
              const geo = pixelToGeo(drawing, px, py);
              if (geo) onDragWaypoint?.(wp.localId, geo.lat, geo.lng);
            }}
          />
        ))
      }
    />
  );
};

export default PlanDrawingCanvas;
