// @vitest-environment happy-dom
/**
 * explorePriceChart.test.jsx — The explorer's chart maths (moving average, period stats, axis
 * ticks) and the chart itself: period statistics, average toggles and the crosshair tooltip
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { movingAverage, periodStats, niceTicks } from '../../../web/src/features/explore/chartMath.js';
import PriceChart from '../../../web/src/features/explore/PriceChart.jsx';

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

  it('axis ticks are round and inside the range', () => {
    const ticks = niceTicks(97, 233, 5);
    expect(ticks).toEqual([100, 150, 200]);
    expect(niceTicks(5, 5)).toEqual([5]);
  });
});

describe('PriceChart', () => {
  it('shows the period statistics and both average toggles', () => {
    render(<PriceChart candles={candles} days={days} label="x" />);
    expect(screen.getByText('تغییر دوره')).toBeTruthy();
    expect(screen.getByText('میانگین ۷ روزه').closest('button').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('میانگین ۷ روزه'));
    expect(screen.getByText('میانگین ۷ روزه').closest('button').getAttribute('aria-pressed')).toBe('false');
  });

  it('an average longer than the data is disabled', () => {
    render(<PriceChart candles={candles.slice(0, 10)} days={days.slice(0, 10)} label="x" />);
    expect(screen.getByText('میانگین ۲۰ روزه').closest('button').disabled).toBe(true);
  });

  it('hovering a day shows its open, high, low and close', () => {
    const { container } = render(<PriceChart candles={candles} days={days} label="x" />);
    const plot = container.querySelector('.xchart-plot');
    plot.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 300, right: 300, bottom: 300 });
    fireEvent.pointerMove(plot, { clientX: 299 });
    const tip = container.querySelector('.xchart-tip');
    expect(tip.textContent).toContain('پایانی');
    expect(tip.textContent).toContain((131).toLocaleString('fa-IR'));
  });
});
