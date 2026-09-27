/**
 * compareAssetPnl.test.js — "What if I had bought something else with the same money"
 * (web/src/features/portfolio/utils/holdingHelpers.js computeCompareAssetPnl)
 */

import { describe, it, expect } from 'vitest';
import { computeCompareAssetPnl } from '../../../web/src/features/portfolio/utils/holdingHelpers.js';

// Today: gold 18k at 8,000,000 toman a gram
const priceMap = { gold_18k: 8000000 };
const itemMap = { gold_18k: { id: 'gold_18k', name: 'طلای ۱۸ عیار', unit: 'گرم', category: 'other', price: 8000000 } };

describe('computeCompareAssetPnl', () => {
  it('values the same Toman cost as the comparison asset bought on the purchase day', () => {
    // 100M toman of dollars, worth 120M today; gold was 5M a gram that day
    const info = computeCompareAssetPnl(
      { compareAssetId: 'gold_18k', comparePriceToman: 5000000, itemCost: 100000000, itemRealVal: 120000000 },
      priceMap,
      itemMap,
    );
    expect(info.compareQuantity).toBe(20); // 100M / 5M = 20 g
    expect(info.compareCurrentValue).toBe(160000000); // 20 g × 8M
    expect(info.comparePnl).toBe(-40000000); // the dollars did 40M worse than gold
    expect(info.comparePnlPct).toBe(-25);
    expect(info.compareAssetName).toBe('طلای ۱۸ عیار');
    expect(info.unit).toBe('گرم');
  });

  it('shows nothing without a comparison, a price on the day, a cost, or a price today', () => {
    const base = { compareAssetId: 'gold_18k', comparePriceToman: 5000000, itemCost: 100, itemRealVal: 100 };
    expect(computeCompareAssetPnl({ ...base, compareAssetId: '' }, priceMap, itemMap)).toBeNull();
    expect(computeCompareAssetPnl({ ...base, comparePriceToman: 0 }, priceMap, itemMap)).toBeNull();
    expect(computeCompareAssetPnl({ ...base, itemCost: 0 }, priceMap, itemMap)).toBeNull();
    expect(computeCompareAssetPnl({ ...base, compareAssetId: 'unknown_asset' }, priceMap, itemMap)).toBeNull();
  });
});
