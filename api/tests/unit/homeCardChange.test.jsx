// @vitest-environment happy-dom
/**
 * homeCardChange.test.jsx — A full card on «نرخ و حباب» shows the price book's change (its last
 * session's), the percent alone
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('../../../web/src/features/home/useAssetCandles.js', () => ({ useCardCandles: () => ({ status: 'idle', series: null }) }));
import HomeAssetCard from '../../../web/src/features/home/HomeAssetCard.jsx';

afterEach(cleanup);

const asset = { id: 'usd', found: true, name: 'دلار', price: 105000, unit: 'تومان', changePercent: 0.5 };

describe('full card change', () => {
  it('the book\'s change, the percent alone', () => {
    render(<HomeAssetCard asset={{ ...asset, changePercent: 5 }} style="detailed" />);
    const pill = screen.getByTitle('تغییر نسبت به پایانی جلسه‌ی قبل');
    expect(pill.textContent).toContain('▲');
    expect(pill.textContent).toContain('۵');
    expect(pill.textContent).not.toContain('روزانه');
  });

  it('a fall', () => {
    render(<HomeAssetCard asset={{ ...asset, changePercent: -2.5 }} style="detailed" />);
    expect(screen.getByTitle('تغییر نسبت به پایانی جلسه‌ی قبل').textContent).toContain('▼');
  });

  it('no change known: no pill', () => {
    render(<HomeAssetCard asset={{ ...asset, changePercent: null }} style="detailed" />);
    expect(screen.queryByTitle('تغییر نسبت به پایانی جلسه‌ی قبل')).toBeNull();
  });
});
