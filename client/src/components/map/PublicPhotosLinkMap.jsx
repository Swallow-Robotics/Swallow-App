import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  addSimpleWaypointMarkersToMap,
  clearWaypointMarkers,
} from '../../utils/waypointMapRendering';
import {
  STANDARD_STYLE_URL,
  createBasemapStyleController,
} from '../../utils/basemapStyle';
import { BasemapToggleControl } from '../../utils/basemapToggleControl';

/**
 * Minimal, read-only MapLibre map for the public Photos Link viewer (drone,
 * map-only links or the Map toggle). No project pin, drag mode, or edit
 * affordances — those are authenticated-only Photos page features.
 */
const PublicPhotosLinkMap = ({ waypoints, onWaypointClick }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const markersRef = useRef([]);
  const hasAutoFitRef = useRef(false);
  const markerRefs = useMemo(() => ({ markersRef }), []);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return undefined;

    mapInstance.current = new maplibregl.Map({
      container: mapRef.current,
      style: STANDARD_STYLE_URL,
      center: [-98.5, 39.8],
      zoom: 3.5,
      transformRequest: (url, resourceType) => {
        if (
          resourceType === 'Style' ||
          resourceType === 'Source' ||
          resourceType === 'Tile'
        ) {
          return { url, headers: {}, credentials: 'omit' };
        }
        return undefined;
      },
    });

    mapInstance.current.addControl(
      new maplibregl.NavigationControl(),
      'top-right',
    );

    const handleLoad = () => setIsMapReady(true);
    mapInstance.current.on('load', handleLoad);

    const styleController = createBasemapStyleController(mapInstance.current);
    const applyStyle = styleKey => {
      styleController.applyStyle(styleKey);
      toggleControl?.setActive();
    };
    const toggleControl = new BasemapToggleControl({
      onSelect: applyStyle,
      getActive: () => styleController.getActiveStyle(),
    });
    mapInstance.current.addControl(toggleControl, 'top-right');

    return () => {
      setIsMapReady(false);
      mapInstance.current?.off('load', handleLoad);
      clearWaypointMarkers(markerRefs);
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, [markerRefs]);

  useEffect(() => {
    if (!mapInstance.current || !isMapReady) return undefined;
    const { bounds } = addSimpleWaypointMarkersToMap(
      mapInstance.current,
      markerRefs,
      { waypoints, onWaypointClick },
    );
    if (!hasAutoFitRef.current && bounds && !bounds.isEmpty()) {
      mapInstance.current.fitBounds(bounds, {
        padding: 80,
        maxZoom: 17,
        animate: false,
      });
      hasAutoFitRef.current = true;
    }
    return () => clearWaypointMarkers(markerRefs);
  }, [waypoints, onWaypointClick, isMapReady, markerRefs]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default PublicPhotosLinkMap;
