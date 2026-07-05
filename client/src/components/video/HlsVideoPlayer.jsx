import React, { useEffect, useRef, useState } from 'react';

const HLS_CDN_SECRET = (process.env.REACT_APP_HLS_CDN_SECRET || '').trim();

const RECONNECT_DELAY_MS = 2000;

const HlsVideoPlayer = ({ src, style, objectFit = 'cover', ...videoProps }) => {
  const videoRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    const useNative = !!video.canPlayType('application/vnd.apple.mpegurl');
    let hls;
    let cancelled = false;
    let reconnectTimer;

    const handleReady = () => setIsLoading(false);
    const handleWaiting = () => setIsLoading(true);
    const handleError = () => reconnectSoon();

    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('playing', handleReady);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('error', handleError);

    function reconnectSoon() {
      if (cancelled) return;
      setIsLoading(true);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    function connect() {
      if (cancelled) return;
      if (hls) {
        hls.destroy();
        hls = null;
      }
      setIsLoading(true);

      if (useNative) {
        video.src = src;
        video.load();
        return;
      }

      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          hls = new Hls({
            maxLiveSyncPlaybackRate: 1.5,
            xhrSetup: xhr => {
              if (HLS_CDN_SECRET) {
                xhr.setRequestHeader('Authorization', `Bearer ${HLS_CDN_SECRET}`);
              }
            },
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            // eslint-disable-next-line no-console
            console.warn('[HlsVideoPlayer] fatal error, reconnecting', {
              type: data.type,
              details: data.details,
              status: data.response?.code,
              url: data.response?.url || data.frag?.url,
            });
            reconnectSoon();
          });
          hls.loadSource(src);
          hls.attachMedia(video);
        } else {
          video.src = src;
          video.load();
        }
      });
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('playing', handleReady);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('error', handleError);
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
