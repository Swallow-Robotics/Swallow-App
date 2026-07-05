import React, { useEffect, useRef, useState } from 'react';

// Plays an HLS (.m3u8) stream: native <video> src on Safari, hls.js elsewhere.
// hls.js is loaded on demand so pages that don't render video don't pay for it.
// Renders a fixed-size wrapper (sized via `style`) with a spinner overlay
// until the first frame is ready, so the box never collapses/jumps while
// the stream connects.
const HlsVideoPlayer = ({ src, style, objectFit = 'cover', ...videoProps }) => {
  const videoRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const video = videoRef.current;
    if (!video || !src) return undefined;

    const handleReady = () => setIsLoading(false);
    const handleWaiting = () => setIsLoading(true);
    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('playing', handleReady);
    video.addEventListener('waiting', handleWaiting);

    let hls;
    let cancelled = false;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else {
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
    }

    return () => {
      cancelled = true;
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('playing', handleReady);
      video.removeEventListener('waiting', handleWaiting);
      if (hls) hls.destroy();
    };
  }, [src]);

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: '#000',
        ...style,
      }}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        {...videoProps}
        className="hls-video"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit,
          display: 'block',
        }}
      />
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="spinner" aria-label="Loading video" />
        </div>
      )}
    </div>
  );
};

export default HlsVideoPlayer;
