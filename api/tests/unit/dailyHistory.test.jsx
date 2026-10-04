// @vitest-environment happy-dom
/**
 * dailyHistory.test.jsx — Past prices read in the browser off an asset's whole daily history
 * (GET /api/prices/history, features/market/dailyHistory.js): one request per asset, any date
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ getPriceHistory: vi.fn() }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => api);
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({ getPortfolios: vi.fn() }));
vi.mock('../../../web/src/shared/vault/vaultPortfolioItems.js', () => ({}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({ getPortfolioKey: vi.fn(), isAccountVaultPortfolio: () => true }));
const { historyPriceAt, loadDailyHistory, priceOnDay, clearDailyHistoryCache, useUsdAt } = await import('../../../web/src/features/market/dailyHistory.js');
const { rateOnDay } = await import('../../../web/src/shared/vault/portfolioFunds.js');

beforeEach(() => {
  clearDailyHistoryCache();
  api.getPriceHistory.mockReset();
});
const usdHistory = { available: true, key: 'usd', since: '2025-03-01', values: [100, 110, 120.6] };

describe('historyPriceAt', () => {
  const history = { sinceMs: Date.UTC(2025, 2, 1), values: [100, 110, 120] };
  it("reads a day's close, the latest after the history, null before it", () => {
    expect(historyPriceAt(history, '2025-03-02')).toBe(110);
    expect(historyPriceAt(history, '2025-03-02T10:00:00')).toBe(110);
    expect(historyPriceAt(history, '2026-01-01')).toBe(120);
    expect(historyPriceAt(history, '2025-02-28')).toBeNull();
    expect(historyPriceAt(history, '')).toBeNull();
    expect(historyPriceAt(null, '2025-03-02')).toBeNull();
  });
});

describe('loading', () => {
  it('one request per asset, shared by concurrent and later asks', async () => {
    api.getPriceHistory.mockResolvedValue(usdHistory);
    const [a, b] = await Promise.all([priceOnDay('USD', '2025-03-02'), priceOnDay('usd', '2025-03-03')]);
    expect([a, b]).toEqual([110, 120.6]);
    expect(await rateOnDay('usd', '2025-03-03')).toBe(121);
    expect(api.getPriceHistory).toHaveBeenCalledTimes(1);
    expect(api.getPriceHistory).toHaveBeenCalledWith('usd', { silent: true });
  });

  it('an asset without history is null; an unavailable answer or a failure is not kept', async () => {
    api.getPriceHistory.mockResolvedValueOnce({ available: true, since: null, values: [] });
    expect(await loadDailyHistory('nope')).toBeNull();
    api.getPriceHistory.mockResolvedValueOnce({ available: false, values: [] }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(usdHistory);
    expect(await priceOnDay('usd', '2025-03-01')).toBeNull();
    expect(await priceOnDay('usd', '2025-03-01')).toBeNull();
    expect(await priceOnDay('usd', '2025-03-01')).toBe(100);
  });
});

describe('useUsdAt', () => {
  function Rate({ date, enabled = true }) {
    const usdAt = useUsdAt(enabled);
    return <span>{String(usdAt(date))}</span>;
  }

  it('renders the rate of a date once the history arrives', async () => {
    api.getPriceHistory.mockResolvedValue(usdHistory);
    render(<Rate date="2025-03-02" />);
    expect(screen.getByText('null')).toBeDefined();
    await waitFor(() => expect(screen.getByText('110')).toBeDefined());
  });

  it('loads nothing when not needed', () => {
    render(<Rate date="2025-03-02" enabled={false} />);
    expect(api.getPriceHistory).not.toHaveBeenCalled();
  });
});
