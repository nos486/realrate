// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('../../../web/src/features/market/api/marketApi.js', () => ({
  getPriceBook: vi.fn(),
}));

import { getPriceBook } from '../../../web/src/features/market/api/marketApi.js';
import {
  PricingProvider,
  usePricing,
  PRICE_REFRESH_INTERVAL_MS,
} from '../../../web/src/features/market/context/PricingContext.jsx';
import { useMarketData } from '../../../web/src/features/market/hooks/useMarketData.js';

// The one response the app's prices come from
const book = (usd, gold = 2500, announcement = '') => ({
  success: true,
  updatedAt: '2026-01-01T00:00:00Z',
  globalSettings: { announcement },
  items: {
    usd: { id: 'usd', price: usd, name: 'دلار', category: 'currency', unit: 'دلار', sourceId: 'src_def_usd', params: {} },
    try: { id: 'try', price: Math.round(usd * 0.02), name: 'لیر', category: 'currency', unit: 'لیر', sourceId: 'src_def_forex', params: { usdCross: 0.02 } },
    ons_gold: { id: 'ons_gold', price: gold * usd, name: 'انس', category: 'gold', unit: 'اونس', sourceId: 'src_def_ons_gold', params: { usd: gold } },
  },
});

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function renderPricing() {
  const wrapper = ({ children }) => React.createElement(PricingProvider, null, children);
  return renderHook(() => usePricing(), { wrapper });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  setVisibility('visible');
  getPriceBook.mockResolvedValue(book(100000, 2500, 'first'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PricingContext auto-refresh', () => {
  it('loads once on mount, then refreshes silently every 2 minutes while visible', async () => {
    const { result } = renderPricing();
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(1);
    expect(Number(result.current.usdToman)).toBe(100000);
    expect(result.current.lastUpdatedAt).not.toBeNull();

    getPriceBook.mockResolvedValue(book(110000));
    await act(async () => {
      vi.advanceTimersByTime(PRICE_REFRESH_INTERVAL_MS);
    });
    await flush();

    expect(getPriceBook).toHaveBeenCalledTimes(2);
    expect(getPriceBook).toHaveBeenLastCalledWith({ silent: true });
    expect(Number(result.current.usdToman)).toBe(110000);
    expect(result.current.error).toBeNull();
  });

  it('does not poll while the tab is hidden, and refreshes on return once stale', async () => {
    renderPricing();
    await flush();
    setVisibility('hidden');

    await act(async () => {
      vi.advanceTimersByTime(PRICE_REFRESH_INTERVAL_MS * 3);
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(1);

    await act(async () => {
      setVisibility('visible');
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(2);
  });

  it('does not refresh on return when the data is still fresh', async () => {
    renderPricing();
    await flush();
    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(30 * 1000);
      setVisibility('visible');
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(1);
  });

  it('keeps the last good prices and reports an error when a refresh fails', async () => {
    const { result } = renderPricing();
    await flush();
    const firstUpdate = result.current.lastUpdatedAt;

    getPriceBook.mockRejectedValue(new Error('network down'));
    await act(async () => {
      vi.advanceTimersByTime(PRICE_REFRESH_INTERVAL_MS);
    });
    await flush();

    expect(result.current.error).toBe('network down');
    expect(result.current.globalSettings.announcement).toBe('first');
    expect(result.current.priceMap.usd).toBe(100000);
    expect(Number(result.current.usdToman)).toBe(100000);
    expect(result.current.lastUpdatedAt).toBe(firstUpdate);

    // A later successful (manual) refresh clears the error
    getPriceBook.mockResolvedValue(book(120000, 2500, 'second'));
    await act(async () => {
      result.current.refresh();
    });
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.globalSettings.announcement).toBe('second');
  });

  it("never overwrites a price the user typed in by hand", async () => {
    const { result } = renderPricing();
    await flush();

    act(() => {
      result.current.setManualOverride({ usd: true, gold: true });
      result.current.setUsdToman(95000);
      result.current.setGoldUsd(3000);
    });

    getPriceBook.mockResolvedValue(book(130000, 2700));
    await act(async () => {
      vi.advanceTimersByTime(PRICE_REFRESH_INTERVAL_MS);
    });
    await flush();

    expect(getPriceBook).toHaveBeenCalledTimes(2);
    expect(Number(result.current.usdToman)).toBe(95000);
    expect(Number(result.current.goldUsd)).toBe(3000);
  });

  it('keeps a stable context value between unrelated renders', async () => {
    const { result, rerender } = renderPricing();
    await flush();
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });
});

describe('useMarketData on top of the shared refresh', () => {
  const renderMarketData = () => {
    const wrapper = ({ children }) => React.createElement(PricingProvider, null, children);
    return renderHook(() => ({ market: useMarketData(), pricing: usePricing() }), { wrapper });
  };

  it('uses the shared book instead of fetching prices again', async () => {
    const { result } = renderMarketData();
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(1);
    expect(result.current.market.usdToman).toBe('100,000');
    expect(result.current.market.globalSettings.announcement).toBe('first');
    expect(result.current.market.referenceRates.map((r) => [r.key, r.price])).toEqual([['usd', 100000]]);
    // The calculator's currencies are the book's prices
    expect(result.current.market.calcData.currencies.find((c) => c.code === 'TRY').toman_price).toBe(2000);
  });

  it('follows background refreshes until the user edits the value', async () => {
    const { result } = renderMarketData();
    await flush();

    getPriceBook.mockResolvedValue(book(110000));
    await act(async () => {
      vi.advanceTimersByTime(PRICE_REFRESH_INTERVAL_MS);
    });
    await flush();
    expect(result.current.market.usdToman).toBe('110,000');

    await act(async () => {
      result.current.market.setUsdToman('95,000');
    });
    await flush();

    getPriceBook.mockResolvedValue(book(130000));
    await act(async () => {
      vi.advanceTimersByTime(PRICE_REFRESH_INTERVAL_MS);
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(3);
    expect(result.current.market.usdToman).toBe('95,000');
    expect(Number(result.current.pricing.usdToman)).toBe(95000);
  });
});

describe('prices come from the price book only', () => {
  it('exposes the book\'s prices by id, and resolves old stored ids', async () => {
    const { result } = renderPricing();
    await flush();
    expect(result.current.priceMap).toEqual({ usd: 100000, try: 2000, ons_gold: 250000000 });
    expect(result.current.getAssetPrice('try')).toBe(2000);
    expect(result.current.getAssetPrice('TRY')).toBe(2000);
    expect(result.current.getAssetPrice('src_def_usd')).toBe(100000);
    expect(result.current.getAsset('forex_try')?.name).toBe('لیر');
  });

  it('never changes a price when the calculator\'s USD rate is edited', async () => {
    const { result } = renderPricing();
    await flush();
    act(() => result.current.setUsdToman(120000));
    expect(result.current.getAssetPrice('try')).toBe(2000);
    expect(result.current.summary.usdToman).toBe(120000);
  });
});
