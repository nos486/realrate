/**
 * portfolioFundsRate.test.js — the price of a past day from the daily history
 * (GET /api/prices/on-day, features/market/priceOnDay.js), as rateOnDay gives it to the forms
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ getPricesOnDay: vi.fn() }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => api);
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({ getPortfolios: vi.fn() }));
vi.mock('../../../web/src/shared/vault/vaultPortfolioItems.js', () => ({}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({ getPortfolioKey: vi.fn(), isAccountVaultPortfolio: () => true }));
const { rateOnDay } = await import('../../../web/src/shared/vault/portfolioFunds.js');
const { priceOnDay, clearPriceOnDayCache } = await import('../../../web/src/features/market/priceOnDay.js');

beforeEach(() => {
  clearPriceOnDayCache();
  api.getPricesOnDay.mockReset();
});

describe('rateOnDay', () => {
  it("asks for that day's price and rounds it", async () => {
    api.getPricesOnDay.mockResolvedValue({ prices: { usd: { value: 101_234.6, day: '2025-03-01' } } });
    expect(await rateOnDay('usd', '2025-03-02')).toBe(101_235);
    expect(api.getPricesOnDay).toHaveBeenCalledWith(['usd'], '2025-03-02', { silent: true });
  });

  it('is null when the history has nothing for it, or the request fails', async () => {
    api.getPricesOnDay.mockResolvedValueOnce({ prices: {} });
    expect(await rateOnDay('usd', '2020-01-01')).toBeNull();
    api.getPricesOnDay.mockRejectedValueOnce(new Error('offline'));
    expect(await rateOnDay('usd', '2020-01-02')).toBeNull();
  });
});

describe('priceOnDay', () => {
  it('keeps a past day: one request for repeated and concurrent asks', async () => {
    api.getPricesOnDay.mockResolvedValue({ prices: { usd: { value: 90_000, day: '2025-01-10' } } });
    const [a, b] = await Promise.all([priceOnDay('USD', '2025-01-10'), priceOnDay('usd', '2025-01-10')]);
    expect(await priceOnDay('usd', '2025-01-10')).toBe(90_000);
    expect([a, b]).toEqual([90_000, 90_000]);
    expect(api.getPricesOnDay).toHaveBeenCalledTimes(1);
  });

  it('does not keep an empty answer, and ignores a bad date', async () => {
    api.getPricesOnDay.mockResolvedValueOnce({ prices: {} }).mockResolvedValueOnce({ prices: { usd: { value: 1, day: '2025-01-11' } } });
    expect(await priceOnDay('usd', '2025-01-11')).toBeNull();
    expect(await priceOnDay('usd', '2025-01-11')).toBe(1);
    expect(await priceOnDay('usd', '1404/01/01')).toBeNull();
    expect(api.getPricesOnDay).toHaveBeenCalledTimes(2);
  });
});
