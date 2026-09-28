/**
 * holdingAggregates.test.js — every lot of the same asset added up into one row: total held,
 * weighted average buy price, value and P&L
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../web/src/features/portfolio/portfolioLayoutModel.js', () => ({
  getAssetKey: (item) => item.assetId,
}));

const { aggregateHoldings } = await import('../../../web/src/features/portfolio/utils/holdingAggregates.js');

const lot = (assetId, amount, buyPrice, unitRealPrice, extra = {}) => {
  const hasBuyPrice = buyPrice > 0;
  const itemCost = hasBuyPrice ? amount * buyPrice : 0;
  const itemRealVal = amount * unitRealPrice;
  return {
    id: `${assetId}-${amount}-${buyPrice}`, assetId, assetName: assetId, unit: 'عدد', amount, buyPrice,
    hasBuyPrice, itemCost, itemRealVal, itemPnl: hasBuyPrice ? itemRealVal - itemCost : null, unitRealPrice, ...extra,
  };
};

describe('aggregateHoldings', () => {
  it('adds up lots of the same asset with a weighted average buy price', () => {
    const [coin, usd] = aggregateHoldings([
      lot('coin', 2, 100, 150, { buyDate: '1404/1/5' }),
      lot('usd', 10, 50, 60),
      lot('coin', 3, 120, 150, { buyDate: '1405/07/01', source: 'transactions' }),
    ]);
    expect(coin).toMatchObject({
      amount: 5, lotCount: 2, itemCost: 560, itemRealVal: 750, itemPnl: 190,
      firstDate: '1404/01/05', lastDate: '1405/07/01', source: 'aggregate', partialCost: false,
    });
    expect(coin.buyPrice).toBeCloseTo(112);
    expect(coin.itemPnlPct).toBeCloseTo(33.9);
    expect(usd).toMatchObject({ amount: 10, lotCount: 1 });
  });

  it('averages and totals P&L only over lots with a buy price, but values everything held', () => {
    const [coin] = aggregateHoldings([lot('coin', 2, 100, 150), lot('coin', 3, 0, 150)]);
    expect(coin).toMatchObject({ amount: 5, buyPrice: 100, itemCost: 200, itemRealVal: 750, itemPnl: 100, partialCost: true, hasBuyPrice: true });
  });

  it('keeps an asset without any buy price free of P&L', () => {
    const [coin] = aggregateHoldings([lot('coin', 1, 0, 150), lot('coin', 1, 0, 150)]);
    expect(coin).toMatchObject({ amount: 2, hasBuyPrice: false, itemPnl: null, itemPnlPct: null });
  });

  it('keeps the same asset in different units apart', () => {
    const rows = aggregateHoldings([lot('gold', 1, 10, 20, { unit: 'گرم' }), lot('gold', 1, 10, 20, { unit: 'مثقال' })]);
    expect(rows).toHaveLength(2);
  });
});
