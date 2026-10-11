/**
 * portfolioHistory.test.js — the portfolio's daily value: quantity from the ledger entries, price
 * from the history of each day, scaled to the holding's unit, and the dollar view
 */
import { describe, it, expect } from 'vitest';
import { buildAssetLedgers } from '../../../web/src/features/portfolio/utils/assetLedger.js';
import { buildPortfolioSeries, daysBetween, sliceSeries } from '../../../web/src/features/portfolio/utils/portfolioHistory.js';

const PRICES = { usd: 100_000 };
const ledger = (holdings, transactions = []) => buildAssetLedgers({ holdings, transactions, priceMap: PRICES }).assets;
const hold = (amount, buyDate) => ({ id: `h${amount}${buyDate}`, assetId: 'usd', amount, buyPrice: 50_000, buyDate });
const tx = (type, quantity, transactionDate) => ({ id: `t${type}${transactionDate}`, assetId: 'usd', transactionType: type, quantity, unitPrice: 60_000, transactionDate });
// The dollar costs 100 000 on the 1st, +10 000 each day after
const priceAt = (id, day) => (id === 'usd' ? 100_000 + (Number(day.slice(8)) - 1) * 10_000 : null);

describe('daysBetween', () => {
  it('lists both ends, across a month', () => {
    expect(daysBetween('2026-01-30', '2026-02-02')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });
});

describe('buildPortfolioSeries', () => {
  it('values the quantity held each day at that day\'s price', () => {
    const assets = ledger([hold(10, '2026-03-01')], [tx('buy', 5, '2026-03-03'), tx('sell', 12, '2026-03-04')]);
    assets[0].unitRealPrice = priceAt('usd', '2026-03-05');
    const s = buildPortfolioSeries({ assets, priceAt, today: '2026-03-05' });
    expect(s.days[0]).toBe('2026-03-01');
    // 10 on the 1st-2nd, 15 on the 3rd, 3 from the 4th
    expect(s.toman).toEqual([10 * 100_000, 10 * 110_000, 15 * 120_000, 3 * 130_000, 3 * 140_000]);
    expect(s.estimated).toBe(false);
  });

  it('scales the history to the holding\'s unit', () => {
    const assets = ledger([hold(10, '2026-03-01')]);
    assets[0].unitRealPrice = 280_000; // today's price in the holding's unit: twice the history's 140 000
    const s = buildPortfolioSeries({ assets, priceAt, today: '2026-03-05' });
    expect(s.toman[0]).toBe(10 * 100_000 * 2);
    expect(s.toman[4]).toBe(10 * 280_000);
  });

  it('divides by the dollar\'s rate of the day for the dollar view', () => {
    const assets = ledger([hold(10, '2026-03-01')]);
    assets[0].unitRealPrice = priceAt('usd', '2026-03-03'); // today's live price matches the history's last
    const s = buildPortfolioSeries({ assets, priceAt, usdAt: (d) => priceAt('usd', d), today: '2026-03-03' });
    expect(s.usd).toEqual([10, 10, 10]);
  });

  it('values an asset with no history at today\'s price and says so', () => {
    const assets = ledger([hold(2, '2026-03-01')]);
    const s = buildPortfolioSeries({ assets, priceAt: () => null, today: '2026-03-02' });
    expect(s.toman).toEqual([200_000, 200_000]);
    expect(s.estimated).toBe(true);
  });

  it('returns null when no entry has a date', () => {
    expect(buildPortfolioSeries({ assets: ledger([hold(1, '')]), priceAt, today: '2026-03-05' })).toBeNull();
  });
});

describe('sliceSeries', () => {
  it('keeps the last days', () => {
    const s = { days: ['a', 'b', 'c'], toman: [1, 2, 3], usd: [4, 5, 6] };
    expect(sliceSeries(s, 2)).toMatchObject({ days: ['b', 'c'], toman: [2, 3], usd: [5, 6] });
    expect(sliceSeries(s, 0)).toBe(s);
  });
});
