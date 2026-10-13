// @vitest-environment happy-dom
/**
 * explorePriceChart.test.jsx — The explorer's chart maths (moving average, period stats) and the
 * chart itself: what it is fed, the average toggles and the crosshair card
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { movingAverage, periodStats } from '../../../web/src/features/explore/chartMath.js';
import PriceChart from '../../../web/src/features/explore/PriceChart.jsx';


// Lightweight Charts draws on a canvas, which the test DOM has none of: a recording stand-in
const { crosshair, chartCalls } = vi.hoisted(() => ({ crosshair: { handler: null, range: null }, chartCalls: { series: [], markers: [], removed: 0 } }));
vi.mock('lightweight-charts', () => ({
  CrosshairMode: { Normal: 0 },
  CandlestickSeries: 'candles',
  LineSeries: 'line',
  createSeriesMarkers: () => ({ setMarkers: (markers) => chartCalls.markers.push(markers) }),
  createChart: () => ({
    addSeries: (type) => {
      const series = { type, data: null, options: {}, setData(d) { series.data = d; }, applyOptions(o) { Object.assign(series.options, o); } };
      chartCalls.series.push(series);
      return series;
    },
    timeScale: () => ({ fitContent() {}, subscribeVisibleLogicalRangeChange: (fn) => { crosshair.range = fn; } }),
    subscribeCrosshairMove: (fn) => { crosshair.handler = fn; },
    remove: () => { chartCalls.removed += 1; },
  }),
}));

beforeEach(() => { chartCalls.series.length = 0; chartCalls.markers.length = 0; chartCalls.removed = 0; });
afterEach(cleanup);

// [open, high, low, close]
const candles = Array.from({ length: 30 }, (_, i) => [100 + i, 105 + i, 98 + i, 102 + i]);
const days = candles.map((_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);

describe('chartMath', () => {
  it('moving average: null until the window is full, then the mean of the last closes', () => {
    const ma = movingAverage([[0, 0, 0, 1], [0, 0, 0, 2], [0, 0, 0, 3], [0, 0, 0, 6]], 3);
    expect(ma).toEqual([null, null, 2, 11 / 3]);
  });

  it('period stats: change from the first open to the last close, high and low with their days', () => {
    const s = periodStats([[100, 110, 95, 105], [105, 120, 100, 120], [120, 121, 90, 110]]);
    expect(s.changePct).toBeCloseTo(10);
    expect(s).toMatchObject({ high: 121, highIndex: 2, low: 90, lowIndex: 2 });
    expect(s.average).toBeCloseTo((105 + 120 + 110) / 3);
    expect(periodStats([])).toBeNull();
  });
});

describe('PriceChart', () => {
  it('shows the period statistics and both average toggles', () => {
    render(<PriceChart candles={candles} days={days} label="x" />);
    expect(screen.getByText('تغییر دوره')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'میانگین ۷ روزه' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'میانگین ۷ روزه' }));
    expect(screen.getByRole('button', { name: 'میانگین ۷ روزه' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('an average longer than the data is disabled', () => {
    render(<PriceChart candles={candles.slice(0, 10)} days={days.slice(0, 10)} label="x" />);
    expect(screen.getByRole('button', { name: 'میانگین ۲۰ روزه' }).disabled).toBe(true);
  });

  it('feeds the chart our candles, the averages and the high and low marks', () => {
    render(<PriceChart candles={candles} days={days} label="x" />);
    const [candleSeries, fast, slow] = chartCalls.series;
    expect(candleSeries.data).toHaveLength(30);
    expect(candleSeries.data[0]).toEqual({ time: '2026-09-01', open: 100, high: 105, low: 98, close: 102 });
    expect(fast.data).toHaveLength(24); // 7-day average: from the 7th close
    expect(slow.data).toHaveLength(11);
    expect(chartCalls.markers.at(-1).map((m) => m.position).sort()).toEqual(['aboveBar', 'belowBar']);
  });

  it('the toggle hides an average line on the chart', () => {
    render(<PriceChart candles={candles} days={days} label="x" />);
    fireEvent.click(screen.getByRole('button', { name: 'میانگین ۷ روزه' }));
    expect(chartCalls.series[1].options.visible).toBe(false);
    expect(chartCalls.series[2].options.visible).toBe(true);
  });

  it('the crosshair day shows its open, high, low and close; leaving hides it', () => {
    const { container } = render(<PriceChart candles={candles} days={days} label="x" />);
    act(() => crosshair.handler({ time: '2026-09-30', point: { x: 10 } }));
    const tip = container.querySelector('.xchart-tip');
    expect(tip.textContent).toContain('پایانی');
    expect(tip.textContent).toContain((131).toLocaleString('fa-IR'));
    act(() => crosshair.handler({ time: undefined }));
    expect(container.querySelector('.xchart-tip')).toBeNull();
  });

  it('scrolled past the oldest day, it asks for an older history; not before', () => {
    const onNeedOlder = vi.fn();
    render(<PriceChart candles={candles} days={days} label="x" onNeedOlder={onNeedOlder} />);
    act(() => crosshair.range({ from: 0, to: 29 }));
    expect(onNeedOlder).not.toHaveBeenCalled();
    act(() => crosshair.range({ from: -5, to: 25 }));
    expect(onNeedOlder).toHaveBeenCalled();
  });

  it('the statistics follow the days on screen', () => {
    render(<PriceChart candles={candles} days={days} label="x" />);
    const high = () => screen.getByText('بیشترین').parentElement.textContent;
    expect(high()).toContain((134).toLocaleString('fa-IR')); // the last day's high: 105 + 29
    act(() => crosshair.range({ from: 0, to: 9 }));
    expect(high()).toContain((114).toLocaleString('fa-IR')); // 105 + 9
  });

  it('removes the chart when it goes away', () => {
    const { unmount } = render(<PriceChart candles={candles} days={days} label="x" />);
    unmount();
    expect(chartCalls.removed).toBe(1);
  });
});
