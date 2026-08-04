import React, { useEffect, useRef } from 'react';
import 'pannellum/build/pannellum.css';
import 'pannellum/build/pannellum.js';

/**
 * Full-bleed 360 panorama viewer powered by Pannellum.
 * Destroys and reinitializes when the source URL changes.
 *
 * `className` is optional and lets a caller scope CSS overrides (e.g.
 * repositioning Pannellum's own control buttons) to just that usage.
 * Loading UI is restyled via `.swallow-panorama` (Barn Swallow design system).
 */
const PanoramaViewer = ({ src, className }) => {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !src || !window.pannellum) return undefined;

    const viewer = window.pannellum.viewer(container, {
      type: 'equirectangular',
      panorama: src,
      autoLoad: true,
      showZoomCtrl: false,
      showFullscreenCtrl: false,
      crossOrigin: 'anonymous',
      hfov: 100,
      minHfov: 50,
      maxHfov: 120,
      strings: {
        loadingLabel: '',
        loadButtonLabel: '',
      },
    });
    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [src]);

  const classes = ['swallow-panorama', className].filter(Boolean).join(' ');

  return (
    <div
      ref={containerRef}
      className={classes}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-charcoal-slate)',
      }}
    />
  );
};

export default PanoramaViewer;
