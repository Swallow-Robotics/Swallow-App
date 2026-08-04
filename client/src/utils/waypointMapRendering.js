/**
 * Marker rendering for the View → Map page.
 *
 * Renders a universal photo marker for each waypoint that has photos (caller
 * should pass the filtered list from useActivePlanWaypoints) plus the
 * draggable/editable project-location pin. Kept separate from
 * mapMarkerRendering.js (used by the Fly map) so each page can evolve
 * independently.
 */

import maplibregl from 'maplibre-gl';
import { toLngLat, parseCoordinate } from './mapDataUtils';
import {
  buildCircleMarkerSvg,
  WAYPOINT_MARKER_ACTIVE_FILL,
  WAYPOINT_MARKER_SIZE,
} from './waypointMarkerIcons';

/**
 * Removes all waypoint markers and the project pin from the map.
 */
export function clearWaypointMarkers(refs) {
  const { markersRef, projectLocationPopupRef } = refs || {};
  if (projectLocationPopupRef?.current) {
    try {
      projectLocationPopupRef.current.remove();
    } catch {
      // ignore
    }
    projectLocationPopupRef.current = null;
  }
  (markersRef?.current || []).forEach((marker) => {
    try {
      marker?.remove?.();
    } catch {
      // ignore
    }
  });
  if (markersRef) markersRef.current = [];
}

const WAYPOINT_PIN_SVG =
  '<svg width="28" height="36" viewBox="0 0 24 32" fill="none" aria-hidden="true">' +
  '<path d="M12 1C6.477 1 2 5.477 2 11c0 7.732 10 20 10 20s10-12.268 10-20C22 5.477 17.523 1 12 1z"' +
  ' fill="var(--color-primary)" stroke="var(--color-surface-primary)" stroke-width="1.5"/>' +
  '<rect x="6.5" y="8.5" width="11" height="7" rx="1.6" fill="var(--color-surface-primary)"/>' +
  '<rect x="9.6" y="6.8" width="4.8" height="2.4" rx="0.7" fill="var(--color-surface-primary)"/>' +
  '<circle cx="12" cy="12" r="2.1" fill="var(--color-primary)"/>' +
  '</svg>';

const createWaypointPinEl = () => {
  // MapLibre positions the marker root via `transform: translate(...)`, so hover
  // effects must NOT touch the root transform (doing so makes markers jump). A
  // nested glyph element carries the shadow and scale instead.
  const el = document.createElement('div');
  el.style.width = '28px';
  el.style.height = '36px';
  el.style.cursor = 'pointer';
  el.style.userSelect = 'none';
  el.style.lineHeight = '0';

  const glyph = document.createElement('div');
  glyph.className = 'wp-glyph';
  glyph.style.width = '100%';
  glyph.style.height = '100%';
  glyph.style.lineHeight = '0';
  glyph.style.transformOrigin = 'center bottom';
  glyph.style.transition = 'transform 150ms ease, filter 150ms ease';
  glyph.style.filter = 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))';
  glyph.innerHTML = WAYPOINT_PIN_SVG;
  el.appendChild(glyph);
  return el;
};

/**
 * Adds waypoint markers and the project pin to the map.
 *
 * @returns {{ bounds: maplibregl.LngLatBounds, hasProjectPin: boolean,
 *   pmLat: number|null, pmLng: number|null }}
 */
