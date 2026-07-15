import React, { useMemo, useRef, useState, useCallback } from 'react';

const VIEW_W = 640;
const VIEW_H = 260;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 48 };

const scale = (value, domainMin, domainMax, rangeMin, rangeMax) => {
  const span = domainMax - domainMin;
  if (!span) return (rangeMin + rangeMax) / 2;
  return rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
};

const niceTicks = (min, max, count = 4) => {
  let lo = min;
  let hi = max;
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const rawStep = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / mag;
  let step;
  if (norm < 1.5) step = mag;
  else if (norm < 3) step = 2 * mag;
  else if (norm < 7) step = 5 * mag;
  else step = 10 * mag;

  const niceMin = Math.floor(lo / step) * step;
  const niceMax = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
};

const formatXTick = (ms, range) => {
  const date = new Date(ms);
  if (range === '7d') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const formatTooltipTime = (ms, range) => {
  const date = new Date(ms);
  if (range === '7d') {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return date.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: range === '1h' ? '2-digit' : undefined,
  });
};

/**
 * Single-series time chart. No legend (one series names itself via the
 * container's title) — see dataviz skill: marks-and-anatomy.md.
 */
const WeatherLineChart = ({ points, range, unit, valueFormatter }) => {
  const containerRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  const valid = useMemo(
    () => points.filter(p => p.v != null && !Number.isNaN(p.v)),
    [points]
  );

  const { xMin, xMax, yTicks, yMin, yMax } = useMemo(() => {
    if (valid.length === 0) {
      return { xMin: 0, xMax: 1, yTicks: [0, 1], yMin: 0, yMax: 1 };
    }
    const xs = valid.map(p => p.t);
    const ys = valid.map(p => p.v);
    const rawYMin = Math.min(...ys);
    const rawYMax = Math.max(...ys);
    const pad = (rawYMax - rawYMin) * 0.1 || Math.abs(rawYMax) * 0.1 || 1;
    const ticks = niceTicks(rawYMin - pad, rawYMax + pad, 4);
    return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yTicks: ticks,
      yMin: ticks[0],
      yMax: ticks[ticks.length - 1],
    };
  }, [valid]);

  const plotLeft = MARGIN.left;
  const plotRight = VIEW_W - MARGIN.right;
  const plotTop = MARGIN.top;
  const plotBottom = VIEW_H - MARGIN.bottom;

  const xPx = t => scale(t, xMin, xMax, plotLeft, plotRight);
  const yPx = v => scale(v, yMin, yMax, plotBottom, plotTop);

  // Break the line at gaps so missing readings never get bridged by an
  // invented interpolation.
  const segments = useMemo(() => {
    const segs = [];
    let current = [];
    points.forEach(p => {
      if (p.v == null || Number.isNaN(p.v)) {
        if (current.length) segs.push(current);
        current = [];
      } else {
        current.push(p);
      }
    });
    if (current.length) segs.push(current);
    return segs;
  }, [points]);

  const lastPoint = valid[valid.length - 1] || null;

  const xTickValues = useMemo(() => {
    if (valid.length === 0) return [];
    const count = 5;
    const ticks = [];
    for (let i = 0; i < count; i += 1) {
      ticks.push(xMin + ((xMax - xMin) * i) / (count - 1));
    }
    return ticks;
  }, [valid.length, xMin, xMax]);

  const findNearestIndex = useCallback(
    clientX => {
      if (!containerRef.current || valid.length === 0) return null;
      const rect = containerRef.current.getBoundingClientRect();
      const relX = ((clientX - rect.left) / rect.width) * VIEW_W;
      const targetT = scale(relX, plotLeft, plotRight, xMin, xMax);
      let nearest = 0;
      let nearestDist = Infinity;
      valid.forEach((p, i) => {
        const dist = Math.abs(p.t - targetT);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = i;
        }
      });
      return nearest;
    },
    [valid, xMin, xMax, plotLeft, plotRight]
  );

  const handlePointerMove = e => {
    const idx = findNearestIndex(e.clientX);
    if (idx != null) setHoverIndex(idx);
  };

  const handlePointerLeave = () => setHoverIndex(null);

  const handleKeyDown = e => {
    if (valid.length === 0) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHoverIndex(i => Math.max(0, (i ?? valid.length - 1) - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHoverIndex(i => Math.min(valid.length - 1, (i ?? valid.length - 1) + 1));
    } else if (e.key === 'Escape') {
      setHoverIndex(null);
    }
  };

  const hovered = hoverIndex != null ? valid[hoverIndex] : null;
  const format = valueFormatter || (v => `${v}${unit ? ` ${unit}` : ''}`);

  if (valid.length === 0) {
    return (
      <div
        style={{
          height: 260,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-secondary)',
        }}
      >
        No data in this range.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Weather value over time chart"
        tabIndex={0}
        onFocus={() => setHoverIndex(valid.length - 1)}
        onBlur={() => setHoverIndex(null)}
        onKeyDown={handleKeyDown}
      >
        {/* gridlines + y ticks */}
        {yTicks.map(tick => (
          <g key={tick}>
            <line
              x1={plotLeft}
              x2={plotRight}
              y1={yPx(tick)}
              y2={yPx(tick)}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text
              x={plotLeft - 8}
              y={yPx(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill="var(--color-text-secondary)"
            >
              {tick.toLocaleString()}
            </text>
          </g>
        ))}

        {/* x ticks */}
        {xTickValues.map(t => (
          <text
            key={t}
            x={xPx(t)}
            y={VIEW_H - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-text-secondary)"
          >
            {formatXTick(t, range)}
          </text>
        ))}

        {/* line segments */}
        {segments.map((seg, segIdx) => (
          <path
            key={segIdx}
            d={seg
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPx(p.t)} ${yPx(p.v)}`)
              .join(' ')}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* end marker + direct label */}
        {lastPoint && (
          <>
            <circle
              cx={xPx(lastPoint.t)}
              cy={yPx(lastPoint.v)}
              r={4}
              fill="var(--color-primary)"
              stroke="var(--color-surface-primary)"
              strokeWidth={2}
            />
            <text
              x={Math.min(xPx(lastPoint.t) + 8, plotRight - 4)}
              y={yPx(lastPoint.v) - 8}
              textAnchor={xPx(lastPoint.t) + 60 > plotRight ? 'end' : 'start'}
              fontSize={11}
              fontWeight={600}
              fill="var(--color-text-primary)"
            >
              {format(lastPoint.v)}
            </text>
          </>
        )}

        {/* crosshair */}
        {hovered && (
          <>
            <line
              x1={xPx(hovered.t)}
              x2={xPx(hovered.t)}
              y1={plotTop}
              y2={plotBottom}
              stroke="var(--color-text-secondary)"
              strokeWidth={1}
            />
            <circle
              cx={xPx(hovered.t)}
              cy={yPx(hovered.v)}
              r={4}
              fill="var(--color-primary)"
              stroke="var(--color-surface-primary)"
              strokeWidth={2}
            />
          </>
        )}
      </svg>

      {hovered && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 4,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            className="surface-card"
            style={{
              padding: 'var(--space-xs) var(--space-sm)',
              boxShadow: 'var(--shadow-md)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-base)' }}>
              {format(hovered.v)}
            </span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              {formatTooltipTime(hovered.t, range)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherLineChart;
