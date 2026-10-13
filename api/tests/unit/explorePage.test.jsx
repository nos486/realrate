// @vitest-environment happy-dom
/**
 * explorePage.test.jsx — «کاوش بازار»: one chart, the dollar's until another asset is picked with
 * the asset search inside it; nothing is saved (the choice lives in the URL only)
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
  default: ({ candles: c, onNeedOlder, header }) => <>{header}<button type="button" onClick={() => onNeedOlder?.()}>{`chart ${c.length}${onNeedOlder ? ' more' : ''}`}</button></>,
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
  usePricing: () => ({ itemMap, resolvedAssets: assets, loading: false, searchAssets: (q, o) => searchUnifiedAssets(assets, q, o) }),
}));

import ExplorePage from '../../../web/src/features/explore/ExplorePage.jsx';

afterEach(cleanup);
const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><ExplorePage /></MemoryRouter>);

describe('ExplorePage', () => {
  it('charts the dollar until another is picked, with its name and price on top', async () => {
    renderAt('/explore');
    expect(screen.getByRole('heading', { name: 'دلار' })).toBeTruthy();
    expect(screen.getByText((100000).toLocaleString('fa-IR'), { selector: 'bdi' })).toBeTruthy();
    await waitFor(() => expect(getSparklines).toHaveBeenCalledWith(['usd'], '180d', { candles: true }));
  });

  it('the search inside the chart picks another asset and charts it', async () => {
    renderAt('/explore');
    await screen.findByText(/^chart/); // the dollar's chart is up; the search stays where it was
    const input = screen.getByPlaceholderText(/جستجوی نماد/);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'بیت' } });
    fireEvent.click(await screen.findByText('بیت‌کوین'));
    expect(screen.getByRole('heading', { name: 'بیت‌کوین' })).toBeTruthy();
    // A dollar-priced asset is charted by its dollar closes
    await waitFor(() => expect(getSparklines).toHaveBeenCalledWith(['btc@usd'], '180d', { candles: true }));
  });

  it('an asset the market has no price for says so, and the search stays', () => {
    renderAt('/explore?a=nothing_here');
    expect(screen.getByText(/نرخی ندارد/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/جستجوی نماد/)).toBeTruthy();
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
