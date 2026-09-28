/**
 * holdingAggregates.js — One row per asset: every purchase (lot) of the same asset added up
 *
 * A portfolio often holds an asset in several lots (2 coins bought once, 3 more later; dollars
 * bought on different days; the manual entries and the ones computed from transactions). The
 * "جمع هر دارایی" view shows each asset once:
 *  - amount: the total held
 *  - buyPrice: the weighted average buy price of the lots that have one
 *  - itemCost / itemPnl: summed over those lots only (a lot without a buy price has no P&L),
 *    `partialCost` says some lots have none
 *  - itemRealVal: the value of everything held, at today's price
 *  - lots / lotCount, firstDate / lastDate: what was added up
 * Lots are the same asset when they share its price id (getAssetKey) and unit.
 */

import { getAssetKey } from '../portfolioLayoutModel.js';
import { toEnglishDigits } from '../../../shared/utils/formatters.js';

/** A purchase date comparable as text (Shamsi «1405/7/4» → «1405/07/04») */
function sortableDate(value) {
  const match = toEnglishDigits(String(value || '')).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return match ? `${match[1]}/${match[2].padStart(2, '0')}/${match[3].padStart(2, '0')}` : '';
}

/**
 * @param {object[]} items processed holdings (HoldingsView's portfolioMetrics.items)
 * @returns {object[]} one row per asset, in the order each asset first appears
 */
export function aggregateHoldings(items = []) {
  const byAsset = new Map();
  for (const item of items) {
    const key = `${getAssetKey(item) || item.id}|${item.unit || ''}`;
    if (!byAsset.has(key)) byAsset.set(key, []);
    byAsset.get(key).push(item);
  }

  return [...byAsset.entries()].map(([key, lots]) => {
    const first = lots[0];
    const amount = lots.reduce((sum, lot) => sum + (Number(lot.amount) || 0), 0);
    const costed = lots.filter((lot) => lot.hasBuyPrice);
    const costedAmount = costed.reduce((sum, lot) => sum + (Number(lot.amount) || 0), 0);
    const itemCost = costed.reduce((sum, lot) => sum + (lot.itemCost || 0), 0);
    const itemRealVal = lots.reduce((sum, lot) => sum + (lot.itemRealVal || 0), 0);
    const itemPnl = costed.length ? costed.reduce((sum, lot) => sum + (lot.itemPnl || 0), 0) : null;
    const dates = lots.map((lot) => sortableDate(lot.buyDate)).filter(Boolean).sort();

    return {
      ...first,
      id: `agg:${key}`,
      source: 'aggregate',
      amount,
      buyPrice: costedAmount > 0 ? itemCost / costedAmount : 0,
      hasBuyPrice: costed.length > 0,
      partialCost: costed.length > 0 && costed.length < lots.length,
      itemCost,
      itemRealVal,
      itemPnl,
      itemPnlPct: itemCost > 0 ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1)) : null,
      lots,
      lotCount: lots.length,
      firstDate: dates[0] || '',
      lastDate: dates[dates.length - 1] || '',
      buyDate: dates[0] || '',
      notes: '',
      // Per-lot comparisons don't add up across purchases made at different times
      referenceAssetId: null,
      referenceQuantity: 0,
      referencePnlInfo: null,
      comparePnlInfo: null,
    };
  });
}
