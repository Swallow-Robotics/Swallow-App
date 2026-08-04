/**
 * Helpers for Public Link photo-view navigation: ordered waypoints and
 * date-preserving photo selection when jumping between waypoints.
 */

/**
 * Order waypoints for the Public Link switcher.
 * Drone: public.waypoints.sequence ascending (nulls last).
 * 360_camera: alphabetical by waypoint_name.
 */
export function orderLinkWaypoints(waypoints, captureMethod) {
  const list = [...(waypoints || [])];
  if (captureMethod === 'drone') {
    return list.sort((a, b) => {
      const sa =
        a.sequence == null || a.sequence === ''
          ? Number.MAX_SAFE_INTEGER
          : Number(a.sequence);
      const sb =
        b.sequence == null || b.sequence === ''
          ? Number.MAX_SAFE_INTEGER
          : Number(b.sequence);
      if (sa !== sb) return sa - sb;
      return String(a.waypoint_name || '').localeCompare(
        String(b.waypoint_name || ''),
        undefined,
        { sensitivity: 'base' }
      );
    });
  }
  return list.sort((a, b) =>
    String(a.waypoint_name || '').localeCompare(
      String(b.waypoint_name || ''),
      undefined,
      { sensitivity: 'base' }
    )
  );
}

/**
 * Pick the photo on `waypoint` closest in taken_at to `preferredTakenAt`.
 * Falls back to newest when no preference is available.
 */
export function pickNearestPhoto(photos, preferredTakenAt) {
  const list = photos || [];
  if (!list.length) return null;
  if (!preferredTakenAt) {
    return [...list].sort((a, b) => {
      const ta = new Date(a.taken_at || 0).getTime();
      const tb = new Date(b.taken_at || 0).getTime();
      return tb - ta;
    })[0];
  }
  const targetMs = new Date(preferredTakenAt).getTime();
  if (Number.isNaN(targetMs)) {
    return pickNearestPhoto(list, null);
  }
  let best = list[0];
  let bestDist = Infinity;
  list.forEach((photo) => {
    const ms = new Date(photo.taken_at || 0).getTime();
    const dist = Number.isNaN(ms) ? Infinity : Math.abs(ms - targetMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = photo;
    }
  });
  return best;
}