export function addWaypointMarkersToMap(map, refs, options) {
  if (!map || !refs) {
    return { bounds: null, hasProjectPin: false, pmLat: null, pmLng: null };
  }

  const {
    waypoints = [],
    projectMarker = null,
    canManage = false,
    selectedProjectName = '',
    onWaypointClick = () => {},
    onEditProjectLocation = () => {},
    isDragMode = false,
  } = options || {};

  const { markersRef, projectLocationPopupRef } = refs;
  clearWaypointMarkers(refs);

  const bounds = new maplibregl.LngLatBounds();

  waypoints.forEach((waypoint) => {
    const lngLat = toLngLat(waypoint.lng, waypoint.lat);
    if (!lngLat) return;
    bounds.extend(lngLat);

    const el = createWaypointPinEl();
    el.title = waypoint.waypoint_name || 'Waypoint';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute(
      'aria-label',
      `View photos for ${waypoint.waypoint_name || 'waypoint'}`
    );

    const glyph = el.querySelector('.wp-glyph');
    el.addEventListener('mouseenter', () => {
      if (!glyph) return;
      glyph.style.transform = 'scale(1.08)';
      glyph.style.filter = 'drop-shadow(0 3px 8px rgba(31,58,95,0.5))';
    });
    el.addEventListener('mouseleave', () => {
      if (!glyph) return;
      glyph.style.transform = 'scale(1)';
      glyph.style.filter = 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))';
    });

    const open = (evt) => {
      evt?.stopPropagation?.();
      onWaypointClick(waypoint);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        open(evt);
      }
    });

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat(lngLat)
      .addTo(map);
    if (markersRef) markersRef.current.push(marker);
  });

  const pmLat = projectMarker ? parseCoordinate(projectMarker.latitude) : null;
  const pmLng = projectMarker ? parseCoordinate(projectMarker.longitude) : null;
  const hasProjectPin =
    Number.isFinite(pmLat) && Number.isFinite(pmLng) && !isDragMode;

  if (hasProjectPin) {
    const pinLngLat = [pmLng, pmLat];
    const pinEl = document.createElement('div');
    pinEl.style.width = '24px';
    pinEl.style.height = '32px';
    pinEl.style.boxSizing = 'border-box';
    pinEl.style.userSelect = 'none';
    pinEl.style.lineHeight = '0';
    pinEl.style.cursor = canManage ? 'pointer' : 'default';
    pinEl.style.filter = 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))';
    pinEl.title = selectedProjectName || 'Project location';

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '32');
    svg.setAttribute('viewBox', '0 0 24 32');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const body = document.createElementNS(ns, 'path');
    body.setAttribute(
      'd',
      'M12 1C6.477 1 2 5.477 2 11c0 7.732 10 20 10 20s10-12.268 10-20C22 5.477 17.523 1 12 1z'
    );
    body.setAttribute('fill', 'var(--color-accent)');
    body.setAttribute('stroke', 'var(--color-surface-primary)');
    body.setAttribute('stroke-width', '1.5');
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', '12');
    dot.setAttribute('cy', '11');
    dot.setAttribute('r', '3.5');
    dot.setAttribute('fill', 'var(--color-surface-primary)');
    svg.appendChild(body);
    svg.appendChild(dot);
    pinEl.appendChild(svg);

    pinEl.addEventListener('mouseenter', () => {
      pinEl.style.filter = 'drop-shadow(0 3px 8px rgba(31,58,95,0.5))';
      svg.style.transform = 'scale(1.08)';
      svg.style.transformOrigin = 'center bottom';
    });
    pinEl.addEventListener('mouseleave', () => {
      pinEl.style.filter = 'drop-shadow(0 2px 6px rgba(31,58,95,0.35))';
      svg.style.transform = 'scale(1)';
    });

    const pinMarker = new maplibregl.Marker({
      element: pinEl,
      anchor: 'bottom',
    })
      .setLngLat(pinLngLat)
      .addTo(map);

    if (canManage) {
      const popupRoot = document.createElement('div');
      popupRoot.style.padding = '12px 14px';
      popupRoot.style.background = 'var(--color-surface-primary)';
      popupRoot.style.borderRadius = 'var(--radius-xl)';
      popupRoot.style.boxShadow = 'var(--shadow-lg)';
      popupRoot.style.fontFamily = 'var(--font-family-sans)';
      popupRoot.style.border = '1px solid var(--color-border)';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-primary';
      editBtn.textContent = 'Edit Project Location';
      editBtn.style.whiteSpace = 'nowrap';
      editBtn.onclick = (evt) => {
        evt.stopPropagation();
        if (projectLocationPopupRef?.current) {
          projectLocationPopupRef.current.remove();
          projectLocationPopupRef.current = null;
        }
        onEditProjectLocation(projectMarker);
      };
      popupRoot.appendChild(editBtn);
      const projectPopup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 12,
        maxWidth: 'none',
        className: 'maplibregl-popup--project-location',
      })
        .setDOMContent(popupRoot)
        .setLngLat(pinLngLat);
      if (projectLocationPopupRef) {
        projectLocationPopupRef.current = projectPopup;
      }
      pinMarker.setPopup(projectPopup);
      pinEl.addEventListener('click', (evt) => {
        evt.stopPropagation();
        pinMarker.togglePopup();
      });
    }

    if (markersRef) markersRef.current.push(pinMarker);
  }

  return { bounds, hasProjectPin, pmLat, pmLng };
}

/**
 * Read-only variant for the public Photos Link viewer: a circle marker,
 * colored/iconed by capture method (see waypointMarkerIcons.js), no project
 * pin, no drag/edit affordances. Center-anchored (not bottom-anchored like
 * the authenticated pin).
 *
 * Optional `markerSize` and `activeWaypointId` support the photo-view mini map
 * (scaled markers + accent highlight for the active waypoint).
 *
 * @returns {{ bounds: maplibregl.LngLatBounds }}
 */
export function addSimpleWaypointMarkersToMap(map, refs, options) {
  if (!map || !refs) return { bounds: null };

  const {
    waypoints = [],
    onWaypointClick = () => {},
    captureMethod = '360_camera',
    markerSize = WAYPOINT_MARKER_SIZE,
    activeWaypointId = null,
  } = options || {};
  const { markersRef } = refs;
  clearWaypointMarkers(refs);

  const bounds = new maplibregl.LngLatBounds();
  const width = markerSize?.width || WAYPOINT_MARKER_SIZE.width;
  const height = markerSize?.height || WAYPOINT_MARKER_SIZE.height;

  waypoints.forEach((waypoint) => {
    const lngLat = toLngLat(waypoint.lng, waypoint.lat);
    if (!lngLat) return;
    bounds.extend(lngLat);

    const isActive =
      activeWaypointId && waypoint.waypoint_id === activeWaypointId;
    const el = document.createElement('div');
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.cursor = 'pointer';
    el.style.userSelect = 'none';
    el.style.lineHeight = '0';
    el.style.borderRadius = '50%';
    el.style.boxShadow = isActive
      ? '0 0 0 2px #9b4a2f, 0 2px 6px rgba(31,58,95,0.35)'
      : '0 2px 6px rgba(31,58,95,0.35)';
    el.innerHTML = buildCircleMarkerSvg(captureMethod, {
      width,
      height,
      fillColor: isActive ? WAYPOINT_MARKER_ACTIVE_FILL : undefined,
    });
    el.title = waypoint.waypoint_name || 'Waypoint';
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute(
      'aria-label',
      `View photos for ${waypoint.waypoint_name || 'waypoint'}`
    );
    if (isActive) el.setAttribute('aria-current', 'true');

    const open = (evt) => {
      evt?.stopPropagation?.();
      onWaypointClick(waypoint);
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        open(evt);
      }
    });

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat(lngLat)
      .addTo(map);
    if (markersRef) markersRef.current.push(marker);
  });

  return { bounds };
}
