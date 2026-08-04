export const DRAWING_ZOOM_STEP = 0.0015;
export const DRAWING_MIN_SCALE = 0.25;
export const DRAWING_MAX_SCALE = 8;
export const DRAWING_CLICK_THRESHOLD_PX = 5;

/** Tighter limits for the Public Link photo-view mini map. */
export const MINI_MAP_MIN_SCALE = 1;
export const MINI_MAP_MAX_SCALE = 3.5;

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Keep pan offsets so the scaled drawing cannot be dragged fully out of the
 * container. When the drawing fits (or is smaller than) the container, pan
 * is locked to the origin.
 */
export function clampPanOffset(
  x,
  y,
  { scale, baseScale, nativeW, nativeH, containerW, containerH }
) {
  const totalScale = baseScale * scale;
  if (!totalScale || !containerW || !containerH) {
    return { x: 0, y: 0 };
  }
  const scaledW = nativeW * totalScale;
  const scaledH = nativeH * totalScale;
  const maxX = Math.max(0, (scaledW - containerW) / 2);
  const maxY = Math.max(0, (scaledH - containerH) / 2);
  return {
    x: clamp(x, -maxX, maxX),
    y: clamp(y, -maxY, maxY),
  };
}

export function clientToImagePixel(
  clientX,
  clientY,
  containerEl,
  nativeW,
  nativeH,
  transform,
  baseScale
) {
  if (!containerEl) return null;
  const rect = containerEl.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const totalScale = baseScale * transform.scale;
  if (!totalScale) return null;
  return {
    pixel_x: nativeW / 2 + (clientX - centerX - transform.x) / totalScale,
    pixel_y: nativeH / 2 + (clientY - centerY - transform.y) / totalScale,
  };
}

/** Convert native image pixel coords to container-local screen coords. */
export function imagePixelToContainerPoint(
  pixelX,
  pixelY,
  containerWidth,
  containerHeight,
  nativeW,
  nativeH,
  transform,
  baseScale
) {
  const totalScale = baseScale * transform.scale;
  const centerX = containerWidth / 2;
  const centerY = containerHeight / 2;
  return {
    x: centerX + transform.x + (pixelX - nativeW / 2) * totalScale,
    y: centerY + transform.y + (pixelY - nativeH / 2) * totalScale,
  };
}
