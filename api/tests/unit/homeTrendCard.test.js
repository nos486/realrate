// @vitest-environment happy-dom
/**
 * homeTrendCard.test.js — A trend card renders a daily series with candles,
 * does not render linear sparklines, and shows placeholder while loading.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import HomeAssetCard from '../../../web/src/features/home/HomeAssetCard.jsx';

const asset = { id: 'usd', found: true, name: 'دلار', code: 'USD', price: 101500, unit: 'تومان', category: 'currency' };
const series = (n) => ({
  points: Array.from({ length: n }, (_, i) => 100000 + i * 10),
  first: 100000,
  last: 100000 + (n - 1) * 10,
  changePct: 1.5,
  since: '2026-01-01T00:00:00.000Z',
});

const candleSeries = (n) => {
  const base = series(n);
  const days = Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
  const candles = base.points.map((p, i) => (i === 1 ? [p + 5, p + 8, p - 2, p] : [p, p + 3, p - 3, p + 1]));
  return { ...base, days, candles };
};

afterEach(() => {
  cleanup();
});

describe('trend card', () => {
  it('renders a young history with the day it starts when candles are present', () => {
    const trend = candleSeries(10);
    const { container } = render(React.createElement(HomeAssetCard, { asset, style: 'detailed', trend, trendStatus: 'ready', bucketSec: 86400 }));
    expect(container.querySelector('.trend-candles')).not.toBeNull();
    expect(container.querySelector('.home-trend-caption').textContent).toMatch(/^از \S+ \S+$/);
  });

  it('renders a full window as the last 30 days, with the change since yesterday', () => {
    const base = candleSeries(30);
    const yesterday = base.candles[28][3];
    const lastClose = 101500;
    base.candles[29] = [101000, 102000, 100500, lastClose];
    base.points[29] = lastClose;
    base.last = lastClose;
    const { container } = render(React.createElement(HomeAssetCard, { asset, style: 'detailed', trend: base, trendStatus: 'ready', bucketSec: 86400 }));
    expect(container.querySelector('.home-trend-caption').textContent).toBe('۳۰ روز اخیر');
    const expected = (((lastClose - yesterday) / yesterday) * 100).toFixed(2);
    const pill = container.querySelector('.bubble-pill');
    expect(pill.getAttribute('title')).toBe('تغییر نسبت به دیروز');
    expect(pill.textContent.replace(/[^۰-۹0-9.٫]/g, '')).toMatch(new RegExp(`^${Number(expected).toLocaleString('fa-IR', { maximumFractionDigits: 2 }).replace(/[^۰-۹0-9.٫]/g, '')}`));
  });

  it('a full card without a series has no chart, and a placeholder while loading', () => {
    const empty = render(React.createElement(HomeAssetCard, { asset, style: 'detailed', trend: null, trendStatus: 'ready', bucketSec: 86400 }));
    expect(empty.container.querySelector('.trend-candles')).toBeNull();
    expect(empty.container.querySelector('.trend-spark')).toBeNull();
    expect(empty.container.querySelector('.card-name').textContent).toBe('دلار');
    cleanup();
    const loading = render(React.createElement(HomeAssetCard, { asset, style: 'detailed', trend: null, trendStatus: 'loading', bucketSec: 60 }));
    expect(loading.container.querySelector('.home-trend-skeleton')).not.toBeNull();
  });

  it('renders candles with proper up/down classes and does not render linear line charts', () => {
    const trend = candleSeries(5);
    const { container } = render(React.createElement(HomeAssetCard, { asset, style: 'detailed', trend, trendStatus: 'ready', bucketSec: 86400 }));
    expect(container.querySelectorAll('.trend-candle')).toHaveLength(5);
    expect(container.querySelectorAll('.trend-candle.is-up')).toHaveLength(4);
    expect(container.querySelectorAll('.trend-candle.is-down')).toHaveLength(1);
    expect(container.querySelector('.trend-spark-line')).toBeNull();
  });

  it('without candles in the series, no line chart is rendered and card stays clean', () => {
    const { container } = render(React.createElement(HomeAssetCard, { asset, style: 'detailed', trend: series(5), trendStatus: 'ready', bucketSec: 86400 }));
    expect(container.querySelector('.trend-candles')).toBeNull();
    expect(container.querySelector('.trend-spark-line')).toBeNull();
    expect(container.querySelector('.home-card-chart')).toBeNull();
  });
});
