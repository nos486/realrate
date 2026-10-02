/**
 * assetLedger.test.js — one ledger per asset, FIFO: manual records and buys open lots, sells and
 * spends take from the oldest first; unpriced lots give no P&L; every entry knows what it did
 */
import { describe, it, expect } from 'vitest';
import { buildAssetLedgers, replayLedger, sortableDate } from '../../../web/src/features/portfolio/utils/assetLedger.js';
import { calculateComputedHoldings } from '../../../web/src/features/transactions/utils/calculationEngine.js';

const PRICES = { usd: 100_000, gold_18k: 4_000_000 };
const manual = (id, amount, buyPrice, buyDate = '1405/01/01', extra = {}) => ({ id, assetId: 'usd', amount, buyPrice, buyDate, ...extra });
const tx = (id, transactionType, quantity, unitPrice, transactionDate, extra = {}) => ({ id, assetId: 'usd', transactionType, quantity, unitPrice, transactionDate, ...extra });
const usd = (input) => buildAssetLedgers({ priceMap: PRICES, ...input }).assets.find((a) => a.assetId === 'usd');

describe('FIFO ledger', () => {
  it('a sale takes from the oldest lot first and realizes against its price', () => {
    const asset = usd({
      holdings: [manual('h1', 100, 50_000, '1405/01/01')],
      transactions: [tx('t1', 'buy', 100, 70_000, '1405/02/01'), tx('t2', 'sell', 150, 90_000, '1405/03/01')],
    });
    expect(asset.amount).toBe(50);
    expect(asset.buyPrice).toBe(70_000); // what is left is from the second lot
    expect(asset.itemCost).toBe(3_500_000);
    expect(asset.realizedPnl).toBe(100 * 40_000 + 50 * 20_000);
    const sale = asset.entries.find((e) => e.id === 't2');
    expect(sale.consumed).toEqual([
      { lotId: 'h1', lotKind: 'manual', lotDate: '1405/01/01', qty: 100, lotPrice: 50_000, pnl: 4_000_000 },
      { lotId: 't1', lotKind: 'buy', lotDate: '1405/02/01', qty: 50, lotPrice: 70_000, pnl: 1_000_000 },
    ]);
    expect(asset.entries.find((e) => e.id === 'h1').remaining).toBe(0);
    expect(asset.entries.find((e) => e.id === 't1').remaining).toBe(50);
  });

  it('from a lot without a price: only the quantity, no profit or loss', () => {
    const asset = usd({
      holdings: [manual('h1', 100, 0, '1405/01/01')],
      transactions: [tx('t1', 'buy', 100, 70_000, '1405/02/01'), tx('t2', 'sell', 120, 90_000, '1405/03/01')],
    });
    const sale = asset.entries.find((e) => e.id === 't2');
    expect(sale.unpricedQty).toBe(100);
    expect(sale.pnl).toBe(20 * 20_000);
    expect(asset.amount).toBe(80);
    expect(asset.hasBuyPrice).toBe(true);
    expect(asset.partialCost).toBe(false);
  });

  it('a sale entirely from unpriced lots has no P&L', () => {
    const asset = usd({ holdings: [manual('h1', 100, 0)], transactions: [tx('t1', 'sell', 40, 90_000, '1405/03/01')] });
    expect(asset.entries.find((e) => e.id === 't1').pnl).toBeNull();
    expect(asset.realizedPnl).toBeNull();
    expect(asset).toMatchObject({ amount: 60, hasBuyPrice: false, itemPnl: null });
  });

  it('a spend (paying an expense) takes like a sale, at its rate', () => {
    const asset = usd({ transactions: [tx('t1', 'buy', 100, 50_000, '1405/02/01'), tx('t2', 'spend', 40, 80_000, '1405/03/01', { expenseId: 'exp_1' })] });
    expect(asset.amount).toBe(60);
    expect(asset.realizedPnl).toBe(40 * 30_000);
  });

  it('open value and P&L cover the priced lots; unpriced ones count in the quantity', () => {
    const asset = usd({ holdings: [manual('h1', 50, 0, ''), manual('h2', 50, 60_000, '1405/02/01')] });
    expect(asset).toMatchObject({ amount: 100, pricedQty: 50, unpricedQty: 50, itemCost: 3_000_000, itemRealVal: 10_000_000, partialCost: true });
    expect(asset.itemPnl).toBe(50 * 100_000 - 3_000_000);
  });

  it('undated manual records open the ledger; both calendars sort together', () => {
    const asset = usd({
      holdings: [manual('h1', 10, 50_000, '')],
      transactions: [tx('t1', 'sell', 10, 60_000, '2026-01-05'), tx('t2', 'buy', 5, 55_000, '1404/12/01')],
    });
    expect(asset.entries.map((e) => e.id)).toEqual(['h1', 't1', 't2']);
    expect(asset.entries.find((e) => e.id === 't1').consumed[0].lotId).toBe('h1');
    expect(asset.amount).toBe(5);
    expect(sortableDate('۱۴۰۵/۰۷/۰۴')).toBe('2026-09-26');
  });

  it('warns when more goes out than was held; a later buy covers it first', () => {
    const { assets, warnings } = buildAssetLedgers({ priceMap: PRICES, transactions: [tx('t1', 'sell', 30, 90_000, '1405/01/01')] });
    expect(warnings[0]).toMatchObject({ assetId: 'usd', deficit: 30 });
    expect(assets[0].amount).toBe(0);
    const { entries, deficit } = replayLedger([
      { kind: 'sell', id: 's', date: '1405/01/01', qty: 30, price: 90_000 },
      { kind: 'buy', id: 'b', date: '1405/02/01', qty: 50, price: 70_000 },
    ]);
    expect(deficit).toBe(0);
    expect(entries.find((e) => e.id === 'b').remaining).toBe(20);
  });

  it('on one day, what comes in is counted before what goes out', () => {
    const asset = usd({ transactions: [tx('t2', 'sell', 10, 60_000, '1405/05/01'), tx('t1', 'buy', 10, 50_000, '1405/05/01')] });
    expect(asset.amount).toBe(0);
    expect(asset.realizedPnl).toBe(100_000);
  });

  it('summary: cost and P&L of what is held, realized of everything', () => {
    const { summary } = buildAssetLedgers({
      priceMap: PRICES,
      holdings: [manual('h1', 10, 50_000)],
      transactions: [tx('t1', 'sell', 5, 60_000, '1405/05/01'), { id: 'g', assetId: 'gold_18k', transactionType: 'buy', quantity: 2, unitPrice: 3_000_000, transactionDate: '1405/01/01' }],
    });
    expect(summary.totalCost).toBe(5 * 50_000 + 2 * 3_000_000);
    expect(summary.totalRealValue).toBe(5 * 100_000 + 2 * 4_000_000);
    expect(summary.totalRealizedPnl).toBe(50_000);
    expect(summary.count).toBe(2);
  });
});

