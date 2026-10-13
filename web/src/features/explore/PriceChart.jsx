/**
 * PriceChart.jsx — The explorer's candle chart, drawn by TradingView's open-source Lightweight
 * Charts (Apache-2.0; its attribution logo stays on): a tall chart with a price scale and grid,
 * a time scale, wheel / pinch zoom and drag to pan, a crosshair, 7- and 20-day moving averages
 * (toggles) and the period's high and low marked. The price history is ours (the Iranian market's
 * daily candles), so the chart is fed from it; the period's statistics sit above and the
 * crosshair's day (open / high / low / close, change) in a card over the chart. Volume isn't in
 * the price history, so there is none. Colors are read from the design tokens (styles/tokens.css).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, createSeriesMarkers, CandlestickSeries, LineSeries, CrosshairMode } from 'lightweight-charts';
import { formatPrice } from '../market/assetPrice.js';
import { movingAverage, periodStats } from './chartMath.js';

const dayFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', day: 'numeric' });
const dayLongFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });

const AVERAGES = [
  { period: 7, label: 'میانگین ۷ روزه', className: 'is-fast', token: '--color-warning-text' },
  { period: 20, label: 'میانگین ۲۰ روزه', className: 'is-slow', token: '--color-primary-text' },
];

const pad = (v) => String(v).padStart(2, '0');

/** A chart time (the day string we gave, or its business-day object) back to «YYYY-MM-DD» */
const dayKey = (time) => (typeof time === 'string' ? time : time && time.year ? `${time.year}-${pad(time.month)}-${pad(time.day)}` : '');

const dateOf = (day, long = false) => (long ? dayLongFormat : dayFormat).format(new Date(`${day}T12:00:00+03:30`));

const signedPct = (v) => (v === null || v === undefined ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`);

/**
 * @param {{ candles: number[][], days: string[], currency?: string, unit?: string, label: string }} props
 *   candles: [open, high, low, close] per day, days: YYYY-MM-DD (Tehran), oldest first
 */
export default function PriceChart({ candles, days, currency = 'toman', unit = '', label }) {
  const holder = useRef(null);
  const averageSeries = useRef({});
  const [hover, setHover] = useState(null); // { index, x }
  const [shownAverages, setShownAverages] = useState(() => new Set([7, 20]));
  const n = candles.length;
  const fmt = (v) => formatPrice(v, currency);

  const stats = useMemo(() => periodStats(candles), [candles]);
  const averages = useMemo(
    () => AVERAGES.map((a) => ({ ...a, values: movingAverage(candles, a.period) })),
    [candles],
  );
  const indexByDay = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);

  // The chart: built for this asset's candles and torn down with them
  useEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const css = getComputedStyle(document.documentElement);
    const token = (name) => css.getPropertyValue(name).trim();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: token('--text-muted'), fontFamily: 'inherit', fontSize: 11 },
      grid: { vertLines: { color: token('--border-color') }, horzLines: { color: token('--border-color') } },
      rightPriceScale: { borderColor: token('--border-color'), scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: {
        borderColor: token('--border-color'),
        rightOffset: 2,
        tickMarkFormatter: (time) => dateOf(dayKey(time)),
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        locale: 'fa-IR',
        priceFormatter: fmt,
        timeFormatter: (time) => dateOf(dayKey(time), true),
      },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: token('--color-positive'),
      downColor: token('--color-negative'),
      borderUpColor: token('--color-positive'),
      borderDownColor: token('--color-negative'),
      wickUpColor: token('--color-positive'),
      wickDownColor: token('--color-negative'),
    });
    candleSeries.setData(candles.map(([open, high, low, close], i) => ({ time: days[i], open, high, low, close })));

    averageSeries.current = {};
    for (const a of averages) {
      const line = chart.addSeries(LineSeries, {
        color: token(a.token),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        visible: n >= a.period,
      });
      line.setData(a.values.map((v, i) => (v === null ? null : { time: days[i], value: v })).filter(Boolean));
      averageSeries.current[a.period] = line;
    }

    if (stats) {
      createSeriesMarkers(candleSeries, [
        { time: days[stats.highIndex], position: 'aboveBar', shape: 'arrowDown', color: token('--text-secondary'), text: fmt(stats.high) },
        { time: days[stats.lowIndex], position: 'belowBar', shape: 'arrowUp', color: token('--text-secondary'), text: fmt(stats.low) },
      ].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0)));
    }
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      const index = param.time ? indexByDay.get(dayKey(param.time)) : undefined;
      setHover(index === undefined || !param.point ? null : { index, x: param.point.x / el.clientWidth });
    });
    return () => {
      averageSeries.current = {};
      chart.remove();
    };
    // fmt follows currency; the rest follows the data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, days, currency]);

  // The toggles show and hide the lines without rebuilding the chart
  useEffect(() => {
    for (const a of AVERAGES) averageSeries.current[a.period]?.applyOptions({ visible: shownAverages.has(a.period) && n >= a.period });
  }, [shownAverages, n, candles, days, currency]);

  const toggle = (period) => setShownAverages((prev) => {
    const next = new Set(prev);
    if (next.has(period)) next.delete(period);
    else next.add(period);
    return next;
  });

  const h = hover ? candles[hover.index] : null;
  const prevClose = hover && hover.index > 0 ? candles[hover.index - 1][3] : null;
  const dayChange = h && (prevClose || h[0]) ? ((h[3] - (prevClose || h[0])) / (prevClose || h[0])) * 100 : null;

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
        <span className="xchart-hint">با چرخ موس یا دو انگشت بزرگ‌نمایی کنید و بکشید</span>
      </div>

      <div className="xchart" dir="ltr" role="img" aria-label={label}>
        <div className="xchart-canvas" ref={holder} />
        {h && (
          <div className={`xchart-tip ${hover.x > 0.5 ? 'is-start' : 'is-end'}`} dir="rtl">
            <strong>{dateOf(days[hover.index], true)}</strong>
            <dl>
              <div><dt>باز</dt><dd><bdi>{fmt(h[0])}</bdi></dd></div>
              <div><dt>بیشترین</dt><dd><bdi>{fmt(h[1])}</bdi></dd></div>
              <div><dt>کمترین</dt><dd><bdi>{fmt(h[2])}</bdi></dd></div>
              <div><dt>پایانی</dt><dd><bdi>{fmt(h[3])}{unit && ` ${unit}`}</bdi></dd></div>
              <div><dt>تغییر</dt><dd className={dayChange > 0 ? 'up-val' : dayChange < 0 ? 'down-val' : ''}><bdi>{signedPct(dayChange)}</bdi></dd></div>
              {averages.filter((a) => shownAverages.has(a.period) && a.values[hover.index] !== null).map((a) => (
                <div key={a.period}><dt>{a.label}</dt><dd><bdi>{fmt(a.values[hover.index])}</bdi></dd></div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
