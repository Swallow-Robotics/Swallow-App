import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  clamp,
  clientToImagePixel,
  imagePixelToContainerPoint,
  DRAWING_CLICK_THRESHOLD_PX,
  DRAWING_MAX_SCALE,
  DRAWING_MIN_SCALE,
  DRAWING_ZOOM_STEP,
} from '../../utils/drawingPanZoom';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Pan/zoom drawing surface: click places a point, one-finger/mouse drag
 * pans, wheel zooms, and two-finger touch pinches to zoom (centered on the
 * gesture midpoint) while also panning as the midpoint moves.
 */
const DrawingPanZoomSurface = ({
  src,
  alt,
  width,
  height,
  onImageClick,
  onContextMenu,
  onImageDimensions,
  children,
  fixedOverlay,
  forceCrosshair = false,
  className,
  style,
}) => {
  const containerRef = useRef(null);
  // Active pointers by pointerId, so a second touch doesn't clobber the
  // first — needed to tell a one-finger drag from a two-finger pinch.
  const pointersRef = useRef(new Map());
  const pointerRef = useRef(null);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const transformRef = useRef({ scale: 1, x: 0, y: 0 });
  const baseScaleRef = useRef(1);
  const [baseScale, setBaseScale] = useState(1);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [imageSize, setImageSize] = useState({
    w: Number(width) || 1,
    h: Number(height) || 1,
  });

  const nativeW = imageSize.w;
  const nativeH = imageSize.h;

  useEffect(() => {
    setImageSize({ w: Number(width) || 1, h: Number(height) || 1 });
  }, [width, height, src]);

  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  useEffect(() => {
    baseScaleRef.current = baseScale;
  }, [baseScale]);

  const recomputeBaseScale = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!cw || !ch) return;
    const scale = Math.min(cw / nativeW, ch / nativeH, 1);
    setBaseScale(scale);
    setTransform({ scale: 1, x: 0, y: 0 });
    setContainerSize({ w: cw, h: ch });
  }, [nativeW, nativeH]);

  useEffect(() => {
    recomputeBaseScale();
    const ro = new ResizeObserver(recomputeBaseScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recomputeBaseScale, src]);

  const handleWheel = useCallback(e => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;

    setTransform(prev => {
      const nextScale = clamp(
        prev.scale * (1 - e.deltaY * DRAWING_ZOOM_STEP),
        DRAWING_MIN_SCALE,
        DRAWING_MAX_SCALE,
      );
      const ratio = nextScale / prev.scale;
      if (nextScale <= DRAWING_MIN_SCALE) {
        return { scale: DRAWING_MIN_SCALE, x: 0, y: 0 };
      }
      return {
        scale: nextScale,
        x: cursorX - (cursorX - prev.x) * ratio,
        y: cursorY - (cursorY - prev.y) * ratio,
      };
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const beginPinch = () => {
    const points = Array.from(pointersRef.current.values());
    const [a, b] = points;
    pinchRef.current = {
      startDist: distance(a, b) || 1,
      startMid: midpoint(a, b),
      startTransform: { ...transformRef.current },
    };
  };

  const resumeSinglePointerDrag = () => {
    const [remaining] = Array.from(pointersRef.current.values());
    if (!remaining) return;
    // Continue panning from here without a jump — this is a continuation
    // of an existing gesture (finger lifted mid-pinch), not a fresh click.
    pointerRef.current = { startX: remaining.x, startY: remaining.y, moved: true };
    dragRef.current = {
      startX: remaining.x,
      startY: remaining.y,
      originX: transformRef.current.x,
      originY: transformRef.current.y,
    };
  };

  const handlePointerDown = e => {
    if (e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);

    if (pointersRef.current.size === 1) {
      pinchRef.current = null;
      pointerRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
      dragRef.current = null;
    } else if (pointersRef.current.size === 2) {
      // A second finger just touched down: this is now a pinch, not a tap
      // or a one-finger pan/click.
      pointerRef.current = null;
      dragRef.current = null;
      beginPinch();
    }
  };

  const handlePointerMove = e => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const container = containerRef.current;
      if (!container) return;
      const [a, b] = Array.from(pointersRef.current.values());
      const rect = container.getBoundingClientRect();
      const toLocal = point => ({
        x: point.x - rect.left - rect.width / 2,
        y: point.y - rect.top - rect.height / 2,
      });

      const { startDist, startMid, startTransform } = pinchRef.current;
      const nextScale = clamp(
        startTransform.scale * (distance(a, b) / startDist),
        DRAWING_MIN_SCALE,
        DRAWING_MAX_SCALE,
      );
      const zoomRatio = nextScale / startTransform.scale;

      const focalStart = toLocal(startMid);
      const focalNow = toLocal(midpoint(a, b));

      setTransform({
        scale: nextScale,
        x:
          focalStart.x -
          (focalStart.x - startTransform.x) * zoomRatio +
          (focalNow.x - focalStart.x),
        y:
          focalStart.y -
          (focalStart.y - startTransform.y) * zoomRatio +
          (focalNow.y - focalStart.y),
      });
      return;
    }

    if (pointersRef.current.size !== 1) return;
    const pointer = pointerRef.current;
    if (!pointer) return;

    const dx = e.clientX - pointer.startX;
    const dy = e.clientY - pointer.startY;

    if (
      !pointer.moved &&
      (Math.abs(dx) > DRAWING_CLICK_THRESHOLD_PX ||
        Math.abs(dy) > DRAWING_CLICK_THRESHOLD_PX)
    ) {
      pointer.moved = true;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: transformRef.current.x,
        originY: transformRef.current.y,
      };
    }

    const drag = dragRef.current;
    if (!pointer.moved || !drag) return;

    setTransform(prev => ({
      ...prev,
      x: drag.originX + (e.clientX - drag.startX),
      y: drag.originY + (e.clientY - drag.startY),
    }));
  };

  const handlePointerUp = e => {
    const wasTracked = pointersRef.current.has(e.pointerId);
    pointersRef.current.delete(e.pointerId);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!wasTracked) return;

    if (pointersRef.current.size === 0) {
      const pointer = pointerRef.current;
      if (pointer && !pointer.moved && onImageClick) {
        const pixel = clientToImagePixel(
          e.clientX,
          e.clientY,
          containerRef.current,
          nativeW,
          nativeH,
          transformRef.current,
          baseScaleRef.current,
        );
        if (pixel) onImageClick(pixel);
      }
      pointerRef.current = null;
      dragRef.current = null;
      pinchRef.current = null;
    } else if (pointersRef.current.size === 1) {
      pinchRef.current = null;
      resumeSinglePointerDrag();
    } else {
      // 3+ fingers were down and one lifted — re-baseline the pinch from
      // the two remaining pointers so it continues without a jump.
      beginPinch();
    }
  };

  const handleContextMenu = useCallback(
    e => {
      if (!onContextMenu) return;
      e.preventDefault();
      const pixel = clientToImagePixel(
        e.clientX,
        e.clientY,
        containerRef.current,
        nativeW,
        nativeH,
        transformRef.current,
        baseScaleRef.current,
      );
      if (pixel) onContextMenu({ pixel, screenX: e.clientX, screenY: e.clientY });
    },
    [onContextMenu, nativeW, nativeH],
  );

  const handleImageLoad = e => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const dims = { w: img.naturalWidth, h: img.naturalHeight };
      setImageSize(dims);
      onImageDimensions?.(dims);
    }
  };

  const totalScale = baseScale * transform.scale;
  const isDragging = !!dragRef.current;

  const toScreen = useCallback(
    (pixelX, pixelY) =>
      imagePixelToContainerPoint(
        pixelX,
        pixelY,
        containerSize.w,
        containerSize.h,
        nativeW,
        nativeH,
        transform,
        baseScale,
      ),
    [containerSize, nativeW, nativeH, transform, baseScale],
  );

  // Converts a live client (viewport) coordinate to a native image pixel,
  // used by draggable marker overlays (e.g. Plan waypoints) to track the
  // pointer during a drag without duplicating the pan/zoom math.
  const toImage = useCallback(
    (clientX, clientY) =>
      clientToImagePixel(
        clientX,
        clientY,
        containerRef.current,
        nativeW,
        nativeH,
        transformRef.current,
        baseScaleRef.current,
      ),
    [nativeW, nativeH],
  );

  return (
    <div
      ref={containerRef}
      className={className ? `${className} drawing-pan-zoom-surface` : 'drawing-pan-zoom-surface'}
      onDoubleClick={() => setTransform({ scale: 1, x: 0, y: 0 })}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onContextMenu={handleContextMenu}
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#d4d4d4',
        cursor: forceCrosshair || onImageClick ? 'crosshair' : isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${totalScale})`,
          transformOrigin: 'center center',
          width: nativeW,
          height: nativeH,
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          width={nativeW}
          height={nativeH}
          onLoad={handleImageLoad}
          style={{
            display: 'block',
            width: nativeW,
            height: nativeH,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
        {children}
      </div>
      {fixedOverlay ? (
        <div
          className="drawing-pan-zoom-surface__overlay"
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {fixedOverlay({ toScreen, totalScale, toImage })}
        </div>
      ) : null}
    </div>
  );
};

export default DrawingPanZoomSurface;
