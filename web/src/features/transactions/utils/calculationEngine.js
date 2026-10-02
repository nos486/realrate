/**
 * calculationEngine.js — A portfolio's positions from its ledger (FIFO)
 *
 * Thin view of portfolio/utils/assetLedger.js — one ledger per asset, manual records and
 * transactions together, first in first out — for the callers that need positions only: the
 * transaction form's balance and «پرداخت از» (portfolio funds).
 */

import { buildAssetLedgers } from '../../portfolio/utils/assetLedger.js';

/**
 * @param {Array} transactions - decrypted transactions
 * @param {object} [livePriceMap={}] - asset id → today's price
 * @param {{ manualLots?: Array }} [options] - the portfolio's manual records (holdings)
 * @returns {{ computedHoldings: Array, warnings: Array, summary: object, positions: Map }}
 *   computedHoldings: every asset still held; positions: every asset by id
 *   ({ amount, pricedQty, unpricedQty, averageCost, cost, realizedPnl, deficit })
 */
export function calculateComputedHoldings(transactions = [], livePriceMap = {}, { manualLots = [] } = {}) {
  const { assets, warnings, summary } = buildAssetLedgers({
    holdings: Array.isArray(manualLots) ? manualLots : [],
    transactions: Array.isArray(transactions) ? transactions : [],
    priceMap: livePriceMap || {},
  });
  const positions = new Map(assets.map((a) => [a.assetId, {
    assetId: a.assetId,
    assetName: a.assetName,
    unit: a.unit,
    amount: a.amount,
    pricedQty: a.pricedQty,
    unpricedQty: a.unpricedQty,
    averageCost: a.buyPrice,
    cost: a.itemCost,
    realizedPnl: a.realizedPnl,
    deficit: a.deficit,
  }]));
  return {
    computedHoldings: assets.filter((a) => a.amount > 0),
    warnings,
    summary,
    positions,
  };
}
