/**
 * portfolioFundsRate.test.js — the dollar rate of a past day, read off the price history series
 */
import { describe, it, expect, vi } from 'vitest';

const sparks = vi.hoisted(() => ({ res: null }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => ({ getSparklines: vi.fn(async () => sparks.res) }));
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({ getPortfolios: vi.fn() }));
vi.mock('../../../web/src/shared/vault/vaultPortfolioItems.js', () => ({}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({ getPortfolioKey: vi.fn(), isAccountVaultPortfolio: () => true }));
const { rateOnDay } = await import('../../../web/src/shared/vault/portfolioFunds.js');

describe('rateOnDay', () => {
  it('picks the bucket of that day, null before the history starts', async () => {
    const day = 86_400_000;
    const since = new Date(Date.UTC(2026, 8, 1)).toISOString();
    // 12-hour buckets from Sep 1: two points a day
    sparks.res = { bucketSec: 43_200, sparklines: { usd: { since, points: Array.from({ length: 60 }, (_, i) => 100_000 + i * 100) } } };
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 8, 30));
    try {
      const rate = await rateOnDay('usd', '2026-09-10');
      expect(rate).toBeGreaterThanOrEqual(100_000 + 18 * 100);
      expect(rate).toBeLessThanOrEqual(100_000 + 21 * 100);
      expect(await rateOnDay('usd', '2026-08-01')).toBeNull();
      sparks.res = { bucketSec: 43_200, sparklines: {} };
      expect(await rateOnDay('usd', '2026-09-10')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    expect(day).toBe(86_400_000);
  });
});
