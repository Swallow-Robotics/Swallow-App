import React, { useEffect, useRef } from 'react';

// Plays an HLS (.m3u8) stream: native <video> src on Safari, hls.js elsewhere.
// hls.js is loaded on demand so pages that don't render video don't pay for it.
const HlsVideoPlayer = ({ src, ...videoProps }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return undefined;
    }

    let hls;
    let cancelled = false;
    import('hls.js').then(({ default: Hls }) => {
      if (cancelled) return;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
      } else {
        video.src = src;
      }
    });

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
    };
  }, [src]);

  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <video ref={videoRef} {...videoProps} />;
};

export default HlsVideoPlayer;
