import React, { useCallback, useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import apiClient from '../../services/api';
import DrawingPanZoomSurface from './DrawingPanZoomSurface';
import { ControlPointMarker } from './DrawingMarkerOverlay';
import CoordTextInput from './CoordTextInput';

const STANDARD_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const SATELLITE_RASTER_SOURCE = {
  type: 'raster',
  tiles: [
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
};

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    'satellite-raster': SATELLITE_RASTER_SOURCE,
  },
  layers: [
    { id: 'satellite-raster', type: 'raster', source: 'satellite-raster' },
  ],
};

const MODE_COORDINATES = 'coordinates';
const MODE_MAP = 'map';
const STEP_DRAWING = 'drawing';
const STEP_MAP = 'map';

const AlignDrawingModal = ({
  open,
  drawing,
  projectCenter,
  onClose,
  onSaved,
}) => {
  const [mode, setMode] = useState(MODE_COORDINATES);
  const [controlPoints, setControlPoints] = useState([]);
  const [basemap, setBasemap] = useState('labeled');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [mapAlignStep, setMapAlignStep] = useState(STEP_DRAWING);
  const [pendingPixel, setPendingPixel] = useState(null);
  const [editingPointId, setEditingPointId] = useState(null);
  const [imageDimensions, setImageDimensions] = useState(null);

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapResizeObserverRef = useRef(null);
  const markersRef = useRef([]);
  const mapAlignStepRef = useRef(STEP_DRAWING);
  const pendingPixelRef = useRef(null);
  const editingPointIdRef = useRef(null);
  const controlPointsRef = useRef([]);

  const imageUrl = drawing?.r2_url;
  const imageWidth = drawing?.width || 1;
  const imageHeight = drawing?.height || 1;
  const minPoints = mode === MODE_MAP ? 4 : 3;

  useEffect(() => {
    mapAlignStepRef.current = mapAlignStep;
  }, [mapAlignStep]);

  useEffect(() => {
    pendingPixelRef.current = pendingPixel;
  }, [pendingPixel]);

  useEffect(() => {
    editingPointIdRef.current = editingPointId;
  }, [editingPointId]);

  useEffect(() => {
    controlPointsRef.current = controlPoints;
  }, [controlPoints]);

  useEffect(() => {
    if (!open || !drawing?.drawing_id) return;
    setMode(MODE_COORDINATES);
    setBasemap('labeled');
    setError('');
    setMapAlignStep(STEP_DRAWING);
    setPendingPixel(null);
    setEditingPointId(null);
    setImageDimensions(null);

    const applyPoints = pts =>
      setControlPoints(
        (pts || []).map((pt, i) => ({
          localId: pt.control_point_id || `pt-${i}`,
          pixel_x: pt.pixel_x,
          pixel_y: pt.pixel_y,
          latitude: pt.latitude ?? '',
          longitude: pt.longitude ?? '',
          point_order: pt.point_order || i + 1,
        })),
      );

    if (drawing.control_points) {
      applyPoints(drawing.control_points);
      return undefined;
    }

    let cancelled = false;
    apiClient
      .get(`/v1/drawings/${drawing.drawing_id}`)
      .then(resp => {
        if (!cancelled) applyPoints(resp?.drawing?.control_points);
      })
      .catch(() => {
        if (!cancelled) applyPoints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, drawing?.drawing_id, drawing?.control_points]);

  const clearMapMarkers = useCallback(() => {
    markersRef.current.forEach(m => {
      try {
        m.remove();
      } catch {
        // ignore
      }
    });
    markersRef.current = [];
  }, []);

  const syncMapMarkers = useCallback(
    points => {
      const map = mapInstanceRef.current;
      if (!map) return;
      clearMapMarkers();
      points.forEach((pt, i) => {
        if (pt.longitude === '' || pt.latitude === '' || pt.longitude == null) {
          return;
        }
        const lat = Number(pt.latitude);
        const lng = Number(pt.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const el = document.createElement('div');
        el.textContent = String(i + 1);
        el.style.cssText = `
          width: 26px; height: 26px; border-radius: 50%;
          background: var(--color-primary); color: white;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.35); cursor: pointer;
        `;
        const marker = new maplibregl.Marker({ element: el, draggable: true })
          .setLngLat([lng, lat])
          .addTo(map);
        marker.on('dragend', () => {
          const lngLat = marker.getLngLat();
          setControlPoints(prev =>
            prev.map(p =>
              p.localId === pt.localId
                ? {
                    ...p,
                    longitude: lngLat.lng,
                    latitude: lngLat.lat,
                  }
                : p,
            ),
          );
        });
        markersRef.current.push(marker);
      });
    },
    [clearMapMarkers],
  );

  const initialCenterLng = projectCenter?.lng ?? projectCenter?.lon ?? -98.5;
  const initialCenterLat = projectCenter?.lat ?? 39.8;
  const initialZoom = projectCenter ? 15 : 3.5;

  useEffect(() => {
    if (!open || mode !== MODE_MAP) return;
    const el = mapContainerRef.current;
    if (!el) return;

    const map = new maplibregl.Map({
      container: el,
      style: STANDARD_STYLE_URL,
      center: [initialCenterLng, initialCenterLat],
      zoom: initialZoom,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapInstanceRef.current = map;

    const handleClick = e => {
      if (!map.loaded?.()) return;
      if (mapAlignStepRef.current !== STEP_MAP) return;
      const pixel = pendingPixelRef.current;
      if (!pixel) return;

      const { lng, lat } = e.lngLat;
      const editId = editingPointIdRef.current;

      if (editId) {
        setControlPoints(prev =>
          prev.map(p =>
            p.localId === editId
              ? {
                  ...p,
                  pixel_x: pixel.pixel_x,
                  pixel_y: pixel.pixel_y,
                  latitude: lat,
                  longitude: lng,
                }
              : p,
          ),
        );
        editingPointIdRef.current = null;
        setEditingPointId(null);
      } else {
        setControlPoints(prev => [
          ...prev,
          {
            localId: `new-${Date.now()}`,
            pixel_x: pixel.pixel_x,
            pixel_y: pixel.pixel_y,
            latitude: lat,
            longitude: lng,
            point_order: prev.length + 1,
          },
        ]);
      }

      pendingPixelRef.current = null;
      mapAlignStepRef.current = STEP_DRAWING;
      setPendingPixel(null);
      setMapAlignStep(STEP_DRAWING);
    };

    const setCrosshairCursor = () => {
      const canvas = map.getCanvas?.();
      if (canvas) canvas.style.cursor = 'crosshair';
    };

    const refreshMapLayout = () => {
      try {
        map.resize();
      } catch {
        // ignore
      }
      syncMapMarkers(controlPointsRef.current);
      setCrosshairCursor();
    };

    const onLoad = () => {
      requestAnimationFrame(() => {
        refreshMapLayout();
      });
    };
    map.on('load', onLoad);
    map.on('click', handleClick);
    map.on('dragstart', setCrosshairCursor);
    map.on('dragend', setCrosshairCursor);
    map.on('mousemove', setCrosshairCursor);

    mapResizeObserverRef.current = new ResizeObserver(() => {
      if (mapInstanceRef.current === map) {
        refreshMapLayout();
      }
    });
    mapResizeObserverRef.current.observe(el);

    return () => {
      map.off('load', onLoad);
      map.off('click', handleClick);
      map.off('dragstart', setCrosshairCursor);
      map.off('dragend', setCrosshairCursor);
      map.off('mousemove', setCrosshairCursor);
      mapResizeObserverRef.current?.disconnect();
      mapResizeObserverRef.current = null;
      clearMapMarkers();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [
    open,
    mode,
    clearMapMarkers,
    syncMapMarkers,
    initialCenterLng,
    initialCenterLat,
    initialZoom,
  ]);

  useEffect(() => {
    if (mode === MODE_MAP && mapInstanceRef.current?.loaded?.()) {
      syncMapMarkers(controlPoints);
    }
  }, [controlPoints, mode, syncMapMarkers]);

  const handleBasemapToggle = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const nextBasemap = basemap === 'labeled' ? 'satellite' : 'labeled';
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    const restoreView = () => {
      map.jumpTo({ center, zoom, bearing, pitch });
      try {
        map.resize();
      } catch {
        // ignore
      }
      syncMapMarkers(controlPointsRef.current);
      const canvas = map.getCanvas?.();
      if (canvas) canvas.style.cursor = 'crosshair';
    };

    setBasemap(nextBasemap);

    if (nextBasemap === 'satellite') {
      map.once('style.load', restoreView);
      map.setStyle(SATELLITE_STYLE);
      return;
    }

    map.once('style.load', () => {
      restoreView();
      try {
        if (map.getLayer('satellite-raster')) {
          map.removeLayer('satellite-raster');
        }
        if (map.getSource('satellite-raster')) {
          map.removeSource('satellite-raster');
        }
      } catch {
        // ignore — satellite overlay may not exist on labeled style reload
      }
    });
    map.setStyle(STANDARD_STYLE_URL);
  }, [basemap, syncMapMarkers]);

  const handleDrawingClick = pixel => {
    if (mode === MODE_COORDINATES) {
      setControlPoints(prev => [
        ...prev,
        {
          localId: `new-${Date.now()}`,
          pixel_x: pixel.pixel_x,
          pixel_y: pixel.pixel_y,
          latitude: '',
          longitude: '',
          point_order: prev.length + 1,
        },
      ]);
      return;
    }

    if (editingPointId) {
      setControlPoints(prev =>
        prev.map(p =>
          p.localId === editingPointId
            ? { ...p, pixel_x: pixel.pixel_x, pixel_y: pixel.pixel_y }
            : p,
        ),
      );
      pendingPixelRef.current = pixel;
      mapAlignStepRef.current = STEP_MAP;
      setPendingPixel(pixel);
      setMapAlignStep(STEP_MAP);
      return;
    }

    pendingPixelRef.current = pixel;
    mapAlignStepRef.current = STEP_MAP;
    setPendingPixel(pixel);
    setMapAlignStep(STEP_MAP);
  };

  const updatePoint = (localId, field, value) => {
    setControlPoints(prev =>
      prev.map(p => (p.localId === localId ? { ...p, [field]: value } : p)),
    );
  };

  const removePoint = localId => {
    setControlPoints(prev =>
      prev
        .filter(p => p.localId !== localId)
        .map((p, i) => ({ ...p, point_order: i + 1 })),
    );
    if (editingPointId === localId) {
      editingPointIdRef.current = null;
      pendingPixelRef.current = null;
      mapAlignStepRef.current = STEP_DRAWING;
      setEditingPointId(null);
      setPendingPixel(null);
      setMapAlignStep(STEP_DRAWING);
    }
  };

  const startEditPoint = localId => {
    editingPointIdRef.current = localId;
    pendingPixelRef.current = null;
    mapAlignStepRef.current = STEP_DRAWING;
    setEditingPointId(localId);
    setPendingPixel(null);
    setMapAlignStep(STEP_DRAWING);
    setError('');
  };

  const cancelEdit = () => {
    editingPointIdRef.current = null;
    pendingPixelRef.current = null;
    mapAlignStepRef.current = STEP_DRAWING;
    setEditingPointId(null);
    setPendingPixel(null);
    setMapAlignStep(STEP_DRAWING);
  };

  const handleSave = async () => {
    setError('');
    if (controlPoints.length < minPoints) {
      setError(`At least ${minPoints} control points are required.`);
      return;
    }

    const normalized = controlPoints.map((pt, i) => {
      const lat = Number(pt.latitude);
      const lng = Number(pt.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      return {
        pixel_x: Number(pt.pixel_x),
        pixel_y: Number(pt.pixel_y),
        latitude: lat,
        longitude: lng,
        point_order: i + 1,
      };
    });

    if (normalized.some(p => p === null)) {
      setError('Enter valid latitude and longitude for every control point.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        mode,
        control_points: normalized,
      };
      if (imageDimensions?.w && imageDimensions?.h) {
        payload.width = imageDimensions.w;
        payload.height = imageDimensions.h;
      }
      const resp = await apiClient.post(
        `/v1/drawings/${drawing.drawing_id}/alignment`,
        payload,
      );
      onSaved?.(resp?.drawing);
      onClose();
    } catch (err) {
      setError(
        err?.payload?.message || err?.message || 'Unable to save alignment.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const nextPointNumber = editingPointId
    ? controlPoints.findIndex(p => p.localId === editingPointId) + 1
    : controlPoints.length + 1;

  const drawingToolbarHint = () => {
    if (mode === MODE_COORDINATES) {
      return 'Click the drawing to place a control point, then enter coordinates below.';
    }
    if (mapAlignStep === STEP_MAP && pendingPixel) {
      return `Point ${nextPointNumber} placed on drawing — now click the same location on the map.`;
    }
    if (editingPointId) {
      return `Click the drawing to update point ${nextPointNumber}.`;
    }
    return `Click the drawing to place point ${nextPointNumber}.`;
  };

  const mapToolbarHint = () => {
    if (mapAlignStep === STEP_MAP && pendingPixel) {
      return `Place point ${nextPointNumber} on the map.`;
    }
    return 'Complete the drawing step first.';
  };

  const formatCoord = value => {
    if (value === '' || value == null) return '—';
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(6) : '—';
  };

  if (!open || !drawing) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="modal-body align-drawing-modal"
        style={{
          maxWidth: mode === MODE_MAP ? 'min(96vw, 1100px)' : 'min(96vw, 800px)',
          width: '96%',
          maxHeight: '94vh',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          style={{
            position: 'absolute',
            top: 'var(--space-sm)',
            right: 'var(--space-sm)',
            background: 'none',
            border: 'none',
            fontSize: '1.2em',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            lineHeight: 1,
            zIndex: 2,
          }}
        >
          ✕
        </button>

        <h3 className="modal-header">Align Drawing</h3>

        {drawing.aligned ? (
          <p className="align-drawing-modal__status align-drawing-modal__status--success">
            This drawing is aligned. Update points below to replace the
            alignment.
          </p>
        ) : null}

        <div
          className="segment-toggle"
          style={{ marginBottom: 'var(--space-md)', alignSelf: 'flex-start' }}
          role="group"
          aria-label="Alignment mode"
        >
          <button
            type="button"
            className={`segment-toggle__btn${mode === MODE_COORDINATES ? ' segment-toggle__btn--active' : ''}`}
            aria-pressed={mode === MODE_COORDINATES}
            onClick={() => {
              setMode(MODE_COORDINATES);
              setPendingPixel(null);
              setEditingPointId(null);
              setMapAlignStep(STEP_DRAWING);
              setError('');
            }}
          >
            Insert Coordinates
          </button>
          <div className="segment-toggle__divider" aria-hidden="true" />
          <button
            type="button"
            className={`segment-toggle__btn${mode === MODE_MAP ? ' segment-toggle__btn--active' : ''}`}
            aria-pressed={mode === MODE_MAP}
            onClick={() => {
              setMode(MODE_MAP);
              setPendingPixel(null);
              setEditingPointId(null);
              setMapAlignStep(STEP_DRAWING);
              setError('');
            }}
          >
            Align to Map
          </button>
        </div>

        <div className="align-drawing-modal__panels calib-screen__panels">
          <div className="calib-panel calib-panel--plan">
            <div className="calib-panel__toolbar">
              <span className="calib-panel__toolbar-label">
                {drawingToolbarHint()}
              </span>
            </div>
            <DrawingPanZoomSurface
              src={imageUrl}
              alt={drawing.drawing_name || 'Drawing'}
              width={imageWidth}
              height={imageHeight}
              onImageClick={handleDrawingClick}
              onImageDimensions={setImageDimensions}
              forceCrosshair
              style={{ flex: 1, minHeight: 280, minWidth: 0 }}
              fixedOverlay={({ toScreen }) => (
                <>
                  {controlPoints.map((pt, i) => {
                    const pos = toScreen(pt.pixel_x, pt.pixel_y);
                    return (
                      <ControlPointMarker
                        key={pt.localId}
                        screenX={pos.x}
                        screenY={pos.y}
                        label={i + 1}
                        variant={
                          editingPointId === pt.localId ? 'b' : 'a'
                        }
                      />
                    );
                  })}
                  {pendingPixel
                    ? (() => {
                        const pos = toScreen(
                          pendingPixel.pixel_x,
                          pendingPixel.pixel_y,
                        );
                        return (
                          <ControlPointMarker
                            screenX={pos.x}
                            screenY={pos.y}
                            label="?"
                            variant="b"
                          />
                        );
                      })()
                    : null}
                </>
              )}
            />
          </div>

          {mode === MODE_MAP ? (
            <div className="calib-panel calib-panel--map">
              <div className="calib-panel__toolbar">
                <span className="calib-panel__toolbar-label">
                  {mapToolbarHint()}
                </span>
                <button
                  type="button"
                  className="calib-basemap-btn"
                  onClick={handleBasemapToggle}
                >
                  {basemap === 'labeled'
                    ? 'Switch to Satellite'
                    : 'Switch to Labeled'}
                </button>
              </div>
              <div ref={mapContainerRef} className="calib-map-container" />
            </div>
          ) : null}
        </div>

        {controlPoints.length > 0 || mode === MODE_COORDINATES ? (
          <div className="align-drawing-modal__table-wrap">
            <table className="data-table align-drawing-modal__table">
              <thead>
                <tr>
                  <th>Point</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {controlPoints.map((pt, i) => (
                  <tr
                    key={pt.localId}
                    className={
                      editingPointId === pt.localId
                        ? 'align-drawing-modal__row--editing'
                        : ''
                    }
                  >
                    <td>Point {i + 1}</td>
                    <td>
                      {mode === MODE_COORDINATES ? (
                        <CoordTextInput
                          value={pt.latitude}
                          placeholder="e.g. 40.441234"
                          onChange={e =>
                            updatePoint(pt.localId, 'latitude', e.target.value)
                          }
                        />
                      ) : (
                        formatCoord(pt.latitude)
                      )}
                    </td>
                    <td>
                      {mode === MODE_COORDINATES ? (
                        <CoordTextInput
                          value={pt.longitude}
                          placeholder="e.g. -79.963427"
                          onChange={e =>
                            updatePoint(pt.localId, 'longitude', e.target.value)
                          }
                        />
                      ) : (
                        formatCoord(pt.longitude)
                      )}
                    </td>
                    <td className="align-drawing-modal__actions">
                      {mode === MODE_MAP ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            padding: '2px 8px',
                            marginRight: 'var(--space-xs)',
                          }}
                          onClick={() => startEditPoint(pt.localId)}
                        >
                          Edit
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn-secondary btn-icon-sm"
                        onClick={() => removePoint(pt.localId)}
                        title="Remove point"
                        style={{ fontSize: '0.78em' }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {editingPointId ? (
              <button
                type="button"
                className="btn-secondary"
                style={{
                  marginTop: 'var(--space-sm)',
                  fontSize: 'var(--font-size-sm)',
                }}
                onClick={cancelEdit}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="align-drawing-modal__error">
            {error}
          </p>
        ) : null}

        <div
          className="modal-footer"
          style={{ alignSelf: 'stretch', width: '100%' }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlignDrawingModal;
