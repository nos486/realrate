/**
 * calculationEngine.js — Pure client-side calculation engine for transactions
 *
 * Zero React dependencies — purely functional and 100% testable in any JS runtime.
 * Implements moving Weighted Average Cost (WAC), realized PnL and real-time unrealized PnL.
 */

import { resolveHoldingUnitRealPrice, resolveItemCategory } from '../../../utils/financialSpecs.js';
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
  resolveCategory,
} from '../../../config/sourceRegistry.js';

/** Quantities closer to zero than this are treated as zero (float noise from decimal amounts) */
const QTY_EPSILON = 1e-9;

function isZeroQty(qty) {
  return Math.abs(qty) < QTY_EPSILON;
}

function getTransactionType(t) {
  return String(t.transactionType || t.type || 'buy').toLowerCase();
}

function getTransactionDate(t) {
  return t.transactionDate || t.buyDate || t.date || '';
}

/**
 * Order transactions by trade date, then by creation time. On the same day, buys go before
 * sells so a same-day buy-then-sell never looks like an oversell because of entry order.
 */
function sortTransactionsChronologically(transactions) {
  return [...transactions].sort((a, b) => {
    const byDate = String(getTransactionDate(a)).localeCompare(String(getTransactionDate(b)));
    if (byDate !== 0) return byDate;
    const typeRank = (t) => (getTransactionType(t) === 'sell' ? 1 : 0);
    const byType = typeRank(a) - typeRank(b);
    if (byType !== 0) return byType;
    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

/**
 * Aggregate an array of decrypted transactions into net holdings with Weighted Average Cost.
 *
 * @param {Array} transactions - Array of decrypted transaction objects
 * @param {object} [livePriceMap={}] - Mapping of asset IDs to current market prices
 * @returns {{ computedHoldings: Array, warnings: Array, summary: object }}
 */
export function calculateComputedHoldings(transactions = [], livePriceMap = {}) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return {
      computedHoldings: [],
      warnings: [],
      summary: {
        totalCost: 0,
        totalRealValue: 0,
        totalPnl: 0,
        totalPnlPct: 0,
        hasAnyCost: false,
        totalRealizedPnl: 0,
        hasRealizedPnl: false,
        count: 0,
      },
    };
  }

  // 1. Group transactions by asset identifier (assetId / symbol)
  const groups = new Map();

  for (const tx of transactions) {
    if (!tx) continue;
    const payload = tx.payload || tx.decryptedPayload || tx;
    const assetId = String(payload.assetId || payload.symbol || payload.id || '').trim();
    if (!assetId) continue;

    if (!groups.has(assetId)) {
      const resolvedType = resolveCategory(assetId, payload.assetType || payload.category);
      const resolvedName = resolveAssetDisplayName(assetId, payload);
      const resolvedUnit = resolveAssetUnit(assetId, payload);
      groups.set(assetId, {
        assetId,
        assetName: resolvedName,
        assetType: resolvedType,
        category: resolvedType,
        unit: resolvedUnit,
        transactions: [],
      });
    }

    const group = groups.get(assetId);
    if (payload.assetName && payload.assetName !== assetId) group.assetName = payload.assetName;
    if (payload.unit && payload.unit !== 'واحد') group.unit = payload.unit;
    if (payload.assetType && payload.assetType !== 'custom') {
      group.assetType = payload.assetType;
      group.category = payload.assetType;
    }

    group.transactions.push({
      ...payload,
      id: tx.id || payload.id,
      createdAt: tx.createdAt || payload.createdAt,
    });
  }

  const computedHoldings = [];
  const warnings = [];
  let totalRealizedPnl = 0;
  let hasRealizedPnl = false;

  // 2. Aggregate each asset group
  for (const [assetId, group] of groups.entries()) {
    // Running position, replayed in chronological order (moving-average cost method):
    //  - a buy adds its quantity and cost to the open position
    //  - a sell removes quantity at the CURRENT average cost (the average itself is unchanged)
    //    and realizes (sellPrice − averageCost) × soldQty
    //  - once the position is fully closed the cost basis resets, so a later re-buy starts a
    //    fresh average instead of being blended with lots that were already sold
    let openQty = 0;
    let openCost = 0;
    let totalBuyQty = 0;
    let totalSellQty = 0;
    let realizedPnl = 0;
    let assetHasRealized = false;
    let latestBuyDate = '';
    let latestTxDate = '';
    // A reference-asset cost basis is only meaningful when EVERY buy lot in the open position
    // was paid/swapped with the exact same reference asset — blending different ones would be
    // meaningless, so we simply omit it rather than show a misleading figure.
    let commonReferenceAssetId = undefined;
    let hasMixedReferenceAsset = false;
    let openReferenceQuantity = 0;
    const resetOpenPosition = () => {
      openCost = 0;
      commonReferenceAssetId = undefined;
      hasMixedReferenceAsset = false;
      openReferenceQuantity = 0;
    };

    for (const t of sortTransactionsChronologically(group.transactions)) {
      const type = getTransactionType(t);
      const qty = Number(t.quantity !== undefined ? t.quantity : (t.amount || 0));
      const price = Number(t.unitPrice !== undefined ? t.unitPrice : (t.buyPrice || t.price || 0));
      const date = getTransactionDate(t);

      if (date && (!latestTxDate || date > latestTxDate)) {
        latestTxDate = date;
      }
      if (!(qty > 0)) continue;

      if (type === 'buy') {
        totalBuyQty += qty;
        // Part of a buy may first cover an earlier oversell (a sell dated before its buy);
        // only the remainder opens/extends the position at this price.
        const coveringQty = openQty < 0 ? Math.min(qty, -openQty) : 0;
        const addedQty = qty - coveringQty;
        openQty += qty;
        if (isZeroQty(openQty)) openQty = 0;
        openCost += addedQty * (price > 0 ? price : 0);
        if (date && (!latestBuyDate || date > latestBuyDate)) {
          latestBuyDate = date;
        }

        if (addedQty > 0) {
          const txReferenceAssetId = t.referenceAssetId || '';
          if (txReferenceAssetId) {
            if (commonReferenceAssetId === undefined) {
              commonReferenceAssetId = txReferenceAssetId;
            } else if (commonReferenceAssetId !== txReferenceAssetId) {
              hasMixedReferenceAsset = true;
            }
            openReferenceQuantity += (Number(t.referenceQuantity) || 0) * (addedQty / qty);
          } else if (commonReferenceAssetId === undefined) {
            commonReferenceAssetId = '';
          } else if (commonReferenceAssetId !== '') {
            hasMixedReferenceAsset = true;
          }
        }
      } else if (type === 'sell') {
        totalSellQty += qty;
        const heldQty = openQty > 0 ? openQty : 0;
        const soldFromPosition = Math.min(qty, heldQty);
        const averageCost = heldQty > 0 ? openCost / heldQty : 0;

        if (soldFromPosition > 0) {
          if (price > 0 && averageCost > 0) {
            realizedPnl += soldFromPosition * (price - averageCost);
            assetHasRealized = true;
          }
          const remainingShare = (heldQty - soldFromPosition) / heldQty;
          openCost *= remainingShare;
          openReferenceQuantity *= remainingShare;
        }

        openQty -= qty;
        if (isZeroQty(openQty)) openQty = 0;
        if (openQty <= 0) resetOpenPosition();
      }
    }

    if (assetHasRealized) {
      totalRealizedPnl += realizedPnl;
      hasRealizedPnl = true;
    }

    const currentQty = openQty;

    // Scenario A: Overselling (User error — sells exceed purchases)
    if (currentQty < 0) {
      warnings.push({
        assetId,
        assetName: group.assetName,
        totalBuyQty,
        totalSellQty,
        deficit: Math.abs(currentQty),
        unit: group.unit,
        message: `موجودی دارایی «${group.assetName}» منفی است (${Math.abs(currentQty).toLocaleString('fa-IR')} ${group.unit} فروش مازاد بر خرید). لطفاً تراکنش‌ها را بازبینی فرمایید.`,
      });
      // Do NOT include negative-balance assets in computed holdings list
      continue;
    }

    // Scenario B: Completely sold (zero balance)
    if (currentQty === 0) {
      // Omit from computed holdings list silently
      continue;
    }

    // Scenario C: Positive balance -> average cost of the lots still held
    const weightedAveragePrice = openCost / currentQty;

    // Resolve current market price
    const unitRealPrice = resolveHoldingUnitRealPrice(
      {
        assetId,
        assetName: group.assetName,
        assetType: group.assetType,
        category: group.assetType,
        unit: group.unit,
        buyPrice: weightedAveragePrice,
      },
      livePriceMap
    );

    const hasBuyPrice = weightedAveragePrice > 0;
    const itemCost = hasBuyPrice ? currentQty * weightedAveragePrice : 0;
    const itemRealVal = currentQty * unitRealPrice;
    const itemPnl = hasBuyPrice ? itemRealVal - itemCost : null;
    const itemPnlPct =
      hasBuyPrice && itemCost > 0
        ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1))
        : null;

    const hasUniformReferenceAsset = !hasMixedReferenceAsset && Boolean(commonReferenceAssetId);
    // Already scaled down on every sell alongside the Toman cost basis, so a partially-sold
    // position doesn't overstate what was originally given up for it.
    const scaledReferenceQuantity = hasUniformReferenceAsset ? openReferenceQuantity : 0;

    computedHoldings.push({
      id: `computed_${assetId}`,
      portfolioId: group.transactions[0]?.portfolioId || '',
      assetId,
      assetName: group.assetName,
      assetType: group.assetType,
      category: group.assetType,
      unit: group.unit,
      amount: currentQty,
      buyPrice: Math.round(weightedAveragePrice),
      currentPrice: unitRealPrice,
      unitRealPrice,
      itemCost,
      itemRealVal,
      itemPnl,
      itemPnlPct,
      hasBuyPrice,
      buyDate: latestBuyDate || latestTxDate || '',
      notes: `محاسبه خودکار از ${group.transactions.length.toLocaleString('fa-IR')} تراکنش`,
      source: 'transactions',
      isComputed: true,
      txCount: group.transactions.length,
      realizedPnl: assetHasRealized ? realizedPnl : null,
      // Only set when every buy transaction for this asset shares one reference asset —
      // otherwise a blended figure across different references would be meaningless.
      referenceAssetId: hasUniformReferenceAsset ? commonReferenceAssetId : '',
      referenceQuantity: scaledReferenceQuantity,
    });
  }

  // 3. Overall metrics
  const costedItems = computedHoldings.filter((it) => it.hasBuyPrice);
  const totalCost = costedItems.reduce((acc, it) => acc + it.itemCost, 0);
  const totalRealValue = computedHoldings.reduce((acc, it) => acc + it.itemRealVal, 0);
  const hasAnyCost = costedItems.length > 0 && totalCost > 0;
  const totalPnl = costedItems.reduce((sum, it) => sum + (it.itemPnl || 0), 0);
  const totalPnlPct = hasAnyCost ? parseFloat(((totalPnl / totalCost) * 100).toFixed(1)) : 0;

  return {
    computedHoldings,
    warnings,
    summary: {
      totalCost,
      totalRealValue,
      totalPnl,
      totalPnlPct,
      hasAnyCost,
      totalRealizedPnl,
      hasRealizedPnl,
      count: computedHoldings.length,
    },
  };
}
