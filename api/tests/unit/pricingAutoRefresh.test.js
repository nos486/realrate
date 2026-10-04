// @vitest-environment happy-dom
/**
 * pricingAutoRefresh.test.js — When the app reads prices: on opening, on the refresh button, on
 * another tab and on coming back to the app (never on a timer); the catalog part (exchange
 * symbols) only when its version moves
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

vi.mock('../../../web/src/features/market/api/marketApi.js', () => ({
  getCorePriceBook: vi.fn(),
  getPriceCatalog: vi.fn(),
}));

import { getCorePriceBook as getPriceBook, getPriceCatalog } from '../../../web/src/features/market/api/marketApi.js';
import {
  PricingProvider,
  usePricing,
  PRICE_AUTO_REFRESH_GAP_MS,
} from '../../../web/src/features/market/context/PricingContext.jsx';
import { useMarketData } from '../../../web/src/features/market/hooks/useMarketData.js';

// The one response the app's prices come from
const book = (usd, gold = 2500, announcement = '', catalogVersion = 'k1') => ({
  success: true,
  catalogVersion,
  updatedAt: '2026-01-01T00:00:00Z',
  globalSettings: { announcement },
  items: {
    usd: { id: 'usd', price: usd, name: 'دلار', category: 'currency', unit: 'دلار', sourceId: 'src_def_usd', params: {} },
    try: { id: 'try', price: Math.round(usd * 0.02), name: 'لیر', category: 'currency', unit: 'لیر', sourceId: 'src_def_forex', params: { usdCross: 0.02 } },
    ons_gold: { id: 'ons_gold', price: gold * usd, name: 'انس', category: 'gold', unit: 'اونس', sourceId: 'src_def_ons_gold', params: { usd: gold } },
  },
});

const catalog = (version, foolad) => ({
  success: true,
  version,
  items: { bourse__foolad: { id: 'bourse__foolad', price: foolad, name: 'فولاد', category: 'bourse', unit: 'سهم', sourceId: 'src_def_bourse', params: { symbol: 'فولاد' } } },
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
  getPriceCatalog.mockResolvedValue(catalog('k1', 540));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PricingContext: when prices are read', () => {
  it('reads once on opening — core and catalog together — and never on a timer', async () => {
    const { result } = renderPricing();
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(1);
    expect(getPriceCatalog).toHaveBeenCalledTimes(1);
    expect(Number(result.current.usdToman)).toBe(100000);
    expect(result.current.priceMap.bourse__foolad).toBe(540);
    expect(result.current.lastUpdatedAt).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(1);
  });

  it('the refresh button reads again; the catalog only when its version moved', async () => {
    const { result } = renderPricing();
    await flush();

    getPriceBook.mockResolvedValue(book(110000));
    await act(async () => {
      result.current.refresh();
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(2);
    expect(getPriceBook).toHaveBeenLastCalledWith({ silent: true });
    expect(getPriceCatalog).toHaveBeenCalledTimes(1);
    expect(Number(result.current.usdToman)).toBe(110000);
    expect(result.current.priceMap.bourse__foolad).toBe(540);

    getPriceBook.mockResolvedValue(book(110000, 2500, '', 'k2'));
    getPriceCatalog.mockResolvedValue(catalog('k2', 600));
    await act(async () => {
      result.current.refresh();
    });
    await flush();
    expect(getPriceCatalog).toHaveBeenCalledTimes(2);
    expect(result.current.priceMap.bourse__foolad).toBe(600);
  });

  it('a failed catalog keeps the last one; the core prices still show', async () => {
    const { result } = renderPricing();
    await flush();
    getPriceBook.mockResolvedValue(book(120000, 2500, '', 'k3'));
    getPriceCatalog.mockRejectedValue(new Error('down'));
    await act(async () => {
      result.current.refresh();
    });
    await flush();
    expect(result.current.error).toBeNull();
    expect(Number(result.current.usdToman)).toBe(120000);
    expect(result.current.priceMap.bourse__foolad).toBe(540);
  });

  it('coming back to the app reads again once the prices are a little old', async () => {
    renderPricing();
    await flush();
    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(PRICE_AUTO_REFRESH_GAP_MS);
    });
    await act(async () => {
      setVisibility('visible');
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(2);
  });

  it('does not read again on return when the prices are fresh', async () => {
    renderPricing();
    await flush();
    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(5 * 1000);
      setVisibility('visible');
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(1);
  });

  it('moving to another tab reads again (not twice within the gap)', async () => {
    let navigate;
    const Nav = ({ children }) => {
      navigate = useNavigate();
      return children;
    };
    const wrapper = ({ children }) => React.createElement(MemoryRouter, { initialEntries: ['/app'] },
      React.createElement(PricingProvider, null, React.createElement(Nav, null, children)));
    renderHook(() => usePricing(), { wrapper });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(PRICE_AUTO_REFRESH_GAP_MS);
      navigate('/app/expenses');
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(2);

    await act(async () => {
      navigate('/app/incomes');
    });
    await flush();
    expect(getPriceBook).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good prices and reports an error when a refresh fails', async () => {
    const { result } = renderPricing();
    await flush();
    const firstUpdate = result.current.lastUpdatedAt;

    getPriceBook.mockRejectedValue(new Error('network down'));
    await act(async () => {
      result.current.refresh();
    });
    await flush();

    expect(result.current.error).toBe('network down');
    expect(result.current.globalSettings.announcement).toBe('first');
    expect(result.current.priceMap.usd).toBe(100000);
    expect(Number(result.current.usdToman)).toBe(100000);
    expect(result.current.lastUpdatedAt).toBe(firstUpdate);

    // A later successful refresh clears the error
    getPriceBook.mockResolvedValue(book(120000, 2500, 'second'));
    await act(async () => {
      result.current.refresh();
    });
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.globalSettings.announcement).toBe('second');
  });

  it("the calculator's rates always follow the book (no hand-typed rate any more)", async () => {
    const { result } = renderPricing();
    await flush();
    expect(result.current.setUsdToman).toBeUndefined();
    getPriceBook.mockResolvedValue(book(130000, 2700));
    await act(async () => {
      result.current.refresh();
    });
    await flush();
    expect(Number(result.current.usdToman)).toBe(130000);
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
    expect(result.current.market.usdToman).toBe(100000);
    expect(result.current.market.globalSettings.announcement).toBe('first');
    // The calculator's currencies are the book's prices
    expect(result.current.market.calcData.currencies.find((c) => c.code === 'TRY').toman_price).toBe(2000);
  });

  it('follows every refresh', async () => {
    const { result } = renderMarketData();
    await flush();
    getPriceBook.mockResolvedValue(book(110000));
    await act(async () => {
      result.current.pricing.refresh();
    });
    await flush();
    expect(result.current.market.usdToman).toBe(110000);
  });
});

describe('prices come from the price book only', () => {
  it('exposes the book\'s prices by id, and resolves old stored ids', async () => {
    const { result } = renderPricing();
    await flush();
    expect(result.current.priceMap).toEqual({ usd: 100000, try: 2000, ons_gold: 250000000, bourse__foolad: 540 });
    expect(result.current.getAssetPrice('try')).toBe(2000);
    expect(result.current.getAssetPrice('TRY')).toBe(2000);
    expect(result.current.getAssetPrice('src_def_usd')).toBe(100000);
    expect(result.current.getAsset('forex_try')?.name).toBe('لیر');
  });

});
