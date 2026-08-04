import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import PanoramaViewer from '../components/photo/PanoramaViewer';
import PanZoomImage from '../components/photo/PanZoomImage';
import PublicHeaderBanner from '../components/photo/PublicHeaderBanner';
import WaypointPhotoSwitcher from '../components/photo/WaypointPhotoSwitcher';
import WaypointSwitcher from '../components/photo/WaypointSwitcher';
import PublicLinkMiniMap from '../components/photo/PublicLinkMiniMap';
import PublicDrawingCanvas from '../components/drawings/PublicDrawingCanvas';
import PublicPhotosLinkMap from '../components/map/PublicPhotosLinkMap';
import WaypointPhotosModal from '../components/map/WaypointPhotosModal';
import publicPhotosLinkService from '../services/publicPhotosLinkService';
import {
  isDrawingAligned,
  waypointsToPixelPositions,
} from '../utils/drawingAffineTransform';
import { formatMonthDayYear } from '../utils/dateTime';
import {
  orderLinkWaypoints,
  pickNearestPhoto,
} from '../utils/publicLinkNavigation';

const sortByTakenAtAsc = (a, b) => {
  const ta = new Date(a.taken_at || 0).getTime();
  const tb = new Date(b.taken_at || 0).getTime();
  return ta - tb;
};

/**
 * Public, unauthenticated read-only Photos viewer reached via a Public Link
 * token. Renders the frozen drawing (if any) or map for the snapshot's
 * capture method, with the same simplified pins as the PDF export, and lets
 * visitors open the same thumbnail/date popup and immersive photo view used
 * on the authenticated Photos page — no waypoint dropdown, no drawing
 * navigator, no edit affordances.
 */
