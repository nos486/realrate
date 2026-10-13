/**
 * PriceChart.jsx — The explorer's candle chart, drawn by TradingView's open-source Lightweight
 * Charts (Apache-2.0; its notice and link sit under the chart, ATTRIBUTION below): a tall chart
 * with a price scale and grid, a time scale, wheel / pinch zoom and drag to pan, a crosshair,
 * 7- and 20-day moving averages (toggles) and the visible period's high and low marked. The price
 * history is ours (the Iranian market's daily candles), so the chart is fed from it. The
 * statistics above follow what is on screen; the crosshair's day (open / high / low / close,
 * change) shows in a card over the chart. Scrolling or zooming past the oldest loaded day calls
 * `onNeedOlder` (the page loads a longer history; the chart keeps its view). Volume isn't in the
 * price history, so there is none. Colors are read from the design tokens (styles/tokens.css).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, createSeriesMarkers, CandlestickSeries, LineSeries, CrosshairMode } from 'lightweight-charts';
import { formatPrice } from '../market/assetPrice.js';
import { movingAverage, periodStats } from './chartMath.js';

const dayFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short', day: 'numeric' });
const dayLongFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });

/** Axis, crosshair and marker text size on the canvas: phones a step smaller to leave room for candles */
const AXIS_FONT_PX = { wide: 13, phone: 12 };

const AVERAGES = [
  { period: 7, label: 'میانگین ۷ روزه', short: 'MA ۷', className: 'is-fast', token: '--color-warning-text' },
  { period: 20, label: 'میانگین ۲۰ روزه', short: 'MA ۲۰', className: 'is-slow', token: '--color-primary-text' },
];

const pad = (v) => String(v).padStart(2, '0');

/** A chart time (the day string we gave, or its business-day object) back to «YYYY-MM-DD» */
const dayKey = (time) => (typeof time === 'string' ? time : time && time.year ? `${time.year}-${pad(time.month)}-${pad(time.day)}` : '');

const dateOf = (day, long = false) => (long ? dayLongFormat : dayFormat).format(new Date(`${day}T12:00:00+03:30`));

const signedPct = (v) => (v === null || v === undefined ? '—' : `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`);

/**
 * @param {{ candles: number[][], days: string[], currency?: string, unit?: string, label: string,
 *   onNeedOlder?: Function|null, header?: React.ReactNode }} props - header: the title line above
 *   the chart (the asset and its price), beside the average toggles
 *   candles: [open, high, low, close] per day, days: YYYY-MM-DD (Tehran), oldest first
 */
