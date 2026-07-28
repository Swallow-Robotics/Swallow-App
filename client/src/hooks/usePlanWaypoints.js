/**
 * Shared waypoint list state for the Plan/Create and Plan/Edit builders.
 *
 * Each waypoint holds a lat/lng (always set once placed on the map/drawing),
 * so — unlike the Plan/Test table — there is no "ghost row" concept here;
 * every row is immediately real and mapped to a marker.
 */

import { useCallback, useMemo, useState } from 'react';

let localIdCounter = 0;
const nextLocalId = () => ++localIdCounter;

/** Spreadsheet-style default names: A–Z, then AA, AB, ... */
export function waypointLetter(index) {
  let label = '';
  let i = index;
  do {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return label;
}

const buildFromExisting = (existingWaypoints) =>
  (existingWaypoints || [])
    .slice()
    .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
    .map((wp) => ({
      localId: nextLocalId(),
      waypoint_id: wp.waypoint_id || null,
      waypoint_name: wp.waypoint_name || '',
      action: wp.action || 'none',
      alt: wp.alt != null ? String(wp.alt) : '',
      lat: wp.lat != null ? Number(wp.lat) : null,
      lng: wp.lng != null ? Number(wp.lng) : null,
    }));

export function usePlanWaypoints(initialWaypoints) {
  const [waypoints, setWaypoints] = useState(() =>
    buildFromExisting(initialWaypoints),
  );
  const [selectedLocalId, setSelectedLocalId] = useState(null);

  const reset = useCallback((nextWaypoints) => {
    setWaypoints(buildFromExisting(nextWaypoints));
    setSelectedLocalId(null);
  }, []);

  const addWaypoint = useCallback(({ lat, lng, name } = {}) => {
    const localId = nextLocalId();
    setWaypoints((prev) => [
      ...prev,
      {
        localId,
        waypoint_id: null,
        waypoint_name: name || waypointLetter(prev.length),
        action: 'none',
        alt: '',
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
      },
    ]);
    setSelectedLocalId(localId);
    return localId;
  }, []);

  const updateField = useCallback((localId, field, value) => {
    setWaypoints((prev) =>
      prev.map((wp) =>
        wp.localId === localId ? { ...wp, [field]: value } : wp,
      ),
    );
  }, []);

  const updateLocation = useCallback((localId, lat, lng) => {
    setWaypoints((prev) =>
      prev.map((wp) =>
        wp.localId === localId
          ? { ...wp, lat: Number(lat), lng: Number(lng) }
          : wp,
      ),
    );
  }, []);

  const removeWaypoint = useCallback((localId) => {
    setWaypoints((prev) => prev.filter((wp) => wp.localId !== localId));
    setSelectedLocalId((prev) => (prev === localId ? null : prev));
  }, []);

  const reorder = useCallback((srcIndex, targetIndex) => {
    setWaypoints((prev) => {
      if (
        srcIndex === targetIndex ||
        srcIndex < 0 ||
        targetIndex < 0 ||
        srcIndex >= prev.length ||
        targetIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(srcIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }, []);

  const validate = useCallback(() => {
    if (!waypoints.length) {
      return { valid: true, error: '' };
    }
    const incomplete = waypoints.some(
      (wp) =>
        wp.alt === '' || wp.alt == null || wp.lat == null || wp.lng == null,
    );
    if (incomplete) {
      return { valid: false, error: 'Waypoint information incomplete.' };
    }
    return { valid: true, error: '' };
  }, [waypoints]);

  const toPayload = useCallback(
    () =>
      waypoints.map((wp, i) => ({
        waypoint_id: wp.waypoint_id || null,
        waypoint_name: wp.waypoint_name,
        action: wp.action,
        alt: parseFloat(wp.alt),
        lat: Number(wp.lat),
        lng: Number(wp.lng),
        sequence: i + 1,
      })),
    [waypoints],
  );

  const selectedWaypoint = useMemo(
    () => waypoints.find((wp) => wp.localId === selectedLocalId) || null,
    [waypoints, selectedLocalId],
  );

  return {
    waypoints,
    setWaypoints,
    reset,
    addWaypoint,
    updateField,
    updateLocation,
    removeWaypoint,
    reorder,
    validate,
    toPayload,
    selectedLocalId,
    setSelectedLocalId,
    selectedWaypoint,
  };
}
