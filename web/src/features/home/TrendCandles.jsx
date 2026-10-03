/**
 * TrendCandles.jsx — A price's recent days as candles: a body from open to close (green when it
 * closed higher, red when lower) and a wick from the day's low to its high
 *
 * Hovering (or dragging a finger) marks a day and shows its open, high, low and close. Time runs
 * left to right, as on every price chart.
 */

import React, { useMemo, useState } from 'react';

const W = 200;
const H = 64;
const PAD_Y = 3;

const dayFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', day: 'numeric', weekday: 'short' });

function formatValue(v) {
  if (!Number.isFinite(v)) return '-';
  return v >= 100 ? Math.round(v).toLocaleString('fa-IR') : v.toLocaleString('fa-IR', { maximumFractionDigits: 2 });
}

/**
 * @param {{ candles: number[][], days: string[], unit?: string, label: string }} props - candles:
 *   [open, high, low, close] per day, days: YYYY-MM-DD (Tehran)
 */
export default function TrendCandles({ candles, days, unit = '', label }) {
  const [hover, setHover] = useState(null);
  const n = candles.length;

  const geometry = useMemo(() => {
    const min = Math.min(...candles.map((c) => c[2]));
    const max = Math.max(...candles.map((c) => c[1]));
    const span = max - min;
    const slot = W / n;
    const body = Math.max(1, Math.min(slot * 0.62, 10));
    const y = (v) => (span === 0 ? H / 2 : PAD_Y + (1 - (v - min) / span) * (H - 2 * PAD_Y));
    return {
      slot,
      items: candles.map(([open, high, low, close], i) => {
        const cx = slot * (i + 0.5);
        const top = y(Math.max(open, close));
        const bottom = y(Math.min(open, close));
        return {
          cx,
          x: cx - body / 2,
          width: body,
          top,
          height: Math.max(bottom - top, 0.8),
          wickTop: y(high),
          wickBottom: y(low),
          dir: close > open ? 'up' : close < open ? 'down' : 'flat',
        };
      }),
    };
  }, [candles, n]);

  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(0.9999, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.floor(frac * n));
  };

  const at = hover !== null ? geometry.items[hover] : null;
  const c = hover !== null ? candles[hover] : null;
  const dayLabel = (i) => (i === n - 1 ? 'امروز' : dayFormat.format(new Date(`${days[i]}T12:00:00+03:30`)));

  return (
    <div
      className="trend-spark trend-candles"
      dir="ltr"
      role="img"
      aria-label={label}
      onPointerMove={pick}
      onPointerDown={pick}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {at && <rect className="trend-candle-hover" x={at.cx - geometry.slot / 2} y="0" width={geometry.slot} height={H} />}
        {geometry.items.map((it, i) => (
          <g key={days[i] || i} className={`trend-candle is-${it.dir}`}>
            <line x1={it.cx} x2={it.cx} y1={it.wickTop} y2={it.wickBottom} />
            <rect x={it.x} y={it.top} width={it.width} height={it.height} rx={Math.min(1.2, it.width / 2)} />
          </g>
        ))}
      </svg>
      {at && c && (
        <span className={`trend-spark-tip ${at.cx > W / 2 ? 'is-left' : ''}`} style={{ left: `${(at.cx / W) * 100}%` }} dir="rtl">
          <strong>
            {formatValue(c[3])}
            {unit && <small> {unit}</small>}
          </strong>
          <span className="trend-candle-ohlc">
            باز {formatValue(c[0])} · بیشترین {formatValue(c[1])} · کمترین {formatValue(c[2])}
          </span>
          <span className="trend-spark-tip-time">{dayLabel(hover)}</span>
        </span>
      )}
    </div>
  );
}
