// @vitest-environment happy-dom
/**
 * homeTrendCard.test.js — A trend card renders with a series (full day or younger), without one,
 * and while loading
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

afterEach(cleanup);

describe('trend card', () => {
  it('renders a young history with the time it starts', () => {
    const { container } = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend: series(30), trendStatus: 'ready', bucketSec: 60 }));
    expect(container.querySelector('.trend-spark')).not.toBeNull();
    expect(container.querySelector('.home-trend-caption').textContent).toMatch(/^از ساعت /);
  });

  it('renders a full day as the last 24 hours', () => {
    const { container } = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend: series(1441), trendStatus: 'ready', bucketSec: 60 }));
    expect(container.querySelector('.home-trend-caption').textContent).toBe('۲۴ ساعت اخیر');
  });

  it('renders without a series, and while loading', () => {
    const empty = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend: null, trendStatus: 'ready', bucketSec: 60 }));
    expect(empty.container.querySelector('.home-trend-empty')).not.toBeNull();
    cleanup();
    const loading = render(React.createElement(HomeAssetCard, { asset, style: 'trend', trend: null, trendStatus: 'loading', bucketSec: 60 }));
    expect(loading.container.querySelector('.home-trend-skeleton')).not.toBeNull();
  });
});
