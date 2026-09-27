/**
 * holdingsCsvRoundTrip.test.js — A portfolio exported to CSV imports back with the same holding,
 * including "paid with another asset" (reference) and "compare with another asset" (compare)
 */

import { describe, it, expect } from 'vitest';
import { buildHoldingsCsv, parseCsvText, buildRows } from '../../../web/src/features/portfolio/utils/holdingsCsv.js';

function importCsv(csv) {
  const [headerRow, ...dataRows] = parseCsvText(csv.replace(/^﻿/, '')).filter((r) => r.length > 1);
  const headerIndex = Object.fromEntries(headerRow.map((h, i) => [h.trim(), i]));
  return buildRows(headerIndex, dataRows);
}

describe('portfolio CSV round trip', () => {
  it('keeps the reference and comparison assets', () => {
    const item = {
      assetId: 'gold_18k',
      assetName: 'طلای ۱۸ عیار',
      category: 'gold',
      amount: 5,
      unit: 'گرم',
      buyPrice: 6000000,
      hasBuyPrice: true,
      itemCost: 30000000,
      unitRealPrice: 8000000,
      itemRealVal: 40000000,
      itemPnl: 10000000,
      itemPnlPct: 33.3,
      buyDate: '1404/01/15',
      notes: 'خرید با دلار',
      source: 'manual',
      referenceAssetId: 'usd',
      referenceQuantity: 512,
      compareAssetId: 'bourse__فولاد',
      comparePriceToman: 500,
      comparePnlInfo: { compareCurrentValue: 42000000 },
    };

    const rows = importCsv(buildHoldingsCsv([item]));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ok');
    expect(rows[0].holding).toMatchObject({
      assetId: 'gold_18k',
      amount: 5,
      buyPrice: 6000000,
      buyDate: '1404/01/15',
      notes: 'خرید با دلار',
      referenceAssetId: 'usd',
      referenceQuantity: 512,
      compareAssetId: 'bourse__فولاد',
      comparePriceToman: 500,
    });
  });

  it('imports a holding without either', () => {
    const rows = importCsv(buildHoldingsCsv([{ assetId: 'usd', amount: 100, buyPrice: 50000, hasBuyPrice: true, source: 'manual' }]));
    expect(rows[0].holding).toMatchObject({ referenceAssetId: '', referenceQuantity: 0, compareAssetId: '', comparePriceToman: 0 });
  });
});
