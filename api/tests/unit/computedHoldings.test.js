import { describe, it, expect } from 'vitest';
import { calculateComputedHoldings } from '../../../web/src/features/transactions/utils/calculationEngine.js';

describe('Computed Holdings Engine - Weighted Average Cost & Aggregation', () => {
  it('correctly calculates Weighted Average Cost for multiple buys with different prices', () => {
    const transactions = [
      {
        assetId: 'gold_18k',
        assetName: 'طلای ۱۸ عیار',
        transactionType: 'buy',
        quantity: 10, // 10 grams @ 3,000,000
        unitPrice: 3000000,
        unit: 'گرم',
        transactionDate: '1403/01/10',
      },
      {
        assetId: 'gold_18k',
        assetName: 'طلای ۱۸ عیار',
        transactionType: 'buy',
        quantity: 20, // 20 grams @ 3,600,000
        unitPrice: 3600000,
        unit: 'گرم',
        transactionDate: '1403/02/15',
      },
    ];

    // Total cost = (10 * 3,000,000) + (20 * 3,600,000) = 30,000,000 + 72,000,000 = 102,000,000
    // Total qty = 30
    // Weighted avg price = 102,000,000 / 30 = 3,400,000
    const livePriceMap = { gold_18k: 4000000 };
    const { computedHoldings, warnings } = calculateComputedHoldings(transactions, livePriceMap);

    expect(warnings).toHaveLength(0);
    expect(computedHoldings).toHaveLength(1);

    const gold = computedHoldings[0];
    expect(gold.assetId).toBe('gold_18k');
    expect(gold.amount).toBe(30);
    expect(gold.buyPrice).toBe(3400000);
    expect(gold.unitRealPrice).toBe(4000000);
    expect(gold.itemCost).toBe(102000000);
    expect(gold.itemRealVal).toBe(120000000);
    expect(gold.itemPnl).toBe(18000000);
    expect(gold.itemPnlPct).toBeCloseTo(17.6, 1);
    expect(gold.source).toBe('transactions');
  });

  it('keeps weighted average purchase price unchanged after partial sales', () => {
    const transactions = [
      {
        assetId: 'bourse_فولاد',
        assetName: 'فولاد مبارکه',
        transactionType: 'buy',
        quantity: 1000,
        unitPrice: 500,
        unit: 'برگ سهم',
      },
      {
        assetId: 'bourse_فولاد',
        assetName: 'فولاد مبارکه',
        transactionType: 'buy',
        quantity: 1000,
        unitPrice: 700,
        unit: 'برگ سهم',
      },
      // Weighted avg: (500,000 + 700,000) / 2000 = 600
      // Now partial sale of 800 shares
      {
        assetId: 'bourse_فولاد',
        assetName: 'فولاد مبارکه',
        transactionType: 'sell',
        quantity: 800,
        unitPrice: 800,
        unit: 'برگ سهم',
      },
    ];

    const { computedHoldings, warnings } = calculateComputedHoldings(transactions, { 'bourse_فولاد': 900 });

    expect(warnings).toHaveLength(0);
    expect(computedHoldings).toHaveLength(1);

    const foolad = computedHoldings[0];
    expect(foolad.amount).toBe(1200); // 2000 - 800 = 1200
    expect(foolad.buyPrice).toBe(600); // WAC remains 600
    expect(foolad.unitRealPrice).toBe(900);
    expect(foolad.itemCost).toBe(720000); // 1200 * 600
    expect(foolad.itemRealVal).toBe(1080000); // 1200 * 900
    expect(foolad.itemPnl).toBe(360000);
  });

  it('silently removes asset from computed holdings when fully sold (balance = 0)', () => {
    const transactions = [
      {
        assetId: 'coin_bahar',
        assetName: 'سکه بهار آزادی',
        transactionType: 'buy',
        quantity: 5,
        unitPrice: 40000000,
      },
      {
        assetId: 'coin_bahar',
        assetName: 'سکه بهار آزادی',
        transactionType: 'sell',
        quantity: 5,
        unitPrice: 45000000,
      },
    ];

    const { computedHoldings, warnings } = calculateComputedHoldings(transactions);
    expect(warnings).toHaveLength(0);
    expect(computedHoldings).toHaveLength(0);
  });

  it('triggers visible warning and omits asset when sales exceed purchases (negative balance)', () => {
    const transactions = [
      {
        assetId: 'usd',
        assetName: 'دلار آمریکا',
        transactionType: 'buy',
        quantity: 100,
        unitPrice: 60000,
        unit: 'دلار',
      },
      {
        assetId: 'usd',
        assetName: 'دلار آمریکا',
        transactionType: 'sell',
        quantity: 150,
        unitPrice: 65000,
        unit: 'دلار',
      },
    ];

    const { computedHoldings, warnings } = calculateComputedHoldings(transactions);

    // Negative balance asset MUST NOT appear in computedHoldings
    expect(computedHoldings).toHaveLength(0);

    // But warning MUST be produced
    expect(warnings).toHaveLength(1);
    expect(warnings[0].assetId).toBe('usd');
    expect(warnings[0].deficit).toBe(50);
    expect(warnings[0].totalBuyQty).toBe(100);
    expect(warnings[0].totalSellQty).toBe(150);
    expect(warnings[0].message).toContain('موجودی دارایی «دلار آمریکا» منفی است');
  });

  it('handles empty or malformed transactions gracefully', () => {
    const res1 = calculateComputedHoldings([]);
    expect(res1.computedHoldings).toHaveLength(0);
    expect(res1.warnings).toHaveLength(0);

    const res2 = calculateComputedHoldings(null);
    expect(res2.computedHoldings).toHaveLength(0);
    expect(res2.warnings).toHaveLength(0);

    const res3 = calculateComputedHoldings([null, {}, { assetId: '' }]);
    expect(res3.computedHoldings).toHaveLength(0);
  });

  it('dynamically resolves assetName, category, and unit when transactions only contain assetId', () => {
    const transactions = [
      {
        assetId: 'usd',
        transactionType: 'buy',
        quantity: 100,
        unitPrice: 60000,
      },
      {
        assetId: 'gold_18k',
        transactionType: 'buy',
        quantity: 10,
        unitPrice: 4000000,
      },
    ];

    const { computedHoldings } = calculateComputedHoldings(transactions, {
      usd: 62000,
      gold_18k: 4200000,
    });

    expect(computedHoldings).toHaveLength(2);

    const usdItem = computedHoldings.find((h) => h.assetId === 'usd');
    expect(usdItem).toBeDefined();
    expect(usdItem.assetName).toBe('دلار');
    expect(usdItem.unit).toBe('دلار');
    expect(usdItem.category).toBe('currency');
    expect(usdItem.amount).toBe(100);

    const goldItem = computedHoldings.find((h) => h.assetId === 'gold_18k');
    expect(goldItem).toBeDefined();
    expect(goldItem.assetName).toBe('طلای ۱۸ عیار');
    expect(goldItem.unit).toBe('گرم');
    expect(goldItem.category).toBe('gold');
    expect(goldItem.amount).toBe(10);
  });

  describe('moving average cost & realized PnL', () => {
    const tx = (type, quantity, unitPrice, transactionDate, extra = {}) => ({
      assetId: 'gold_18k',
      transactionType: type,
      quantity,
      unitPrice,
      transactionDate,
      ...extra,
    });

    it('starts a fresh average after the position was fully sold and bought again', () => {
      const { computedHoldings, summary } = calculateComputedHoldings(
        [
          tx('buy', 1, 100, '1403/01/01'),
          tx('sell', 1, 150, '1403/02/01'),
          tx('buy', 1, 200, '1403/03/01'),
        ],
        { gold_18k: 200 }
      );
      expect(computedHoldings).toHaveLength(1);
      expect(computedHoldings[0].buyPrice).toBe(200);
      expect(computedHoldings[0].itemCost).toBe(200);
      expect(computedHoldings[0].realizedPnl).toBe(50);
      expect(summary.totalRealizedPnl).toBe(50);
      expect(summary.hasRealizedPnl).toBe(true);
    });

    it('realizes PnL at the average cost on partial sells and keeps the remaining average', () => {
      const { computedHoldings, summary } = calculateComputedHoldings(
        [
          tx('buy', 10, 100, '1403/01/01'),
          tx('buy', 10, 200, '1403/01/05'),
          tx('sell', 5, 300, '1403/02/01'),
          tx('buy', 5, 400, '1403/03/01'),
        ],
        { gold_18k: 400 }
      );
      // avg 150 → sell 5 @300 realizes 750; remaining 15 @150 + 5 @400 → avg 212.5
      expect(summary.totalRealizedPnl).toBe(750);
      expect(computedHoldings[0].amount).toBe(20);
      expect(computedHoldings[0].itemCost).toBeCloseTo(4250);
      expect(computedHoldings[0].buyPrice).toBe(213);
    });

    it('keeps realized PnL of fully closed positions in the summary', () => {
      const { computedHoldings, summary } = calculateComputedHoldings([
        tx('buy', 2, 1000, '1403/01/01'),
        tx('sell', 2, 900, '1403/01/10'),
      ]);
      expect(computedHoldings).toHaveLength(0);
      expect(summary.totalRealizedPnl).toBe(-200);
    });

    it('does not realize PnL for a sell without a price', () => {
      const { summary } = calculateComputedHoldings([
        tx('buy', 2, 1000, '1403/01/01'),
        tx('sell', 1, 0, '1403/01/10'),
      ]);
      expect(summary.hasRealizedPnl).toBe(false);
      expect(summary.totalRealizedPnl).toBe(0);
    });

    it('treats float residue from decimal quantities as a closed position', () => {
      const { computedHoldings, warnings } = calculateComputedHoldings([
        tx('buy', 0.1, 1000, '1403/01/01'),
        tx('buy', 0.2, 1000, '1403/01/02'),
        tx('sell', 0.3, 1200, '1403/01/03'),
      ]);
      expect(computedHoldings).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });

    it('orders a same-day buy before its sell regardless of entry order', () => {
      const { computedHoldings, warnings, summary } = calculateComputedHoldings([
        tx('sell', 1, 150, '1403/01/01', { createdAt: '2024-01-01T10:00:00Z' }),
        tx('buy', 2, 100, '1403/01/01', { createdAt: '2024-01-01T11:00:00Z' }),
      ]);
      expect(warnings).toHaveLength(0);
      expect(computedHoldings[0].amount).toBe(1);
      expect(computedHoldings[0].buyPrice).toBe(100);
      expect(summary.totalRealizedPnl).toBe(50);
    });

    it('scales the reference-asset quantity with sells and resets it with the position', () => {
      const ref = { referenceAssetId: 'usd', referenceQuantity: 10 };
      const partial = calculateComputedHoldings([
        tx('buy', 4, 100, '1403/01/01', ref),
        tx('sell', 1, 100, '1403/01/02'),
      ]);
      expect(partial.computedHoldings[0].referenceAssetId).toBe('usd');
      expect(partial.computedHoldings[0].referenceQuantity).toBeCloseTo(7.5);

      const reopened = calculateComputedHoldings([
        tx('buy', 4, 100, '1403/01/01', ref),
        tx('sell', 4, 100, '1403/01/02'),
        tx('buy', 1, 100, '1403/01/03'),
      ]);
      // The old usd-funded lot is gone, so the new position has no reference asset
      expect(reopened.computedHoldings[0].referenceAssetId).toBe('');
    });
  });
});