const PublicPhotosLinkViewerPage = () => {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const deepLinkPhotoId = searchParams.get('photo');

  const [link, setLink] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // 'map' | 'drawing' | 'photo'
  const [view, setView] = useState(null);
  const [priorView, setPriorView] = useState('drawing');
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [activePhotoId, setActivePhotoId] = useState(null);
  const [photoDetail, setPhotoDetail] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [isPhotoLoading, setIsPhotoLoading] = useState(false);
  const deepLinkAppliedRef = useRef(false);
  // Hide waypoint switcher + mini map on phones; keep date switcher top-right.
  const [isPhone, setIsPhone] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsPhone(e.matches);
    setIsPhone(mq.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    deepLinkAppliedRef.current = false;
    publicPhotosLinkService
      .getLink(token)
      .then((resp) => {
        if (cancelled) return;
        const data = resp?.link || null;
        setLink(data);
        if (!data) return;
        const defaultView = data.drawing ? 'drawing' : 'map';
        if (deepLinkPhotoId) {
          const targetId = String(deepLinkPhotoId).trim().toLowerCase();
          const match = (data.waypoints || [])
            .flatMap((wp) => wp.photos || [])
            .find(
              (photo) =>
                String(photo.photo_id || '')
                  .trim()
                  .toLowerCase() === targetId
            );
          deepLinkAppliedRef.current = true;
          setPriorView(defaultView);
          setActivePhotoId(match?.photo_id || deepLinkPhotoId);
          setView('photo');
        } else {
          setView(defaultView);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err?.status === 404
              ? 'This link is no longer available.'
              : err?.payload?.error || err?.message || 'Unable to load link.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, deepLinkPhotoId]);

  // Deep-link from a PDF marker (?photo=<id>): land in the immersive photo
  // view for that waypoint photo, with Back wired to drawing/map. Apply once
  // so Back / in-viewer navigation are not forced back into photo view.
  useEffect(() => {
    if (!link || !deepLinkPhotoId || deepLinkAppliedRef.current) return;
    deepLinkAppliedRef.current = true;
    const targetId = String(deepLinkPhotoId).trim().toLowerCase();
    const match = (link.waypoints || [])
      .flatMap((wp) => wp.photos || [])
      .find(
        (photo) =>
          String(photo.photo_id || '')
            .trim()
            .toLowerCase() === targetId
      );

    const defaultView = link.drawing ? 'drawing' : 'map';
    setPriorView(defaultView);
    setActivePhotoId(match?.photo_id || deepLinkPhotoId);
    setView('photo');
  }, [link, deepLinkPhotoId]);

  const captureMethod = link?.capture_method;
  const hasDrawing = !!link?.drawing;
  const canToggleMapDrawing = captureMethod === 'drone' && hasDrawing;

  const drawingMarkers = useMemo(() => {
    if (!link || view !== 'drawing') return [];
    if (captureMethod === '360_camera') {
      return (link.waypoints || [])
        .filter((wp) => wp.pixel_x != null && wp.pixel_y != null)
        .map((wp) => ({ ...wp, pixelX: wp.pixel_x, pixelY: wp.pixel_y }));
    }
    if (
      captureMethod === 'drone' &&
      link.drawing &&
      isDrawingAligned(link.drawing)
    ) {
      return waypointsToPixelPositions(link.drawing, link.waypoints);
    }
    return [];
  }, [link, view, captureMethod]);

  const mapWaypoints = useMemo(() => {
    if (!link || view !== 'map') return [];
    return (link.waypoints || []).filter(
      (wp) => wp.lat != null && wp.lng != null
    );
  }, [link, view]);

  const orderedWaypoints = useMemo(
    () => orderLinkWaypoints(link?.waypoints, captureMethod),
    [link, captureMethod]
  );

  const openPhotoView = useCallback(
    (photo) => {
      if (!photo?.photo_id) return;
      setPriorView(view);
      setSelectedWaypoint(null);
      setActivePhotoId(photo.photo_id);
      setView('photo');
    },
    [view]
  );

  const goBack = useCallback(() => {
    setView(priorView);
    setActivePhotoId(null);
    setPhotoDetail(null);
    setPhotoError('');
  }, [priorView]);

  const preferredTakenAt = useMemo(() => {
    if (photoDetail?.taken_at) return photoDetail.taken_at;
    if (!link || !activePhotoId) return null;
    for (const wp of link.waypoints || []) {
      const match = (wp.photos || []).find((p) => p.photo_id === activePhotoId);
      if (match?.taken_at) return match.taken_at;
    }
    return null;
  }, [photoDetail, link, activePhotoId]);

  const switchToWaypoint = useCallback(
    (waypoint) => {
      if (!waypoint) return;
      const photo = pickNearestPhoto(waypoint.photos, preferredTakenAt);
      if (photo?.photo_id) setActivePhotoId(photo.photo_id);
    },
    [preferredTakenAt]
  );

  useEffect(() => {
    if (!activePhotoId) return undefined;
    let cancelled = false;
    setIsPhotoLoading(true);
    setPhotoError('');
    publicPhotosLinkService
      .getPhoto(token, activePhotoId)
      .then((resp) => {
        if (!cancelled) setPhotoDetail(resp?.photo || null);
      })
      .catch((err) => {
        if (!cancelled) {
          setPhotoError(
            err?.status === 404
              ? 'This photo is no longer available.'
              : err?.payload?.error || err?.message || 'Unable to load photo.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsPhotoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, activePhotoId]);

  const sameWaypointPhotos = useMemo(() => {
    if (!link || !photoDetail?.waypoint_id) {
      return photoDetail ? [photoDetail] : [];
    }
    const waypoint = (link.waypoints || []).find(
      (wp) => wp.waypoint_id === photoDetail.waypoint_id
    );
    return [...(waypoint?.photos || [])].sort(sortByTakenAtAsc);
  }, [link, photoDetail]);

  const currentWaypointId =
    photoDetail?.waypoint_id ||
    (link?.waypoints || []).find((wp) =>
      (wp.photos || []).some((p) => p.photo_id === activePhotoId)
    )?.waypoint_id ||
    null;

  const isPanorama =
    photoDetail?.capture_method === '360_camera' ||
    photoDetail?.waypoint_action === 'photo_360';

  useEffect(() => {
    if (!link) return undefined;
    const previousTitle = document.title;
    const titleBase = link.project_name || 'Photos';
    const datePart =
      view === 'photo' && photoDetail?.taken_at
        ? ` - ${formatMonthDayYear(photoDetail.taken_at)}`
        : '';
    const nextTitle = `${titleBase}${datePart} - Swallow`;
    document.title = nextTitle;

    // Keep share previews in sync when crawlers re-fetch or in-app browsers
    // read the live DOM (SMS caches the first scrape of og:title separately).
    const ensureMeta = (attr, key, value) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', value);
    };
    ensureMeta('property', 'og:title', nextTitle);
    ensureMeta('name', 'twitter:title', nextTitle);
    ensureMeta(
      'property',
      'og:description',
      'Shared project photos on Swallow'
    );

    return () => {
      document.title = previousTitle;
    };
  }, [link, view, photoDetail]);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <PublicHeaderBanner />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
          }}
        >
          Loading…
        </div>
      </div>
    );
  }

  if (error || !link) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <PublicHeaderBanner />
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-text-secondary)',
          }}
        >
          {error || 'This link is no longer available.'}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        width: '100%',
      }}
    >
      <PublicHeaderBanner
        projectName={link.project_name}
        waypointName={view === 'photo' ? photoDetail?.waypoint_name : null}
        takenAt={view === 'photo' ? photoDetail?.taken_at : null}
      />

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {view === 'photo' ? (
          <>
            {photoDetail?.r2_url ? (
              isPanorama ? (
                <PanoramaViewer
                  key={photoDetail.photo_id}
                  src={photoDetail.r2_url}
                  className="public-photos-link-panorama"
                />
              ) : (
                <PanZoomImage
                  src={photoDetail.r2_url}
                  alt={photoDetail.waypoint_name || 'Photo'}
                />
              )
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--color-surface-secondary)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {photoError ||
                  (isPhotoLoading ? 'Loading photo…' : 'Photo not available.')}
              </div>
            )}

            <div
              style={{
                position: 'absolute',
                top: 'var(--space-md)',
                left: 'var(--space-md)',
                zIndex: 10,
              }}
            >
              <button
                type="button"
                className="btn-format-1 drawings-page__tool-btn"
                onClick={goBack}
              >
                ‹ Back
              </button>
            </div>

            {sameWaypointPhotos.length ? (
              <div
                style={
                  isPhone
                    ? {
                        position: 'absolute',
                        top: 'var(--space-md)',
                        right: 'var(--space-md)',
                        zIndex: 10,
                      }
                    : {
                        position: 'absolute',
                        top: 'var(--space-md)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 10,
                        maxWidth: 'calc(100% - 280px)',
                      }
                }
              >
                <WaypointPhotoSwitcher
                  orderedPhotos={sameWaypointPhotos}
                  currentId={activePhotoId}
                  onSelect={setActivePhotoId}
                />
              </div>
            ) : null}

            {!isPhone && orderedWaypoints.length ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'var(--space-md)',
                  right: 'var(--space-md)',
                  zIndex: 10,
                }}
              >
                <WaypointSwitcher
                  orderedWaypoints={orderedWaypoints}
                  currentWaypointId={currentWaypointId}
                  onSelect={switchToWaypoint}
                />
              </div>
            ) : null}

            {!isPhone ? (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'var(--space-md)',
                  left: 'var(--space-md)',
                  zIndex: 10,
                }}
              >
                <PublicLinkMiniMap
                  link={link}
                  captureMethod={captureMethod}
                  activeWaypointId={currentWaypointId}
                  onWaypointSelect={switchToWaypoint}
                />
              </div>
            ) : null}
          </>
        ) : view === 'map' ? (
          <>
            <PublicPhotosLinkMap
              waypoints={mapWaypoints}
              onWaypointClick={setSelectedWaypoint}
              captureMethod={captureMethod}
            />
            {canToggleMapDrawing ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'var(--space-md)',
                  left: 'var(--space-md)',
                  zIndex: 10,
                }}
              >
                <button
                  type="button"
                  className="btn-format-1 drawings-page__tool-btn"
                  onClick={() => setView('drawing')}
                >
                  Drawing
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {link.drawing?.r2_url ? (
              <PublicDrawingCanvas
                src={link.drawing.r2_url}
                alt="Drawing"
                width={link.drawing.width}
                height={link.drawing.height}
                waypointMarkers={drawingMarkers}
                onWaypointClick={setSelectedWaypoint}
                captureMethod={captureMethod}
              />
            ) : null}
            {canToggleMapDrawing ? (
              <div
                style={{
                  position: 'absolute',
                  top: 'var(--space-md)',
                  left: 'var(--space-md)',
                  zIndex: 10,
                }}
              >
                <button
                  type="button"
                  className="btn-format-1 drawings-page__tool-btn"
                  onClick={() => setView('map')}
                >
                  Map
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <WaypointPhotosModal
        open={!!selectedWaypoint}
        waypoint={selectedWaypoint}
        onClose={() => setSelectedWaypoint(null)}
        onPhotoClick={openPhotoView}
      />
    </div>
  );
};

export default PublicPhotosLinkViewerPage;
