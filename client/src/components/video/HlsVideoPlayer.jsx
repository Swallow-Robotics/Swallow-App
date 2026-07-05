import React, { useEffect, useRef, useState } from 'react';

const HLS_CDN_SECRET = (process.env.REACT_APP_HLS_CDN_SECRET || '').trim();

const STALL_TIMEOUT_MS = 1000;
const MAX_SOFT_RETRIES = 5;
const HARD_RECONNECT_DELAY_MS = 1000;

const HlsVideoPlayer = ({ src, style, objectFit = 'cover', ...videoProps }) => {
  const videoRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    const useNative = !!video.canPlayType('application/vnd.apple.mpegurl');
    let hls;
    let cancelled = false;
    let stallTimer;
    let hardReconnectTimer;
    let softRetryCount = 0;

    const clearStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = null;
    };
    const armStallTimer = () => {
      clearStallTimer();
      stallTimer = setTimeout(handleStall, STALL_TIMEOUT_MS);
    };

    const handleReady = () => {
      setIsLoading(false);
      softRetryCount = 0;
      armStallTimer(); // keep watching in case a live stream cuts out later
    };
    const handleWaiting = () => {
      setIsLoading(true);
      armStallTimer();
    };
    const handleProgress = () => {
      softRetryCount = 0;
      armStallTimer();
    };
    const handleError = () => hardReconnectSoon();

    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('playing', handleReady);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('error', handleError);

    function handleStall() {
      if (cancelled) return;
      setIsLoading(true);
      if (hls && softRetryCount < MAX_SOFT_RETRIES) {
        softRetryCount += 1;
        hls.startLoad(); // renegotiate in place, no teardown
        armStallTimer();
        return;
      }
      // Native path has no soft renegotiation, or soft retries are exhausted.
      hardReconnectSoon();
    }

    function hardReconnectSoon() {
      if (cancelled) return;
      setIsLoading(true);
      clearStallTimer();
      clearTimeout(hardReconnectTimer);
      hardReconnectTimer = setTimeout(connect, HARD_RECONNECT_DELAY_MS);
    }

    function connect() {
      if (cancelled) return;
      softRetryCount = 0;
      if (hls) {
        hls.destroy();
        hls = null;
      }
      setIsLoading(true);
      armStallTimer();

      if (useNative) {
        video.src = src;
        video.load();
        return;
      }

      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return;
        if (Hls.isSupported()) {
          hls = new Hls({
            xhrSetup: xhr => {
              if (HLS_CDN_SECRET) {
                xhr.setRequestHeader('Authorization', `Bearer ${HLS_CDN_SECRET}`);
              }
            },
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                hardReconnectSoon();
                break;
            }
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
      clearStallTimer();
      clearTimeout(hardReconnectTimer);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('playing', handleReady);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('progress', handleProgress);
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
