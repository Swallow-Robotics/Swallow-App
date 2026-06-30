/**
 * Hook for the View → Map and Drawings pages.
 *
 * Loads waypoints from public.waypoints (via active plans) and groups each
 * waypoint's photos (most recent first). Server returns full waypoint rows
 * (waypoint_id, waypoint_name, lat, lng, sequence, action, alt, plan_id, …)
 * from GET /v1/plans?project_id=<id>; this hook uses waypoint_id, waypoint_name,
 * lat, and lng for marker placement.
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
 * @param {string|null} projectId
 * @param {number} refreshCounter
 * @param {string|null} captureMethod - optional capture_method filter for photos
 * @returns {{ waypoints: Array, isLoading: boolean, error: string }}
 * Each waypoint: { waypoint_id, waypoint_name, lat, lng, photos: [...] }
 */
export function useActivePlanWaypoints(
  projectId,
  refreshCounter = 0,
  captureMethod = null,
) {
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

    const fetchPlansWithRetry = async (attempts = 3) => {
      let lastErr;
      for (let i = 0; i < attempts; i += 1) {
        try {
          return await apiClient.get(`/v1/plans?project_id=${projectId}`);
        } catch (err) {
          lastErr = err;
          if (i < attempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 250 * (i + 1)));
          }
        }
      }
      throw lastErr;
    };

    const run = async () => {
      try {
        const photosUrl = captureMethod
          ? `/v1/photos/project-photos?project_id=${projectId}&capture_method=${captureMethod}`
          : `/v1/photos/project-photos?project_id=${projectId}`;
        const [plansResp, photosResp] = await Promise.all([
          fetchPlansWithRetry(),
          apiClient.get(photosUrl),
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
  }, [projectId, refreshCounter, captureMethod]);

  return { waypoints, isLoading, error };
}
