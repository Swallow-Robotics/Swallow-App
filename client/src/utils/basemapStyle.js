/**
 * Shared Standard/Satellite basemap style-switching logic for MapLibre maps.
 *
 * "Satellite" is implemented as a raster overlay on top of the standard
 * vector style (rather than swapping to a dedicated satellite style), which
 * keeps road/label symbols visible. Extracted from PhotoMapLive.js so the
 * Plan domain map can reuse the exact same behavior.
 */

export const STANDARD_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export const SATELLITE_RASTER_SOURCE = {
  type: 'raster',
  tiles: [
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  attribution:
    'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
};

export const BASEMAP_STANDARD = 'standard';
export const BASEMAP_SATELLITE = 'satellite';

/**
 * Creates a stateful controller that applies the Standard/Satellite style to
 * a MapLibre map instance in place (preserving center/zoom/bearing/pitch).
 *
 * @param {import('maplibre-gl').Map} map
 * @returns {{ applyStyle: (styleKey: string) => void, getActiveStyle: () => string }}
 */
export function createBasemapStyleController(map) {
  let activeStyle = BASEMAP_STANDARD;
  let hiddenLayers = {};
  let styledSymbols = {};

  const ensureSatelliteHybrid = () => {
    try {
      const style = map.getStyle();
      if (style && Array.isArray(style.layers)) {
        const backgroundLayer = style.layers.find(
          (l) => l.type === 'background',
        );
        if (backgroundLayer) {
          map.setPaintProperty(
            backgroundLayer.id,
            'background-color',
            'rgba(0,0,0,0)',
          );
        }
      }
      if (!map.getSource('satellite-raster')) {
        map.addSource('satellite-raster', SATELLITE_RASTER_SOURCE);
      }
      const firstLayerId = map.getStyle()?.layers?.[0]?.id;
      if (!map.getLayer('satellite-raster')) {
        if (firstLayerId) {
          map.addLayer(
            {
              id: 'satellite-raster',
              type: 'raster',
              source: 'satellite-raster',
              minzoom: 0,
              maxzoom: 22,
            },
            firstLayerId,
          );
        } else {
          map.addLayer({
            id: 'satellite-raster',
            type: 'raster',
            source: 'satellite-raster',
            minzoom: 0,
            maxzoom: 22,
          });
        }
      }

      const layers = map.getStyle()?.layers || [];
      const hidden = {};
      const styled = {};
      layers.forEach((layer) => {
        const { id, type } = layer;
        if (!id || !type) return;

        if (
          type === 'fill' ||
          type === 'fill-extrusion' ||
          type === 'background'
        ) {
          try {
            const prevVisibility =
              map.getLayoutProperty(id, 'visibility') || 'visible';
            map.setLayoutProperty(id, 'visibility', 'none');
            hidden[id] = prevVisibility;
          } catch {
            // ignore
          }
          return;
        }

        if (type === 'line') {
          const isRoad =
            id.includes('road') ||
            id.includes('street') ||
            id.includes('highway');
          const isBoundary = id.includes('boundary') || id.includes('admin');

          if (isBoundary) return;

          if (isRoad) {
            try {
              const prevPaintColor = map.getPaintProperty(id, 'line-color');
              const prevPaintOpacity = map.getPaintProperty(id, 'line-opacity');
              const prevVisibility =
                map.getLayoutProperty(id, 'visibility') || 'visible';
              styled[id] = {
                lineColor: prevPaintColor,
                lineOpacity: prevPaintOpacity,
                visibility: prevVisibility,
              };
              map.setPaintProperty(id, 'line-color', '#000000');
              map.setPaintProperty(id, 'line-opacity', 0.0);
              map.setLayoutProperty(id, 'visibility', 'visible');
            } catch {
              // ignore
            }
            return;
          }

          try {
            const prevVisibility =
              map.getLayoutProperty(id, 'visibility') || 'visible';
            map.setLayoutProperty(id, 'visibility', 'none');
            hidden[id] = prevVisibility;
          } catch {
            // ignore
          }
          return;
        }

        if (type === 'symbol') {
          try {
            const prevVisibility =
              map.getLayoutProperty(id, 'visibility') || 'visible';
            if (prevVisibility !== 'visible') {
              hidden[id] = prevVisibility;
              map.setLayoutProperty(id, 'visibility', 'visible');
            }
            const prevTextColor = map.getPaintProperty(id, 'text-color');
            const prevTextHaloColor = map.getPaintProperty(
              id,
              'text-halo-color',
            );
            const prevTextHaloWidth = map.getPaintProperty(
              id,
              'text-halo-width',
            );
            styled[id] = {
              textColor: prevTextColor,
              textHaloColor: prevTextHaloColor,
              textHaloWidth: prevTextHaloWidth,
            };
            map.setPaintProperty(id, 'text-color', '#ffffff');
            map.setPaintProperty(id, 'text-halo-color', '#000000');
            map.setPaintProperty(id, 'text-halo-width', 1.5);
          } catch {
            // ignore
          }
        }
      });
      hiddenLayers = hidden;
      styledSymbols = styled;
    } catch {
      // Non-fatal: skip hybrid overlay if anything fails
    }
  };

  const removeSatelliteHybrid = () => {
    try {
      if (map.getLayer('satellite-raster')) map.removeLayer('satellite-raster');
      if (map.getSource('satellite-raster'))
        map.removeSource('satellite-raster');
    } catch {
      // ignore
    }

    Object.entries(hiddenLayers).forEach(([layerId, prevVisibility]) => {
      try {
        const current = map.getLayoutProperty(layerId, 'visibility');
        if (current !== prevVisibility) {
          map.setLayoutProperty(layerId, 'visibility', prevVisibility);
        }
      } catch {
        // ignore
      }
    });
    hiddenLayers = {};

    Object.entries(styledSymbols).forEach(([layerId, prevPaint]) => {
      try {
        if (prevPaint.textColor !== undefined) {
          map.setPaintProperty(layerId, 'text-color', prevPaint.textColor);
        }
        if (prevPaint.textHaloColor !== undefined) {
          map.setPaintProperty(
            layerId,
            'text-halo-color',
            prevPaint.textHaloColor,
          );
        }
        if (prevPaint.textHaloWidth !== undefined) {
          map.setPaintProperty(
            layerId,
            'text-halo-width',
            prevPaint.textHaloWidth,
          );
        }
        if (prevPaint.lineColor !== undefined) {
          map.setPaintProperty(layerId, 'line-color', prevPaint.lineColor);
        }
        if (prevPaint.lineOpacity !== undefined) {
          map.setPaintProperty(layerId, 'line-opacity', prevPaint.lineOpacity);
        }
        if (prevPaint.visibility !== undefined) {
          map.setLayoutProperty(layerId, 'visibility', prevPaint.visibility);
        }
      } catch {
        // ignore
      }
    });
    styledSymbols = {};
  };

  const applyStandard = () => {
    removeSatelliteHybrid();
    try {
      const style = map.getStyle();
      if (style && Array.isArray(style.layers)) {
        const backgroundLayer = style.layers.find(
          (l) => l.type === 'background',
        );
        if (backgroundLayer) {
          map.setPaintProperty(
            backgroundLayer.id,
            'background-color',
            '#f8f9fa',
          );
        }
      }
    } catch {
      // ignore background restore failures
    }
  };

  const applyStyle = (styleKey) => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();
    activeStyle = styleKey;

    if (styleKey === BASEMAP_SATELLITE) {
      ensureSatelliteHybrid();
    } else {
      applyStandard();
    }

    map.jumpTo({ center, zoom, bearing, pitch });
  };

  return {
    applyStyle,
    getActiveStyle: () => activeStyle,
  };
}
