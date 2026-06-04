/**
 * Hook for the View → Map page.
 *
 * Loads every waypoint belonging to the active project's active plan(s) and
 * groups each waypoint's photos (most recent first). Data sources:
 *   - GET /v1/plans?project_id=<id>        (active plans, each with waypoints)
 *   - GET /v1/photos/project-photos?...    (active photos, with waypoint_id)
 */

import { useEffect, useState } from 'react';
import apiClient from '../services/api';

const takenAtMs = (photo) => {
  const ms = new Date(photo?.taken_at || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const sortByTakenAtDesc = (a, b) => takenAtMs(b) - takenAtMs(a);

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * @returns {{ waypoints: Array, isLoading: boolean, error: string }}
 * Each waypoint: { waypoint_id, waypoint_name, lat, lng, photos: [...] }
 */
export function useActivePlanWaypoints(projectId, refreshCounter = 0) {
  const [waypoints, setWaypoints] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) {
      setWaypoints([]);
      return undefined;
    }

    let cancelled = false;
    setIsLoading(true);
    setError('');

    const run = async () => {
      try {
        const [plansResp, photosResp] = await Promise.all([
          apiClient.get(`/v1/plans?project_id=${projectId}`),
          apiClient.get(`/v1/photos/project-photos?project_id=${projectId}`),
        ]);
        if (cancelled) return;

        const photosByWaypoint = new Map();
        (photosResp?.photos || []).forEach((photo) => {
          if (!photo.waypoint_id) return;
          if (!photosByWaypoint.has(photo.waypoint_id)) {
            photosByWaypoint.set(photo.waypoint_id, []);
          }
          photosByWaypoint.get(photo.waypoint_id).push(photo);
        });

        const merged = new Map();
        (plansResp?.plans || []).forEach((plan) => {
          (plan.waypoints || []).forEach((wp) => {
            if (merged.has(wp.waypoint_id)) return;
            const lat = toNumber(wp.lat);
            const lng = toNumber(wp.lng);
            if (lat === null || lng === null) return;
            const photos = (photosByWaypoint.get(wp.waypoint_id) || []).sort(
              sortByTakenAtDesc,
            );
            merged.set(wp.waypoint_id, {
              waypoint_id: wp.waypoint_id,
              waypoint_name: wp.waypoint_name,
              lat,
              lng,
              photos,
            });
          });
        });

        setWaypoints([...merged.values()]);
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.payload?.error || err?.message || 'Unable to load waypoints.',
          );
          setWaypoints([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshCounter]);

  return { waypoints, isLoading, error };
}
