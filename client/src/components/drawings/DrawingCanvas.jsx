import React from 'react';
import DrawingPanZoomSurface from './DrawingPanZoomSurface';
import { ProjectMarker, WaypointMarker } from './DrawingMarkerOverlay';

const DrawingCanvas = ({
  src,
  alt,
  width,
  height,
  waypointMarkers,
  projectMarker,
  onWaypointClick,
  onProjectMarkerClick,
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
        cursor: 'grab',
      }}
      fixedOverlay={({ toScreen }) => (
        <>
          {projectMarker
            ? (() => {
                const pos = toScreen(projectMarker.pixelX, projectMarker.pixelY);
                return (
                  <ProjectMarker
                    screenX={pos.x}
                    screenY={pos.y}
                    name={projectMarker.name}
                    onClick={onProjectMarkerClick}
                  />
                );
              })()
            : null}
          {(waypointMarkers || []).map(marker => {
            const pos = toScreen(marker.pixelX, marker.pixelY);
            return (
              <WaypointMarker
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

export default DrawingCanvas;
