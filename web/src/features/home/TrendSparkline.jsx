/**
 * TrendSparkline.jsx — A price's recent path, drawn as a thin line with its current value marked
 *
 * The line is in a quiet ink; only the end point takes the direction color (up / down), so the
 * card reads "where it is now" first. Hovering (or dragging a finger) shows a crosshair with the
 * value and time of that point. Time runs left to right, as on every price chart.
 */

import React, { useMemo, useState } from 'react';

const W = 200;
const H = 48;
const PAD_Y = 4;

const timeFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatValue(v) {
  if (!Number.isFinite(v)) return '-';
  return v >= 100 ? Math.round(v).toLocaleString('fa-IR') : v.toLocaleString('fa-IR', { maximumFractionDigits: 2 });
}

/**
 * @param {{ points: number[], since: string, bucketSec: number, unit?: string, direction: 'up'|'down'|'flat', label: string }} props
 */
export default function TrendSparkline({ points, since, bucketSec, unit = '', direction, label }) {
  const [hover, setHover] = useState(null);

  const geometry = useMemo(() => {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min;
    const n = points.length;
    const x = (i) => (n === 1 ? W : (i / (n - 1)) * W);
    // A flat series sits in the middle instead of on the floor
    const y = (v) => (span === 0 ? H / 2 : PAD_Y + (1 - (v - min) / span) * (H - 2 * PAD_Y));
    const coords = points.map((v, i) => [x(i), y(v)]);
    return { coords, path: coords.map(([cx, cy]) => `${cx.toFixed(2)},${cy.toFixed(2)}`).join(' ') };
  }, [points]);

  const n = points.length;
  const startMs = Date.parse(since);
  const timeOf = (i) => (i === n - 1 ? 'اکنون' : timeFormat.format(new Date(startMs + i * bucketSec * 1000)));

  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (n - 1)));
  };

  const end = geometry.coords[n - 1];
  const at = hover !== null ? geometry.coords[hover] : null;
  const pct = (cx) => `${(cx / W) * 100}%`;
  const top = (cy) => `${(cy / H) * 100}%`;

  return (
    <div
      className="trend-spark"
      dir="ltr"
      role="img"
      aria-label={label}
      onPointerMove={pick}
      onPointerDown={pick}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <polyline className="trend-spark-line" points={geometry.path} />
        {at && <line className="trend-spark-cross" x1={at[0]} x2={at[0]} y1="0" y2={H} />}
      </svg>
      {/* Round marks live outside the stretched SVG so they stay round */}
      <span className={`trend-spark-dot is-${direction}`} style={{ left: pct(end[0]), top: top(end[1]) }} />
      {at && (
        <>
          <span className="trend-spark-dot is-hover" style={{ left: pct(at[0]), top: top(at[1]) }} />
          <span
            className={`trend-spark-tip ${at[0] > W / 2 ? 'is-left' : ''}`}
            style={{ left: pct(at[0]) }}
            dir="rtl"
          >
            <strong>{formatValue(points[hover])}</strong>
            {unit && <small> {unit}</small>}
            <span className="trend-spark-tip-time">{timeOf(hover)}</span>
          </span>
        </>
      )}
    </div>
  );
}
