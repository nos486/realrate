// @vitest-environment happy-dom
/**
 * explorePage.test.jsx — «کاوش بازار»: search any price-book asset, open it to see its card, its
 * chart and its info, with nothing saved (the choice lives in the URL only)
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const candles = Array.from({ length: 5 }, (_, i) => [100 + i, 105 + i, 98 + i, 102 + i]);
const days = candles.map((_, i) => `2026-09-0${i + 1}`);
const getSparklines = vi.fn(async (ids) => ({ available: true, sparklines: Object.fromEntries(ids.map((id) => [id, { points: [], days, candles }])) }));
// The chart itself is tested on its own (explorePriceChart.test.jsx): here only what the page feeds it
vi.mock('../../../web/src/features/explore/PriceChart.jsx', () => ({
  default: ({ candles: c, onNeedOlder }) => <button type="button" onClick={() => onNeedOlder?.()}>{`chart ${c.length}${onNeedOlder ? ' more' : ''}`}</button>,
}));
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

  it('opening an asset shows its price line and chart, and fetches its candles', () => {
    renderAt('/explore');
    fireEvent.click(screen.getByText('دلار'));
    expect(screen.getByLabelText('نمودار')).toBeTruthy();
    // One line: the name and the live price; no info card
    expect(screen.getByRole('heading', { name: 'دلار' })).toBeTruthy();
    expect(screen.getByText((100000).toLocaleString('fa-IR'), { exact: false, selector: 'strong' })).toBeTruthy();
    expect(screen.queryByLabelText('اطلاعات')).toBeNull();
    expect(getSparklines).toHaveBeenCalledWith(['usd'], '180d', { candles: true });
  });

  it('a dollar-priced asset is charted by its dollar closes', () => {
    renderAt('/explore?a=btc');
    expect(getSparklines).toHaveBeenCalledWith(['btc@usd'], '180d', { candles: true });
  });

  it('scrolling past the oldest day loads a longer history: one year, then two, then no more', async () => {
    renderAt('/explore?a=usd');
    const next = async (steps) => {
      fireEvent.click(await screen.findByText(/^chart 5/));
      await waitFor(() => expect(getSparklines).toHaveBeenLastCalledWith(['usd'], steps, { candles: true }));
    };
    await next('1y');
    await next('2y');
    await waitFor(() => expect(screen.getByText('chart 5').textContent).not.toContain('more'));
  });
});