export default function PriceChart({ candles, days, currency = 'toman', unit = '', label, onNeedOlder = null, header = null }) {
  const holder = useRef(null);
  const chartRef = useRef(null); // { chart, candleSeries, markers, averages: { [period]: series } }
  const needOlder = useRef(onNeedOlder);
  needOlder.current = onNeedOlder;
  const fitted = useRef(false);
  const [hover, setHover] = useState(null); // { index, x }
  const [visible, setVisible] = useState(null); // the logical range on screen
  const [shownAverages, setShownAverages] = useState(() => new Set([7, 20]));
  const n = candles.length;
  const fmt = (v) => formatPrice(v, currency);

  // What is on screen (all of it until the chart reports its view)
  const shown = useMemo(() => {
    if (!visible) return { from: 0, to: n - 1 };
    const from = Math.max(0, Math.ceil(visible.from));
    const to = Math.min(n - 1, Math.floor(visible.to));
    return to >= from ? { from, to } : { from: 0, to: n - 1 };
  }, [visible, n]);
  const stats = useMemo(() => {
    const s = periodStats(candles.slice(shown.from, shown.to + 1));
    return s && { ...s, highIndex: s.highIndex + shown.from, lowIndex: s.lowIndex + shown.from };
  }, [candles, shown]);
  const averages = useMemo(
    () => AVERAGES.map((a) => ({ ...a, values: movingAverage(candles, a.period) })),
    [candles],
  );
  const indexByDay = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);
  const indexByDayRef = useRef(indexByDay);
  indexByDayRef.current = indexByDay;
  const currencyRef = useRef(currency);
  currencyRef.current = currency;

  // The chart itself: built once per asset (the page keys it by asset) and torn down with it
  useEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const css = getComputedStyle(document.documentElement);
    const token = (name) => css.getPropertyValue(name).trim();
    // The canvas does not inherit CSS fonts: hand it the page's own font, large enough to read
    const fontFamily = getComputedStyle(el).fontFamily;
    const fontSize = window.matchMedia?.('(max-width: 640px)').matches ? AXIS_FONT_PX.phone : AXIS_FONT_PX.wide;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: token('--text-secondary'), fontFamily, fontSize, attributionLogo: false },
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
        priceFormatter: (v) => formatPrice(v, currencyRef.current),
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
    const averageLines = {};
    for (const a of AVERAGES) {
      averageLines[a.period] = chart.addSeries(LineSeries, {
        color: token(a.token),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
    }
    chartRef.current = { chart, candleSeries, markers: createSeriesMarkers(candleSeries, []), averages: averageLines, markerColor: token('--text-secondary') };
    fitted.current = false;

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      setVisible(range ? { from: range.from, to: range.to } : null);
      // Scrolled or zoomed out past the oldest day: ask for more history
      if (range && range.from < -3) needOlder.current?.();
    });
    chart.subscribeCrosshairMove((param) => {
      const index = param.time ? indexByDayRef.current.get(dayKey(param.time)) : undefined;
      setHover(index === undefined || !param.point ? null : { index, x: param.point.x / el.clientWidth });
    });
    return () => {
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  // The data: set again when a longer history arrives (the view stays where it is)
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    c.candleSeries.setData(candles.map(([open, high, low, close], i) => ({ time: days[i], open, high, low, close })));
    for (const a of averages) {
      c.averages[a.period].setData(a.values.map((v, i) => (v === null ? null : { time: days[i], value: v })).filter(Boolean));
    }
    if (!fitted.current) {
      c.chart.timeScale().fitContent();
      fitted.current = true;
    }
  }, [candles, days, averages]);

  // The high and low of what is on screen
  useEffect(() => {
    const c = chartRef.current;
    if (!c || !stats) return;
    c.markers.setMarkers([
      { time: days[stats.highIndex], position: 'aboveBar', shape: 'arrowDown', color: c.markerColor, text: formatPrice(stats.high, currency) },
      { time: days[stats.lowIndex], position: 'belowBar', shape: 'arrowUp', color: c.markerColor, text: formatPrice(stats.low, currency) },
    ].sort((x, y) => (x.time < y.time ? -1 : x.time > y.time ? 1 : 0)));
  }, [stats, days, currency]);

  // The toggles show and hide the lines without touching the data
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    for (const a of AVERAGES) c.averages[a.period].applyOptions({ visible: shownAverages.has(a.period) && n >= a.period });
  }, [shownAverages, n]);

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
      <div className="xchart-bar">
        {header}
        <div className="xchart-tools" role="group" aria-label="میانگین متحرک">
          {averages.map((a) => (
            <button
              key={a.period}
              type="button"
              className={`xchart-tool ${a.className} ${shownAverages.has(a.period) ? 'is-on' : ''}`}
              aria-pressed={shownAverages.has(a.period)}
              aria-label={a.label}
              disabled={n < a.period}
              title={n < a.period ? 'برای این بازه داده‌ی کافی نیست' : a.label}
              onClick={() => toggle(a.period)}
            >
              <i aria-hidden="true" /> {a.short}
            </button>
          ))}
        </div>
      </div>

      <div className="xchart-stats">
        {cells.map((c) => (
          <div key={c.key} className="xchart-stat">
            <span>{c.label}</span>
            <strong className={c.tone || ''}><bdi>{c.value}</bdi></strong>
          </div>
        ))}
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
      {/* The library's licence asks for its notice and a link to TradingView where users see it */}
      <p className="xchart-credit" dir="ltr">
        Lightweight Charts™ · Copyright © 2025 TradingView, Inc. · <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">tradingview.com</a>
      </p>
    </div>
  );
}
