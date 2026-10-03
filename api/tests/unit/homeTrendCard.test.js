// @vitest-environment happy-dom
/**
 * homeTrendCard.test.js — A trend card renders a daily series (30 days or younger) with the change
 * since yesterday, without one, and while loading
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import HomeAssetCard from '../../../web/src/features/home/HomeAssetCard.jsx';
import { setTrendChartStyle } from '../../../web/src/features/home/trendChartStyle.js';
import { fireEvent } from '@testing-library/react';

const asset = { id: 'usd', found: true, name: 'دلار', code: 'USD', price: 101500, unit: 'تومان', category: 'currency' };
const series = (n) => ({
  points: Array.from({ length: n }, (_, i) => 100000 + i * 10),
  first: 100000,
  last: 100000 + (n - 1) * 10,
  changePct: 1.5,
  since: '2026-01-01T00:00:00.000Z',
});

afterEach(() => {
  cleanup();
  setTrendChartStyle('line');
});

describe('trend card', () => {
  it('renders a young history with the day it starts', () => {
    const { container } = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend: series(10), trendStatus: 'ready', bucketSec: 86400 }));
    expect(container.querySelector('.trend-spark')).not.toBeNull();
    expect(container.querySelector('.home-trend-caption').textContent).toMatch(/^از \S+ \S+$/);
  });

  it('renders a full window as the last 30 days, with the change since yesterday', () => {
    const trend = { ...series(30), points: [...series(29).points, 101500], changePct: 1.5 };
    const yesterday = trend.points[28];
    const { container } = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend, trendStatus: 'ready', bucketSec: 86400 }));
    expect(container.querySelector('.home-trend-caption').textContent).toBe('۳۰ روز اخیر');
    const expected = (((101500 - yesterday) / yesterday) * 100).toFixed(2);
    const pill = container.querySelector('.bubble-pill');
    expect(pill.getAttribute('title')).toBe('تغییر نسبت به دیروز');
    expect(pill.textContent.replace(/[^۰-۹0-9.٫]/g, '')).toMatch(new RegExp(`^${Number(expected).toLocaleString('fa-IR', { maximumFractionDigits: 2 }).replace(/[^۰-۹0-9.٫]/g, '')}`));
  });

  it('renders without a series, and while loading', () => {
    const empty = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend: null, trendStatus: 'ready', bucketSec: 86400 }));
    expect(empty.container.querySelector('.home-trend-empty')).not.toBeNull();
    cleanup();
    const loading = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend: null, trendStatus: 'loading', bucketSec: 60 }));
    expect(loading.container.querySelector('.home-trend-skeleton')).not.toBeNull();
  });

  it('switches to candles and back, and remembers the choice', () => {
    const base = series(5);
    const trend = {
      ...base,
      days: ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
      candles: base.points.map((p, i) => (i === 1 ? [p + 5, p + 8, p - 2, p] : [p, p + 3, p - 3, p + 1])),
    };
    const { container, getByTitle } = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend, trendStatus: 'ready', bucketSec: 86400 }));
    expect(container.querySelector('.trend-candles')).toBeNull();
    fireEvent.click(getByTitle('نمودار کندلی'));
    expect(container.querySelectorAll('.trend-candle')).toHaveLength(5);
    expect(container.querySelectorAll('.trend-candle.is-up')).toHaveLength(4);
    expect(container.querySelectorAll('.trend-candle.is-down')).toHaveLength(1);
    expect(localStorage.getItem('realrate:trendChartStyle')).toBe('candles');
    fireEvent.click(getByTitle('نمودار خطی'));
    expect(container.querySelector('.trend-candles')).toBeNull();
  });

  it('without candles in the series there is no switch', () => {
    const { container } = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend: series(5), trendStatus: 'ready', bucketSec: 86400 }));
    expect(container.querySelector('.home-trend-switch')).toBeNull();
  });
});
