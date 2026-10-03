// @vitest-environment happy-dom
/**
 * homeTrendCard.test.js — The full home card: details in front; tapped (or Enter), it turns to
 * its back — the last days as candles, today's range and the window's range; without history, or
 * while the page is being arranged, it doesn't turn
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import HomeAssetCard from '../../../web/src/features/home/HomeAssetCard.jsx';

const asset = { id: 'usd', found: true, name: 'دلار', code: 'USD', price: 101500, unit: 'تومان', category: 'currency' };
const series = (n) => {
  const points = Array.from({ length: n }, (_, i) => 100000 + i * 100);
  return {
    points,
    days: points.map((_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`),
    candles: points.map((p, i) => (i === 1 ? [p + 50, p + 80, p - 20, p] : [p - 50, p + 30, p - 70, p])),
    first: points[0],
    last: points[n - 1],
    changePct: 1.5,
    since: '2026-01-01T00:00:00+03:30',
  };
};
const card = (props) => render(React.createElement(HomeAssetCard, { asset, style: 'detailed', trendStatus: 'ready', ...props }));
const digits = (el) => el.textContent.replace(/[^۰-۹]/g, '');
const fa = (n) => Math.round(n).toLocaleString('fa-IR').replace(/[^۰-۹]/g, '');

afterEach(cleanup);

describe('full card', () => {
  it('shows the details in front, the change since yesterday from the history', () => {
    const trend = series(30);
    const { container } = card({ trend });
    const front = container.querySelector('.pro-card-face.is-front');
    expect(front.querySelector('.pro-card-name').textContent).toBe('دلار');
    expect(digits(front.querySelector('.pro-card-price-value'))).toBe(fa(101500));
    const pill = front.querySelector('.bubble-pill');
    expect(pill.getAttribute('title')).toBe('تغییر نسبت به دیروز');
    expect(container.querySelector('.home-pro-card').getAttribute('aria-pressed')).toBe('false');
    expect(front.querySelector('.pro-card-hint')).not.toBeNull();
  });

  it('turns over to candles, today\'s range and the 30-day range, and back', () => {
    const trend = series(30);
    const { container } = card({ trend });
    const root = container.querySelector('.home-pro-card');
    fireEvent.click(root);
    expect(root.classList.contains('is-flipped')).toBe(true);
    const back = container.querySelector('.pro-card-face.is-back');
    expect(back.getAttribute('aria-hidden')).toBe('false');
    expect(back.querySelectorAll('.trend-candle')).toHaveLength(30);
    expect(back.querySelector('.pro-card-sub').textContent).toBe('۳۰ روز اخیر');
    const [open, low, high] = [...back.querySelectorAll('.pro-card-stats strong')].map(digits);
    const today = trend.candles[29];
    expect([open, low, high]).toEqual([fa(today[0]), fa(today[2]), fa(today[1])]);
    const labels = back.querySelector('.pro-range-labels').textContent;
    expect(labels).toContain(Math.round(Math.min(...trend.candles.map((c) => c[2]))).toLocaleString('fa-IR'));
    // Inspecting the chart keeps the back; a tap elsewhere turns it again
    fireEvent.click(back.querySelector('.pro-card-chart'));
    expect(root.classList.contains('is-flipped')).toBe(true);
    fireEvent.keyDown(root, { key: 'Enter' });
    expect(root.classList.contains('is-flipped')).toBe(false);
  });

  it('a young history says where it starts', () => {
    const { container } = card({ trend: series(10) });
    expect(container.querySelector('.pro-card-face.is-back .pro-card-sub').textContent).toMatch(/^از \S+ \S+$/);
  });

  it('does not turn without history, or while the page is being arranged', () => {
    const plain = card({ trend: null });
    const root = plain.container.querySelector('.home-pro-card');
    expect(root.getAttribute('role')).toBeNull();
    fireEvent.click(root);
    expect(root.classList.contains('is-flipped')).toBe(false);
    expect(plain.container.querySelector('.pro-card-face.is-back')).toBeNull();
    cleanup();
    const arranging = card({ trend: series(30), flippable: false });
    const r2 = arranging.container.querySelector('.home-pro-card');
    fireEvent.click(r2);
    expect(r2.classList.contains('is-flipped')).toBe(false);
    cleanup();
    const loading = card({ trend: null, trendStatus: 'loading' });
    expect(loading.container.querySelector('.pro-card-hint.is-loading')).not.toBeNull();
  });

  it('gold shows its bubble analysis in front', () => {
    const gold = { id: 'gold_18k', found: true, name: 'طلا', price: 9800000, unit: 'تومان', analysis: { market: 9800000, intrinsic: 9650000, target_bubble_pct: 2, expected_price: 9840000, diff_from_expected: -40000, diff_from_expected_pct: 0.4, bubble_pct: 1.5 } };
    const { container } = render(React.createElement(HomeAssetCard, { asset: gold, style: 'detailed', trend: series(30), trendStatus: 'ready' }));
    expect(container.querySelectorAll('.pro-card-face.is-front .pro-metric')).toHaveLength(3);
    expect(container.querySelector('.pro-card-head .bubble-pill').textContent).toContain('حباب');
  });
});
