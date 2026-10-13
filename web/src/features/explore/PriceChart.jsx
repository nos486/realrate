/**
 * PriceChart.jsx — The explorer's candle chart: tall, with a price axis and grid, a date axis,
 * 7- and 20-day moving averages (toggles), the period's high and low marked, the last price line,
 * and a crosshair whose tooltip gives the day's open / high / low / close and its change.
 * The period's statistics sit above it (chartMath.js). Volume isn't in the price history, so
 * there is none. Time runs left to right, as on every price chart.
 */

import React, { useMemo, useState } from 'react';
import { formatPrice } from '../market/assetPrice.js';
import { movingAverage, periodStats, niceTicks } from './chartMath.js';

const dayFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', day: 'numeric' });
const dayLongFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });

const AVERAGES = [
  { period: 7, label: 'میانگین ۷ روزه', className: 'is-fast' },
  { period: 20, label: 'میانگین ۲۰ روزه', className: 'is-slow' },
];

const dateOf = (day, long = false) => (long ? dayLongFormat : dayFormat).format(new Date(`${day}T12:00:00+03:30`));

const signedPct = (v) => (v === null || v === undefined ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`);

/**
 * @param {{ candles: number[][], days: string[], currency?: string, unit?: string, label: string }} props
 */
export default function PriceChart({ candles, days, currency = 'toman', unit = '', label }) {
  const [hover, setHover] = useState(null);
  const [shownAverages, setShownAverages] = useState(() => new Set([7, 20]));
  const n = candles.length;
  const fmt = (v) => formatPrice(v, currency);

  const stats = useMemo(() => periodStats(candles), [candles]);
  const averages = useMemo(
    () => AVERAGES.map((a) => ({ ...a, values: movingAverage(candles, a.period) })),
    [candles],
  );

  // The price range with some air; y is in percent of the plot's height, 0 at the top
  const scale = useMemo(() => {
    const pad = (stats.high - stats.low || stats.high * 0.02 || 1) * 0.08;
    const min = stats.low - pad;
    const max = stats.high + pad;
    const y = (v) => ((max - v) / (max - min)) * 100;
    return { y, ticks: niceTicks(min, max, 5) };
  }, [stats]);

  const slot = 100 / n;
  const x = (i) => (i + 0.5) * slot;
  const body = Math.min(slot * 0.62, 1.6);
  const last = candles[n - 1];
  const lastUp = last[3] >= last[0];

  const pick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(0.9999, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.floor(frac * n));
  };

  const toggle = (period) => setShownAverages((prev) => {
    const next = new Set(prev);
    if (next.has(period)) next.delete(period);
    else next.add(period);
    return next;
  });

  const dateTicks = useMemo(() => {
    const count = Math.min(5, n);
    return Array.from({ length: count }, (_, k) => (count === 1 ? 0 : Math.round((k * (n - 1)) / (count - 1))));
  }, [n]);

  const h = hover !== null ? candles[hover] : null;
  const prevClose = hover > 0 ? candles[hover - 1][3] : null;
  const dayChange = h && (prevClose || h[0]) ? ((h[3] - (prevClose || h[0])) / (prevClose || h[0])) * 100 : null;
  const clampLeft = (i) => `${Math.min(92, Math.max(8, x(i)))}%`;

  const cells = [
    { key: 'change', label: 'تغییر دوره', value: signedPct(stats.changePct), tone: stats.changePct > 0 ? 'up-val' : stats.changePct < 0 ? 'down-val' : '' },
    { key: 'high', label: 'بیشترین', value: fmt(stats.high) },
    { key: 'low', label: 'کمترین', value: fmt(stats.low) },
    { key: 'avg', label: 'میانگین', value: fmt(stats.average) },
    { key: 'range', label: 'دامنه‌ی نوسان', value: signedPct(stats.rangePct).replace('+', '') },
  ];

  return (
    <div className="xchart-wrap">
      <div className="pro-metrics xchart-stats">
        {cells.map((c) => (
          <div key={c.key} className="pro-metric">
            <span>{c.label}</span>
            <strong className={c.tone || ''}><bdi>{c.value}</bdi></strong>
          </div>
        ))}
      </div>

      <div className="xchart-tools" role="group" aria-label="ابزارهای تحلیل">
        {averages.map((a) => (
          <button
            key={a.period}
            type="button"
            className={`xchart-tool ${a.className} ${shownAverages.has(a.period) ? 'is-on' : ''}`}
            aria-pressed={shownAverages.has(a.period)}
            disabled={n < a.period}
            title={n < a.period ? 'برای این بازه داده‌ی کافی نیست' : undefined}
            onClick={() => toggle(a.period)}
          >
            <i aria-hidden="true" /> {a.label}
          </button>
        ))}
      </div>

      <div className="xchart" dir="ltr" role="img" aria-label={label}>
        <div
          className="xchart-plot"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setHover(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {scale.ticks.map((t) => <line key={t} className="xchart-grid" x1="0" x2="100" y1={scale.y(t)} y2={scale.y(t)} />)}
            <line className={`xchart-last ${lastUp ? 'is-up' : 'is-down'}`} x1="0" x2="100" y1={scale.y(last[3])} y2={scale.y(last[3])} />
            {candles.map(([o, hi, lo, c], i) => (
              <g key={days[i] || i} className={`trend-candle is-${c > o ? 'up' : c < o ? 'down' : 'flat'}`}>
                <line x1={x(i)} x2={x(i)} y1={scale.y(hi)} y2={scale.y(lo)} />
                <rect x={x(i) - body / 2} y={scale.y(Math.max(o, c))} width={body} height={Math.max(Math.abs(scale.y(o) - scale.y(c)), 0.4)} />
              </g>
            ))}
            {averages.filter((a) => shownAverages.has(a.period) && n >= a.period).map((a) => (
              <polyline
                key={a.period}
                className={`xchart-ma ${a.className}`}
                fill="none"
                points={a.values.map((v, i) => (v === null ? '' : `${x(i)},${scale.y(v)}`)).filter(Boolean).join(' ')}
              />
            ))}
          </svg>

          <span className="xchart-mark is-high" style={{ left: clampLeft(stats.highIndex), top: `${scale.y(stats.high)}%` }}>{fmt(stats.high)}</span>
          <span className="xchart-mark is-low" style={{ left: clampLeft(stats.lowIndex), top: `${scale.y(stats.low)}%` }}>{fmt(stats.low)}</span>

          {h && (
            <>
              <span className="xchart-cross-v" style={{ left: `${x(hover)}%` }} />
              <span className="xchart-cross-h" style={{ top: `${scale.y(h[3])}%` }} />
              <div className={`xchart-tip ${x(hover) > 50 ? 'is-start' : 'is-end'}`} dir="rtl">
                <strong>{dateOf(days[hover], true)}</strong>
                <dl>
                  <div><dt>باز</dt><dd><bdi>{fmt(h[0])}</bdi></dd></div>
                  <div><dt>بیشترین</dt><dd><bdi>{fmt(h[1])}</bdi></dd></div>
                  <div><dt>کمترین</dt><dd><bdi>{fmt(h[2])}</bdi></dd></div>
                  <div><dt>پایانی</dt><dd><bdi>{fmt(h[3])}{unit && ` ${unit}`}</bdi></dd></div>
                  <div><dt>تغییر</dt><dd className={dayChange > 0 ? 'up-val' : dayChange < 0 ? 'down-val' : ''}><bdi>{signedPct(dayChange)}</bdi></dd></div>
                  {averages.filter((a) => shownAverages.has(a.period) && a.values[hover] !== null).map((a) => (
                    <div key={a.period}><dt>{a.label}</dt><dd><bdi>{fmt(a.values[hover])}</bdi></dd></div>
                  ))}
                </dl>
              </div>
            </>
          )}
        </div>

        <div className="xchart-axis-y" aria-hidden="true">
          {scale.ticks.map((t) => <span key={t} style={{ top: `${scale.y(t)}%` }}>{fmt(t)}</span>)}
          <span className={`xchart-axis-last ${lastUp ? 'is-up' : 'is-down'}`} style={{ top: `${scale.y(last[3])}%` }}>{fmt(last[3])}</span>
          {h && <span className="xchart-axis-cross" style={{ top: `${scale.y(h[3])}%` }}>{fmt(h[3])}</span>}
        </div>

        <div className="xchart-axis-x" aria-hidden="true">
          {dateTicks.map((i) => <span key={i} style={{ left: `${x(i)}%` }}>{i === n - 1 ? 'امروز' : dateOf(days[i])}</span>)}
        </div>
      </div>
    </div>
  );
}