describe('calculateComputedHoldings (positions for the sell form and portfolio funds)', () => {
  it('reports positions with manual records included', () => {
    const { positions, computedHoldings } = calculateComputedHoldings(
      [tx('t1', 'sell', 300, 90_000, '1405/05/01')], PRICES, { manualLots: [manual('h1', 1000, 60_000)] });
    expect(positions.get('usd')).toMatchObject({ amount: 700, averageCost: 60_000, cost: 42_000_000, realizedPnl: 9_000_000 });
    expect(computedHoldings).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(calculateComputedHoldings(null).positions.size).toBe(0);
    expect(calculateComputedHoldings([null, {}, { assetId: '' }]).computedHoldings).toEqual([]);
  });
});

describe('units', () => {
  it('the same asset in two units is two ledgers', () => {
    const { assets } = buildAssetLedgers({
      priceMap: PRICES,
      holdings: [
        { id: 'a', assetId: 'gold_18k', amount: 1, buyPrice: 10, unit: 'گرم' },
        { id: 'b', assetId: 'gold_18k', amount: 1, buyPrice: 10, unit: 'مثقال' },
      ],
    });
    expect(assets).toHaveLength(2);
    expect(new Set(assets.map((a) => a.id)).size).toBe(2);
  });

  it('a transaction without a unit joins the asset\'s default unit', () => {
    const { assets } = buildAssetLedgers({
      priceMap: PRICES,
      holdings: [manual('h1', 10, 50_000)],
      transactions: [tx('t1', 'sell', 4, 60_000, '1405/05/01')],
    });
    expect(assets).toHaveLength(1);
    expect(assets[0].amount).toBe(6);
  });
});
