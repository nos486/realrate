/**
 * calculationEngine.js — Pure client-side calculation engine for a portfolio's ledger
 *
 * Zero React dependencies — purely functional and 100% testable in any JS runtime.
 * Implements moving Weighted Average Cost (WAC), realized PnL and real-time unrealized PnL.
 *
 * One ledger per asset: the manual holdings (`manualLots`, each an opening buy) and the
 * transactions — buy, sell, and spend (paying an expense with the asset itself, valued at that
 * day's rate: it realizes P&L like a sale). So a sale or a spend can take from what was recorded
 * by hand too. A lot without a buy price is "unknown cost": it counts in the quantity but not in
 * the average or the P&L (those cover the priced part only).
 */

import { resolveHoldingUnitRealPrice } from '../../../utils/financialSpecs.js';
import { toPriceId, isCustomAssetId } from '../../../utils/priceIds.js';
import {
  resolveAssetDisplayName,
  resolveAssetUnit,
  resolveCategory,
} from '../../../config/sourceRegistry.js';
import { jalaliToGregorian } from '../../../utils/loanCalculator.js';

/** Types that take quantity out of the position at their price (realizing P&L) */
const OUTFLOW_TYPES = new Set(['sell', 'spend']);

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
 * A date comparable as text, whatever the calendar it was typed in (Shamsi «1405/7/4» or
 * Gregorian «2026-09-26» → «2026-09-26»); '' (sorts first: an opening balance) when none
 */
