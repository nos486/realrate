// @vitest-environment happy-dom
/**
 * explorePage.test.jsx — «کاوش بازار»: search any price-book asset, open it to see its card, its
 * chart and its info, with nothing saved (the choice lives in the URL only)
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getSparklines = vi.fn(async () => ({ available: true, sparklines: {} }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => ({ getSparklines: (...a) => getSparklines(...a) }));

const items = {
  usd: { id: 'usd', name: 'دلار', category: 'currency', unit: 'دلار', price: 100_000, params: { sourceName: 'بازار آزاد', changePercent: 1 } },
  btc: { id: 'btc', name: 'بیت‌کوین', category: 'crypto', unit: 'واحد', price: 6_500_000_000, currency: 'usd', priceUsd: 65000, params: {} },
};
import { bookToAssets } from '../../../web/src/features/market/priceBookAssets.js';
import { searchUnifiedAssets } from '../../../web/src/utils/pricingEngine.js';
const { itemMap, assets } = (() => {
  const b = bookToAssets({ items });
  return { itemMap: b.itemMap, assets: Object.values(b.itemMap) };
})();
vi.mock('../../../web/src/features/market/context/PricingContext.jsx', () => ({
  usePricing: () => ({ itemMap, loading: false, searchAssets: (q, o) => searchUnifiedAssets(assets, q, o) }),
}));

import ExplorePage from '../../../web/src/features/explore/ExplorePage.jsx';

afterEach(cleanup);
const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><ExplorePage /></MemoryRouter>);

describe('ExplorePage', () => {
  it('lists the assets and asks to choose one', () => {
    renderAt('/explore');
    expect(screen.getByText('دلار')).toBeTruthy();
    expect(screen.getByText('بیت‌کوین')).toBeTruthy();
    expect(screen.getByText(/یک دارایی را از فهرست انتخاب کنید/)).toBeTruthy();
  });

  it('search narrows the list', () => {
    renderAt('/explore');
    fireEvent.change(screen.getByLabelText('جستجوی دارایی'), { target: { value: 'بیت' } });
    expect(screen.queryByText('دلار')).toBeNull();
    expect(screen.getByText('بیت‌کوین')).toBeTruthy();
  });

  it('opening an asset shows its card, chart and info, and fetches its candles', () => {
    renderAt('/explore');
    fireEvent.click(screen.getByText('دلار'));
    expect(screen.getByLabelText('نمودار')).toBeTruthy();
    expect(screen.getByText('بازار آزاد')).toBeTruthy(); // the card names its source
    expect(screen.getByLabelText('اطلاعات')).toBeTruthy();
    expect(getSparklines).toHaveBeenCalledWith(['usd'], '30d', { candles: true });
  });

  it('a dollar-priced asset is charted by its dollar closes', () => {
    renderAt('/explore?a=btc');
    expect(getSparklines).toHaveBeenCalledWith(['btc@usd'], '30d', { candles: true });
  });
});
