// @vitest-environment happy-dom
/**
 * homeTrendCard.test.js — The full home card: details and today's low / high in front, no chart
 * and no request until it is turned; locked while its candles load; its back is only the candles
 * (۱ ماه / ۶ ماه / ۱ سال, each fetched once), and a tap there turns it back
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ getSparklines: vi.fn() }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => api);
const { default: HomeAssetCard } = await import('../../../web/src/features/home/HomeAssetCard.jsx');
const { clearAssetCandlesCache } = await import('../../../web/src/features/home/useAssetCandles.js');
const { buildAssetIndex, resolveHomeAsset } = await import('../../../web/src/features/home/homeAssets.js');

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
  it('shows price, change and today\'s low and high in front, with no chart and no request', () => {
    const { container } = card();
    const front = container.querySelector('.pro-card-face.is-front');
    expect(digits(front.querySelector('.pro-card-price-value').textContent)).toBe(digits((101500).toLocaleString('fa-IR')));
    expect(front.querySelector('.bubble-pill').textContent).toContain('۰٫۸');
    const labels = front.querySelector('.pro-range-labels').textContent;
    expect(labels).toContain('کف امروز');
    expect(digits(labels)).toContain(digits((102000).toLocaleString('fa-IR')));
    expect(container.querySelector('.pro-range-track')).toBeNull();
    expect(container.querySelector('.trend-candle, .pro-card-face.is-back')).toBeNull();
    expect(api.getSparklines).not.toHaveBeenCalled();
  });

  it('is locked while its candles load, then turns to only them', async () => {
    let resolve;
    api.getSparklines.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { container } = card();
    const root = container.querySelector('.home-pro-card');
    fireEvent.click(root);
    expect(api.getSparklines).toHaveBeenCalledWith(['usd'], '30d', { candles: true });
    await waitFor(() => expect(root.classList.contains('is-loading')).toBe(true));
    expect(root.classList.contains('is-flipped')).toBe(false);
    fireEvent.click(root); // locked: ignored
    resolve({ available: true, sparklines: { usd: series(30) } });
    await waitFor(() => expect(root.classList.contains('is-flipped')).toBe(true));
    expect(root.classList.contains('is-loading')).toBe(false);
    const back = container.querySelector('.pro-card-face.is-back');
    expect(back.querySelectorAll('.trend-candle')).toHaveLength(30);
    expect(back.querySelector('.pro-range-labels, .pro-metric, .pro-card-name')).toBeNull();
    // A tap on the chart turns it back; turning again asks nothing
    fireEvent.click(back.querySelector('.pro-card-chart'));
    expect(root.classList.contains('is-flipped')).toBe(false);
    fireEvent.click(root);
    expect(root.classList.contains('is-flipped')).toBe(true);
    expect(api.getSparklines).toHaveBeenCalledTimes(1);
  });

  it('6 months and a year ask again (once each), without turning the card', async () => {
    api.getSparklines.mockImplementation(async ([id], range) => ({ available: true, sparklines: { [id]: series(range === '30d' ? 30 : range === '180d' ? 180 : 365) } }));
    const { container } = card();
    const root = container.querySelector('.home-pro-card');
    fireEvent.click(root);
    await waitFor(() => expect(root.classList.contains('is-flipped')).toBe(true));
    const buttons = [...container.querySelectorAll('.pro-card-ranges button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['۱ ماه', '۶ ماه', '۱ سال']);
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(container.querySelectorAll('.trend-candle')).toHaveLength(180));
    expect(root.classList.contains('is-flipped')).toBe(true);
    fireEvent.click(buttons[2]);
    await waitFor(() => expect(container.querySelectorAll('.trend-candle')).toHaveLength(365));
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(container.querySelectorAll('.trend-candle')).toHaveLength(30));
    expect(api.getSparklines.mock.calls.map((c) => c[1])).toEqual(['30d', '180d', '1y']);
  });

  it('starts at 30 days every time it is turned again', async () => {
    api.getSparklines.mockImplementation(async ([id], range) => ({ available: true, sparklines: { [id]: series(range === '30d' ? 30 : 180) } }));
    const { container } = card();
    const root = container.querySelector('.home-pro-card');
    fireEvent.click(root);
    await waitFor(() => expect(root.classList.contains('is-flipped')).toBe(true));
    fireEvent.click(container.querySelectorAll('.pro-card-ranges button')[1]);
    await waitFor(() => expect(container.querySelectorAll('.trend-candle')).toHaveLength(180));
    fireEvent.click(root); // to the front
    expect(root.classList.contains('is-flipped')).toBe(false);
    fireEvent.click(root); // and back: 30 days (cached, no new request)
    await waitFor(() => expect(container.querySelectorAll('.trend-candle')).toHaveLength(30));
    expect(container.querySelector('.pro-card-ranges button.is-active').textContent).toBe('۱ ماه');
    expect(api.getSparklines).toHaveBeenCalledTimes(2);
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
    expect(container.querySelector('.pro-range-labels')).toBeNull();
    expect(api.getSparklines).not.toHaveBeenCalled();
  });

  it('gold shows its bubble analysis in front', () => {
    const analysis = { id: 'gold_18k', market: 9800000, intrinsic: 9650000, target_bubble_pct: 2, expected_price: 9840000, diff_from_expected: -40000, diff_from_expected_pct: 0.4, bubble_pct: 1.5 };
    const index = buildAssetIndex({ itemMap: { gold_18k: { id: 'gold_18k', name: 'طلا', price: 9800000, sourceId: 's', params: {} } }, analysis: [analysis] });
    const gold = resolveHomeAsset('gold_18k', index);
    const { container } = render(React.createElement(HomeAssetCard, { asset: gold, style: 'detailed' }));
    expect(container.querySelectorAll('.pro-card-face.is-front .pro-metric')).toHaveLength(3);
    expect(container.querySelector('.pro-card-head .bubble-pill').textContent).toContain('حباب');
  });
});