function sortableDate(value) {
  const digits = String(value || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const match = digits.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (!match) return '';
  let [year, month, day] = match.slice(1).map(Number);
  if (year < 1700) ({ year, month, day } = jalaliToGregorian(year, month, day));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Order transactions by trade date, then by creation time. On the same day, buys go before
 * sells so a same-day buy-then-sell never looks like an oversell because of entry order.
 */
function sortTransactionsChronologically(transactions) {
  return [...transactions].sort((a, b) => {
    const byDate = sortableDate(getTransactionDate(a)).localeCompare(sortableDate(getTransactionDate(b)));
    if (byDate !== 0) return byDate;
    const typeRank = (t) => (OUTFLOW_TYPES.has(getTransactionType(t)) ? 1 : 0);
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
 * @param {{ manualLots?: Array }} [options] - the portfolio's manual holdings: each is an opening
 *   buy in its asset's ledger. A computed row then holds what the transactions changed on top of
 *   them (it may be negative: a sale or spend that took from the manual lots), so the manual rows
 *   plus the computed row add up to the asset's real position.
 * @returns {{ computedHoldings: Array, warnings: Array, summary: object, positions: Map }}
 *   positions: the real position of every asset that has transactions, by asset id
 */
export function calculateComputedHoldings(transactions = [], livePriceMap = {}, { manualLots = [] } = {}) {
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
      positions: new Map(),
    };
  }

  // 1. Group transactions by asset identifier (assetId / symbol)
  const groups = new Map();

  for (const tx of transactions) {
    if (!tx) continue;
    const payload = tx.payload || tx.decryptedPayload || tx;
    const storedId = String(payload.assetId || payload.symbol || payload.id || '').trim();
    if (!storedId) continue;
    // One position per asset, whatever id form older transactions were saved with
    const assetId = isCustomAssetId(storedId) ? storedId : toPriceId(storedId, livePriceMap || null);

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
        manual: [],
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

  // Manual holdings join the ledger of the assets that have transactions, as opening buys
  for (const lot of Array.isArray(manualLots) ? manualLots : []) {
    const storedId = String(lot?.assetId || '').trim();
    if (!storedId) continue;
    const assetId = isCustomAssetId(storedId) ? storedId : toPriceId(storedId, livePriceMap || null);
    const group = groups.get(assetId);
    if (!group) continue;
    group.manual.push(lot);
    group.transactions.push({
      id: lot.id,
      assetId,
      transactionType: 'buy',
      quantity: Number(lot.amount) || 0,
      unitPrice: Number(lot.buyPrice) || 0,
      transactionDate: lot.buyDate || '',
      createdAt: lot.createdAt || '',
      isManualLot: true,
      referenceAssetId: lot.referenceAssetId || '',
      referenceQuantity: lot.referenceQuantity || 0,
    });
  }

  const computedHoldings = [];
  const warnings = [];
  const positions = new Map();
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
    // The open position's priced part (its cost) and the part of unknown cost
    let pricedQty = 0;
    let pricedCost = 0;
    let unpricedQty = 0;
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
      pricedQty = 0;
      pricedCost = 0;
      unpricedQty = 0;
      commonReferenceAssetId = undefined;
      hasMixedReferenceAsset = false;
      openReferenceQuantity = 0;
    };

    for (const t of sortTransactionsChronologically(group.transactions)) {
      const type = getTransactionType(t);
      const qty = Number(t.quantity !== undefined ? t.quantity : (t.amount || 0));
      const price = Number(t.unitPrice !== undefined ? t.unitPrice : (t.buyPrice || t.price || 0));
      const date = getTransactionDate(t);

      if (date && !t.isManualLot && (!latestTxDate || sortableDate(date) > sortableDate(latestTxDate))) {
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
        if (price > 0) {
          pricedQty += addedQty;
          pricedCost += addedQty * price;
        } else {
          unpricedQty += addedQty;
        }
        if (date && !t.isManualLot && (!latestBuyDate || sortableDate(date) > sortableDate(latestBuyDate))) {
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
      } else if (OUTFLOW_TYPES.has(type)) {
        totalSellQty += qty;
        const heldQty = openQty > 0 ? openQty : 0;
        const soldFromPosition = Math.min(qty, heldQty);

        if (soldFromPosition > 0) {
          // Taken evenly from the priced and the unknown-cost parts
          const share = soldFromPosition / heldQty;
          const soldPriced = pricedQty * share;
          const averageCost = pricedQty > 0 ? pricedCost / pricedQty : 0;
          if (price > 0 && soldPriced > 0 && averageCost > 0) {
            realizedPnl += soldPriced * (price - averageCost);
            assetHasRealized = true;
          }
          pricedCost -= pricedCost * share;
          pricedQty -= soldPriced;
          unpricedQty -= unpricedQty * share;
          openReferenceQuantity *= 1 - share;
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

    // The manual lots as their own rows show them (quantity; cost and quantity of the priced ones)
    const manualQty = group.manual.reduce((sum, lot) => sum + (Number(lot.amount) || 0), 0);
    const manualPriced = group.manual.filter((lot) => Number(lot.buyPrice) > 0);
    const manualPricedQty = manualPriced.reduce((sum, lot) => sum + (Number(lot.amount) || 0), 0);
    const manualCost = manualPriced.reduce((sum, lot) => sum + (Number(lot.amount) || 0) * Number(lot.buyPrice), 0);
    const txCount = group.transactions.length - group.manual.length;

    // Scenario A: Overselling (User error — sells exceed what is held, manual lots included)
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
    }

    const heldQty = Math.max(0, currentQty);
    const weightedAveragePrice = pricedQty > 0 ? pricedCost / pricedQty : 0;
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
    positions.set(assetId, {
      assetId,
      assetName: group.assetName,
      unit: group.unit,
      amount: heldQty,
      pricedQty: heldQty > 0 ? pricedQty : 0,
      unpricedQty: heldQty > 0 ? unpricedQty : 0,
      averageCost: weightedAveragePrice,
      cost: heldQty > 0 ? pricedCost : 0,
      realizedPnl: assetHasRealized ? realizedPnl : null,
      deficit: currentQty < 0 ? -currentQty : 0,
    });

    // The computed row: what the transactions changed on top of the manual lots
    const rowQty = heldQty - manualQty;
    const rowPricedQty = (heldQty > 0 ? pricedQty : 0) - manualPricedQty;
    const rowCost = (heldQty > 0 ? pricedCost : 0) - manualCost;
    // Nothing left to show: closed (or oversold, warned above) with no manual lot to adjust
    if (isZeroQty(rowQty) && Math.abs(rowCost) < 0.5) continue;
    if (currentQty <= 0 && group.manual.length === 0) continue;

    const hasBuyPrice = Math.abs(rowPricedQty) > QTY_EPSILON || Math.abs(rowCost) >= 0.5;
    const itemCost = hasBuyPrice ? rowCost : 0;
    const itemRealVal = rowQty * unitRealPrice;
    const itemPnl = hasBuyPrice ? rowPricedQty * unitRealPrice - rowCost : null;
    const itemPnlPct =
      hasBuyPrice && itemCost > 0
        ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1))
        : null;
    const rowBuyPrice = Math.abs(rowPricedQty) > QTY_EPSILON ? rowCost / rowPricedQty : weightedAveragePrice;

    const hasUniformReferenceAsset = !hasMixedReferenceAsset && Boolean(commonReferenceAssetId) && group.manual.length === 0;
    // Already scaled down on every sell alongside the Toman cost basis, so a partially-sold
    // position doesn't overstate what was originally given up for it.
    const scaledReferenceQuantity = hasUniformReferenceAsset ? openReferenceQuantity : 0;

    computedHoldings.push({
      id: `computed_${assetId}`,
      portfolioId: group.transactions.find((t) => !t.isManualLot)?.portfolioId || '',
      assetId,
      assetName: group.assetName,
      assetType: group.assetType,
      category: group.assetType,
      unit: group.unit,
      amount: rowQty,
      buyPrice: Math.round(rowBuyPrice),
      currentPrice: unitRealPrice,
      unitRealPrice,
      itemCost,
      itemRealVal,
      itemPnl,
      itemPnlPct,
      hasBuyPrice,
      pricedQty: rowPricedQty,
      unpricedQty: heldQty > 0 ? unpricedQty : 0,
      buyDate: latestBuyDate || latestTxDate || '',
      notes: group.manual.length && rowQty < 0
        ? `فروش و پرداخت از دارایی‌های دستی (${txCount.toLocaleString('fa-IR')} تراکنش)`
        : `محاسبه خودکار از ${txCount.toLocaleString('fa-IR')} تراکنش`,
      source: 'transactions',
      isComputed: true,
      // Takes from the manual lots: shown as an adjustment of them
      adjustsManual: group.manual.length > 0,
      txCount,
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
    positions,
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
