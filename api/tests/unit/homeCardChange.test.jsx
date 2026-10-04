// @vitest-environment happy-dom
/**
 * homeCardChange.test.jsx — A full card on «نرخ و حباب» shows its 24-hour change (against
 * yesterday's close); without history, the source's own change
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('../../../web/src/features/home/useAssetCandles.js', () => ({ useAssetCandles: () => ({ status: 'idle', series: null }) }));
import HomeAssetCard from '../../../web/src/features/home/HomeAssetCard.jsx';

afterEach(cleanup);

const asset = { id: 'usd', found: true, name: 'دلار', price: 105000, unit: 'تومان', changePercent: 0.5 };

describe('full card change', () => {
  it('24-hour change against yesterday\'s close, labelled', () => {
    render(<HomeAssetCard asset={asset} style="detailed" previousClose={100000} />);
    const pill = screen.getByTitle('تغییر نسبت به قیمت پایانی دیروز');
    expect(pill.textContent).toContain('▲');
    expect(pill.textContent).toContain('۵');
    expect(pill.textContent).not.toContain('روزانه');
  });

  it('without history: the source\'s own change, no tooltip', () => {
    render(<HomeAssetCard asset={asset} style="detailed" />);
    expect(screen.queryByTitle('تغییر نسبت به قیمت پایانی دیروز')).toBeNull();
    expect(screen.getByText(/▲/)).toBeTruthy();
  });
});
