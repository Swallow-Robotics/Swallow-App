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

/**
 * Pan/zoom drawing surface: click places a point, drag pans, wheel zooms.
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
  const pointerRef = useRef(null);
  const dragRef = useRef(null);
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

  const handlePointerDown = e => {
    if (e.button !== 0) return;
    pointerRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  };

  const handlePointerMove = e => {
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
      e.currentTarget.setPointerCapture?.(e.pointerId);
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
    e.currentTarget.releasePointerCapture?.(e.pointerId);
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
