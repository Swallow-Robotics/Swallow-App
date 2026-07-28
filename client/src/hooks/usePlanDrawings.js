/**
 * Fetches `site_plan` drawings for a project, for the Plan/Create and
 * Plan/Edit pages. Mirrors the drawing-loading logic used by PhotosPage,
 * with an optional `alignedOnly` filter used while a plan is being
 * created/edited (only aligned drawings can host waypoints).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../services/api';
import { isDrawingAligned } from '../utils/drawingAffineTransform';

const DRAWING_TYPE = 'site_plan';

export function usePlanDrawings(projectId, { alignedOnly = false } = {}) {
  const [drawings, setDrawings] = useState([]);
  const [activeDrawingId, setActiveDrawingId] = useState(null);
  const [activeDrawingDetail, setActiveDrawingDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchDrawings = useCallback(async () => {
    if (!projectId) {
      setDrawings([]);
      setActiveDrawingId(null);
      return;
    }
    setIsLoading(true);
    setError('');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const resp = await apiClient.get(
          `/v1/drawings?project_id=${projectId}&drawing_type=${DRAWING_TYPE}`,
        );
        setDrawings(resp?.drawings || []);
        setIsLoading(false);
        return;
      } catch (err) {
        if (attempt < 2) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) =>
            setTimeout(resolve, 250 * (attempt + 1)),
          );
          // eslint-disable-next-line no-continue
          continue;
        }
        setDrawings([]);
        setError(
          err?.payload?.message || err?.message || 'Unable to load drawings.',
        );
      }
    }
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchDrawings();
  }, [fetchDrawings]);

  const fetchDrawingDetail = useCallback(async (drawingId) => {
    if (!drawingId) {
      setActiveDrawingDetail(null);
      return;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const resp = await apiClient.get(`/v1/drawings/${drawingId}`);
        setActiveDrawingDetail(resp?.drawing || null);
        return;
      } catch {
        if (attempt < 2) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) =>
            setTimeout(resolve, 250 * (attempt + 1)),
          );
        }
      }
    }
    setActiveDrawingDetail(null);
  }, []);

  useEffect(() => {
    fetchDrawingDetail(activeDrawingId);
  }, [activeDrawingId, fetchDrawingDetail]);

  const orderedDrawings = useMemo(
    () =>
      [...drawings].sort(
        (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0),
      ),
    [drawings],
  );

  const filteredDrawings = useMemo(
    () =>
      alignedOnly ? orderedDrawings.filter(isDrawingAligned) : orderedDrawings,
    [orderedDrawings, alignedOnly],
  );

  // Keep the active drawing within the (possibly filtered) list.
  useEffect(() => {
    if (!filteredDrawings.length) {
      setActiveDrawingId((prev) => (prev === null ? prev : null));
      return;
    }
    setActiveDrawingId((prev) =>
      prev && filteredDrawings.some((d) => d.drawing_id === prev)
        ? prev
        : filteredDrawings[0].drawing_id,
    );
  }, [filteredDrawings]);

  const activeDrawing = useMemo(() => {
    if (activeDrawingDetail?.drawing_id === activeDrawingId)
      return activeDrawingDetail;
    return (
      filteredDrawings.find((d) => d.drawing_id === activeDrawingId) || null
    );
  }, [activeDrawingDetail, activeDrawingId, filteredDrawings]);

  const applyDrawingsSaved = useCallback((list) => {
    setDrawings(list);
  }, []);

  const applyAlignmentSaved = useCallback((drawing) => {
    setActiveDrawingDetail(drawing);
    setDrawings((prev) =>
      prev.map((d) => (d.drawing_id === drawing.drawing_id ? drawing : d)),
    );
  }, []);

  return {
    drawings: filteredDrawings,
    allDrawings: orderedDrawings,
    activeDrawingId,
    setActiveDrawingId,
    activeDrawing,
    isLoading,
    error,
    refetch: fetchDrawings,
    applyDrawingsSaved,
    applyAlignmentSaved,
    drawingType: DRAWING_TYPE,
  };
}
