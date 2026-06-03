import React, { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 0.0015;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Full-bleed image viewer with wheel zoom and drag pan.
 * Resets transform whenever the source changes.
 */
const PanZoomImage = ({ src, alt }) => {
  const containerRef = useRef(null);
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef(null);

  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, [src]);

  const handleWheel = useCallback(e => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cursorX = e.clientX - rect.left - rect.width / 2;
    const cursorY = e.clientY - rect.top - rect.height / 2;

    setTransform(prev => {
      const nextScale = clamp(
        prev.scale * (1 - e.deltaY * ZOOM_STEP),
        MIN_SCALE,
        MAX_SCALE,
      );
      const ratio = nextScale / prev.scale;
      if (nextScale === MIN_SCALE) {
        return { scale: 1, x: 0, y: 0 };
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
    if (transform.scale <= MIN_SCALE) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: transform.x,
      originY: transform.y,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = e => {
    if (!dragRef.current) return;
    setTransform(prev => ({
      ...prev,
      x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
    }));
  };

  const handlePointerUp = e => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const isZoomed = transform.scale > MIN_SCALE;

  return (
    <div
      ref={containerRef}
      onDoubleClick={() => setTransform({ scale: 1, x: 0, y: 0 })}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: 'var(--color-charcoal-slate)',
        cursor: isZoomed ? 'grab' : 'default',
        touchAction: 'none',
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: 'center center',
          transition: dragRef.current ? 'none' : 'transform 0.08s ease-out',
          userSelect: 'none',
        }}
      />
    </div>
  );
};

export default PanZoomImage;
