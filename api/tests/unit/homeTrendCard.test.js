// @vitest-environment happy-dom
/**
 * homeTrendCard.test.js — The full home card: details and today's range in front, no chart and no
 * request until it is turned; turned, its back is only the 30-day candles, fetched then (once)
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ getSparklines: vi.fn() }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => api);
const { default: HomeAssetCard } = await import('../../../web/src/features/home/HomeAssetCard.jsx');
const { clearAssetCandlesCache } = await import('../../../web/src/features/home/useAssetCandles.js');

const asset = { id: 'usd', found: true, name: 'دلار', code: 'USD', price: 101500, unit: 'تومان', category: 'currency', changePercent: 0.8, dayRange: { low: 100000, high: 102000, open: 100500 } };
const series = (n) => {
  const points = Array.from({ length: n }, (_, i) => 100000 + i * 100);
  return { points, days: points.map((_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`), candles: points.map((p) => [p - 50, p + 30, p - 70, p]) };
};
const card = (props = {}) => render(React.createElement(HomeAssetCard, { asset, style: 'detailed', ...props }));
const digits = (s) => s.replace(/[^۰-۹]/g, '');

beforeEach(() => {
  clearAssetCandlesCache();
  api.getSparklines.mockReset();
});
afterEach(cleanup);

describe('full card', () => {
  it('shows price, change and today\'s range in front, with no chart and no request', () => {
    const { container } = card();
    const front = container.querySelector('.pro-card-face.is-front');
    expect(digits(front.querySelector('.pro-card-price-value').textContent)).toBe(digits((101500).toLocaleString('fa-IR')));
    expect(front.querySelector('.bubble-pill').textContent).toContain('۰٫۸');
    const labels = front.querySelector('.pro-range-labels').textContent;
    expect(labels).toContain('کف امروز');
    expect(digits(labels)).toContain(digits((102000).toLocaleString('fa-IR')));
    // 1500 of 2000 above the low
    expect(front.querySelector('.pro-range-fill').style.width).toBe('75%');
    expect(container.querySelector('.trend-candle, .pro-card-face.is-back')).toBeNull();
    expect(api.getSparklines).not.toHaveBeenCalled();
  });

  it('turned, fetches this asset\'s candles once and shows only them', async () => {
    api.getSparklines.mockResolvedValue({ available: true, sparklines: { usd: series(30) } });
    const { container } = card();
    const root = container.querySelector('.home-pro-card');
    fireEvent.click(root);
    expect(root.classList.contains('is-flipped')).toBe(true);
    expect(api.getSparklines).toHaveBeenCalledWith(['usd'], '30d', { candles: true });
    await waitFor(() => expect(container.querySelectorAll('.pro-card-face.is-back .trend-candle')).toHaveLength(30));
    const back = container.querySelector('.pro-card-face.is-back');
    expect(back.querySelector('.pro-range, .pro-metric, .pro-card-name')).toBeNull();
    // Inspecting the chart keeps the back; a tap elsewhere turns it; turning again asks nothing
    fireEvent.click(back.querySelector('.pro-card-chart'));
    expect(root.classList.contains('is-flipped')).toBe(true);
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(root.classList.contains('is-flipped')).toBe(false);
    fireEvent.click(root);
    expect(api.getSparklines).toHaveBeenCalledTimes(1);
  });

  it('says so when there is no history', async () => {
    api.getSparklines.mockResolvedValue({ available: true, sparklines: {} });
    const { container } = card();
    fireEvent.click(container.querySelector('.home-pro-card'));
    await waitFor(() => expect(container.querySelector('.pro-card-back-state').textContent).toContain('تاریخچه‌ای'));
  });

  it('does not turn while the page is being arranged, and has no range without today\'s', () => {
    const { container } = card({ flippable: false, asset: { ...asset, dayRange: null } });
    const root = container.querySelector('.home-pro-card');
    expect(root.getAttribute('role')).toBeNull();
    fireEvent.click(root);
    expect(root.classList.contains('is-flipped')).toBe(false);
    expect(container.querySelector('.pro-range')).toBeNull();
    expect(api.getSparklines).not.toHaveBeenCalled();
  });

  it('gold shows its bubble analysis in front', () => {
    const gold = { id: 'gold_18k', found: true, name: 'طلا', price: 9800000, unit: 'تومان', analysis: { market: 9800000, intrinsic: 9650000, target_bubble_pct: 2, expected_price: 9840000, diff_from_expected: -40000, diff_from_expected_pct: 0.4, bubble_pct: 1.5 } };
    const { container } = render(React.createElement(HomeAssetCard, { asset: gold, style: 'detailed' }));
    expect(container.querySelectorAll('.pro-card-face.is-front .pro-metric')).toHaveLength(3);
    expect(container.querySelector('.pro-card-head .bubble-pill').textContent).toContain('حباب');
  });
});
