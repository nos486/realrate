import React, { useState, useMemo, useRef, useId } from 'react';

/**
 * Generate smooth SVG cubic Bézier path points
 */
function createBezierPath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const prev = points[i - 1] || curr;
    const nextNext = points[i + 2] || next;

    const cp1x = curr.x + (next.x - prev.x) * 0.16;
    const cp1y = curr.y + (next.y - prev.y) * 0.16;
    const cp2x = next.x - (nextNext.x - curr.x) * 0.16;
    const cp2y = next.y - (nextNext.y - curr.y) * 0.16;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }
  return d;
}

function formatToman(num) {
  if (num === null || num === undefined || isNaN(num)) return '-';
  return Math.round(num).toLocaleString('fa-IR');
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function MiniSparkline({
  data = [],
  currentPrice = null,
  height = 38,
  className = '',
}) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const containerRef = useRef(null);
  const gradId = useId();

  // Prepare & sort data points
  const pointsData = useMemo(() => {
    const list = Array.isArray(data)
      ? data
          .filter(d => d && typeof d.price === 'number' && d.price > 0)
          .map(d => ({ price: Number(d.price), timestamp: d.timestamp }))
      : [];

    // If currentPrice is valid and either no points or different from latest point
    if (typeof currentPrice === 'number' && currentPrice > 0) {
      if (list.length === 0) {
        list.push({ price: currentPrice, timestamp: new Date().toISOString() });
      } else {
        const last = list[list.length - 1];
        const lastTime = last.timestamp ? new Date(last.timestamp).getTime() : 0;
        if (Date.now() - lastTime > 300000 || Math.abs(last.price - currentPrice) > 10) {
          list.push({ price: currentPrice, timestamp: new Date().toISOString() });
        }
      }
    }

    return list;
  }, [data, currentPrice]);

  // Width virtual viewBox
  const viewBoxWidth = 220;
  const topPadding = 5;
  const bottomPadding = 5;
  const drawHeight = height - topPadding - bottomPadding;

  const { coords, minPrice, maxPrice, delta, isUp, strokeColor, areaPath, linePath } = useMemo(() => {
    if (pointsData.length < 2) {
      return {
        coords: [],
        minPrice: 0,
        maxPrice: 0,
        delta: 0,
        isUp: true,
        strokeColor: '#38bdf8',
        areaPath: '',
        linePath: '',
      };
    }

    let min = Infinity;
    let max = -Infinity;
    for (const p of pointsData) {
      if (p.price < min) min = p.price;
      if (p.price > max) max = p.price;
    }

    const range = max - min;
    const effectiveRange = range === 0 ? max * 0.01 || 1 : range;

    const count = pointsData.length;
    const computedCoords = pointsData.map((p, idx) => {
      const x = (idx / (count - 1)) * viewBoxWidth;
      const normalizedY = (p.price - min) / effectiveRange;
      const y = topPadding + drawHeight * (1 - normalizedY);
      return { x, y, price: p.price, timestamp: p.timestamp };
    });

    const lPath = createBezierPath(computedCoords);
    const lastCoord = computedCoords[computedCoords.length - 1];
    const firstCoord = computedCoords[0];
    const aPath = `${lPath} L ${lastCoord.x} ${height} L ${firstCoord.x} ${height} Z`;

    const change = lastCoord.price - firstCoord.price;
    const up = change >= 0;
    const color = change > 0 ? '#10b981' : change < 0 ? '#f43f5e' : '#38bdf8';

    return {
      coords: computedCoords,
      minPrice: min,
      maxPrice: max,
      delta: change,
      isUp: up,
      strokeColor: color,
      areaPath: aPath,
      linePath: lPath,
    };
  }, [pointsData, height, drawHeight]);

  // Handle hover / touch interaction
  const handleMouseMove = (e) => {
    if (!containerRef.current || coords.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const xPct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const closestIdx = Math.round(xPct * (coords.length - 1));
    setHoverIndex(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  // If we have fewer than 2 points, render an elegant flat baseline placeholder
  if (pointsData.length < 2) {
    return (
      <div className={`mini-sparkline-wrap ${className}`} style={{ height: `${height}px` }}>
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${height}`}
          preserveAspectRatio="none"
          className="mini-sparkline-svg"
        >
          <line
            x1="0"
            y1={height / 2}
            x2={viewBoxWidth}
            y2={height / 2}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeDasharray="3 3"
            strokeWidth="1.2"
          />
        </svg>
        <span className="mini-sparkline-empty-label">۲۴ ساعت بدون نوسان</span>
      </div>
    );
  }

  const activeCoord = hoverIndex !== null && coords[hoverIndex] ? coords[hoverIndex] : null;
  const lastCoord = coords[coords.length - 1];

  return (
    <div
      ref={containerRef}
      className={`mini-sparkline-wrap ${className}`}
      style={{ height: `${height}px` }}
      onMouseMove={handleMouseMove}
      onTouchMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchEnd={handleMouseLeave}
    >
      <svg
        viewBox={`0 0 ${viewBoxWidth} ${height}`}
        preserveAspectRatio="none"
        className="mini-sparkline-svg"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Gradient fill */}
        <path d={areaPath} fill={`url(#${gradId})`} />

        {/* Smooth line */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Static pulse dot at latest price point (when not hovering) */}
        {lastCoord && !activeCoord && (
          <circle
            cx={lastCoord.x}
            cy={lastCoord.y}
            r="2.8"
            fill={strokeColor}
            className="sparkline-latest-dot"
          />
        )}

        {/* Interactive hover point */}
        {activeCoord && (
          <g>
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="4.5"
              fill={strokeColor}
              stroke="#0f172a"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Hover Tooltip Popup */}
      {activeCoord && (
        <div
          className="mini-sparkline-tooltip"
          style={{
            left: `${(activeCoord.x / viewBoxWidth) * 100}%`,
          }}
        >
          <span className="tooltip-price">{formatToman(activeCoord.price)} تومان</span>
          {activeCoord.timestamp && (
            <span className="tooltip-time">{formatTime(activeCoord.timestamp)}</span>
          )}
        </div>
      )}
    </div>
  );
}
