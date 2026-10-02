/**
 * unifiedLedger.test.js — one ledger per asset: manual holdings are opening buys, sales and
 * spends take from them, unknown-cost lots stay out of the average, and the rows add up
 */
import { describe, it, expect } from 'vitest';
import { calculateComputedHoldings } from '../../../web/src/features/transactions/utils/calculationEngine.js';
import { aggregateHoldings } from '../../../web/src/features/portfolio/utils/holdingAggregates.js';

const PRICES = { usd: 100_000 };
const manual = (id, amount, buyPrice, buyDate = '1405/01/01') => ({ id, assetId: 'usd', amount, buyPrice, buyDate });
const tx = (transactionType, quantity, unitPrice, transactionDate, extra = {}) => ({ assetId: 'usd', transactionType, quantity, unitPrice, transactionDate, ...extra });

/** Manual rows as HoldingsView shows them, plus the computed row: the asset's total */
function shownRows(manualLots, row) {
  const manualRows = manualLots.map((l) => {
    const hasBuyPrice = l.buyPrice > 0;
    const itemCost = hasBuyPrice ? l.amount * l.buyPrice : 0;
    return { ...l, unit: 'دلار', hasBuyPrice, itemCost, itemRealVal: l.amount * PRICES.usd, itemPnl: hasBuyPrice ? l.amount * PRICES.usd - itemCost : null };
  });
  return row ? [...manualRows, { ...row, unit: 'دلار' }] : manualRows;
}

describe('unified ledger', () => {
  it('a sale takes from the manual dollars; manual rows + the computed row = the real position', () => {
    const lots = [manual('h1', 1000, 60_000)];
    const { computedHoldings, positions, warnings, summary } = calculateComputedHoldings(
      [tx('sell', 300, 90_000, '1405/05/01')], PRICES, { manualLots: lots });
    expect(warnings).toEqual([]);
    expect(positions.get('usd')).toMatchObject({ amount: 700, averageCost: 60_000, cost: 42_000_000 });
    expect(summary.totalRealizedPnl).toBe(300 * 30_000);
    const [row] = computedHoldings;
    expect(row).toMatchObject({ amount: -300, itemCost: -18_000_000, adjustsManual: true });
    const [total] = aggregateHoldings(shownRows(lots, row));
    expect(total.amount).toBe(700);
    expect(total.itemCost).toBe(42_000_000);
    expect(total.itemRealVal).toBe(70_000_000);
    expect(total.itemPnl).toBe(70_000_000 - 42_000_000);
  });

  it('a spend (paying an expense) is valued at its day\'s rate and realizes P&L like a sale', () => {
    const { positions, summary } = calculateComputedHoldings(
      [tx('buy', 100, 50_000, '1405/02/01'), tx('spend', 40, 80_000, '1405/03/01', { expenseId: 'exp_1' })], PRICES);
    expect(positions.get('usd').amount).toBe(60);
    expect(summary.totalRealizedPnl).toBe(40 * 30_000);
  });

  it('only warns when sales exceed everything held, manual lots included', () => {
    const lots = [manual('h1', 100, 60_000)];
    expect(calculateComputedHoldings([tx('sell', 100, 70_000, '1405/05/01')], PRICES, { manualLots: lots }).warnings).toEqual([]);
    const over = calculateComputedHoldings([tx('sell', 150, 70_000, '1405/05/01')], PRICES, { manualLots: lots });
    expect(over.warnings[0]).toMatchObject({ deficit: 50 });
    // The rows cancel out to nothing held
    const [total] = aggregateHoldings(shownRows(lots, over.computedHoldings[0]));
    expect(total.amount).toBe(0);
  });

  it('unknown-cost lots count in the quantity, not in the average or P&L', () => {
    const lots = [manual('h1', 100, 0)];
    const { positions, computedHoldings } = calculateComputedHoldings(
      [tx('buy', 100, 50_000, '1405/02/01'), tx('sell', 50, 70_000, '1405/03/01')], PRICES, { manualLots: lots });
    const position = positions.get('usd');
    expect(position.amount).toBe(150);
    expect(position.averageCost).toBe(50_000);
    expect(position.pricedQty).toBe(75);
    expect(position.unpricedQty).toBe(75);
    const [total] = aggregateHoldings(shownRows(lots, computedHoldings[0]));
    expect(total.amount).toBe(150);
    expect(total.itemCost).toBe(75 * 50_000);
  });

  it('orders Shamsi and Gregorian dates together; undated manual lots open the ledger', () => {
    const lots = [manual('h1', 10, 50_000, '')];
    const { warnings, positions } = calculateComputedHoldings(
      [tx('sell', 10, 60_000, '2026-01-05'), tx('buy', 5, 55_000, '1404/12/01')], PRICES, { manualLots: lots });
    expect(warnings).toEqual([]);
    expect(positions.get('usd').amount).toBe(5);
  });

  it('assets without manual lots behave as before', () => {
    const { computedHoldings } = calculateComputedHoldings([tx('buy', 10, 50_000, '1405/01/01')], PRICES, { manualLots: [manual('h1', 5, 1)].map((l) => ({ ...l, assetId: 'eur' })) });
    expect(computedHoldings[0]).toMatchObject({ amount: 10, itemCost: 500_000, adjustsManual: false });
  });
});
