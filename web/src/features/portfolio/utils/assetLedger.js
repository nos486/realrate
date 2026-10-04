/**
 * assetLedger.js — A portfolio as one ledger per asset, first in first out (FIFO)
 *
 * Every entry of an asset — the manual records (holdings) and the transactions (buy, sell, and
 * spend: paying an expense with the asset itself) — is replayed in date order:
 *   - a manual record or a buy opens a lot (its quantity, at its price; a manual record without a
 *     date opens the ledger: it is the opening balance)
 *   - a sell or a spend takes from the oldest lots first. From a lot with a price it realizes
 *     (outflow price − lot price) × quantity; from a lot without one it only takes the quantity
 *     (no profit or loss is known)
 * What is left: the open lots. Their priced part gives the cost, the average and the open P&L;
 * the unpriced part counts in the quantity only.
 *
 * Pure: no React, no storage. The holdings screen, the shared portfolio page, the transaction
 * form's balance and «پرداخت از» (portfolio funds) all read it.
 */

import { resolveHoldingUnitRealPrice } from '../../../utils/financialSpecs.js';
import { toPriceId, isCustomAssetId } from '../../../utils/priceIds.js';
import { resolveAssetDisplayName, resolveAssetUnit, resolveCategory } from '../../../config/sourceRegistry.js';
import { jalaliToGregorian } from '../../../utils/loanCalculator.js';

const EPSILON = 1e-9;
const isZero = (n) => Math.abs(n) < EPSILON;
export const OUTFLOW_TYPES = new Set(['sell', 'spend']);

/** «1405/7/4», «۱۴۰۵/۰۷/۰۴» or «2026-09-26» → «2026-09-26»; '' when not a date */
export function sortableDate(value) {
  const digits = String(value || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const match = digits.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (!match) return '';
  let [year, month, day] = match.slice(1).map(Number);
  if (year < 1700) ({ year, month, day } = jalaliToGregorian(year, month, day));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const assetKey = (storedId, priceMap) => {
  const id = String(storedId || '').trim();
  if (!id) return '';
  return isCustomAssetId(id) ? id : toPriceId(id, priceMap || null);
};

const txType = (t) => String(t.transactionType || t.type || 'buy').toLowerCase();
const txQty = (t) => Number(t.quantity !== undefined ? t.quantity : (t.amount || 0)) || 0;
const txPrice = (t) => Number(t.unitPrice !== undefined ? t.unitPrice : (t.buyPrice || t.price || 0)) || 0;

/** The entries of every asset, as { kind, id, date, qty, price, record } */
function collectEntries(holdings, transactions, priceMap) {
  const byAsset = new Map();
  // One ledger per asset and unit (gold kept in grams and in mesghals are two ledgers)
  const keyOf = (assetId, record) => `${assetId}|${String(record.unit || '').trim() || resolveAssetUnit(assetId, record)}`;
  const add = (assetId, entry, meta) => {
    if (!assetId || !(entry.qty > 0)) return;
    const key = keyOf(assetId, meta);
    if (!byAsset.has(key)) byAsset.set(key, { assetId, entries: [], meta: {} });
    const group = byAsset.get(key);
    group.entries.push(entry);
    // The first name, unit and type seen win (a record with its own name over the catalog's)
    for (const key of ['assetName', 'unit', 'assetType', 'sourceId']) {
      if (!group.meta[key] && meta[key] && meta[key] !== 'واحد' && meta[key] !== 'custom') group.meta[key] = meta[key];
    }
  };

  for (const h of holdings || []) {
    if (!h) continue;
    const id = assetKey(h.assetId, priceMap);
    if (!id) continue;
    // A personal asset's own current price (it has no market price)
    const own = Number(h.customPrice || h.currentPrice) || 0;
    if (own > 0) {
      const key = keyOf(id, h);
      if (!byAsset.has(key)) byAsset.set(key, { assetId: id, entries: [], meta: {} });
      byAsset.get(key).meta.currentPrice = own;
    }
    add(id, {
      kind: 'manual',
      id: h.id,
      date: h.buyDate || '',
      qty: Number(h.amount) || 0,
      price: Number(h.buyPrice) || 0,
      createdAt: h.createdAt || '',
      record: h,
    }, h);
  }
  for (const tx of transactions || []) {
    if (!tx) continue;
    const t = tx.payload || tx.decryptedPayload || tx;
    const type = txType(t);
    const kind = type === 'buy' ? 'buy' : OUTFLOW_TYPES.has(type) ? type : null;
    if (!kind) continue;
    add(assetKey(t.assetId || t.symbol, priceMap), {
      kind,
      id: tx.id || t.id,
      date: t.transactionDate || t.date || '',
      qty: txQty(t),
      price: txPrice(t),
      createdAt: tx.createdAt || t.createdAt || '',
      record: { ...t, id: tx.id || t.id },
    }, t);
  }
  return byAsset;
}

/** Date order; on one day what comes in before what goes out; then the order it was recorded */
function compareEntries(a, b) {
  const byDate = sortableDate(a.date).localeCompare(sortableDate(b.date));
  if (byDate) return byDate;
  const rank = (e) => (OUTFLOW_TYPES.has(e.kind) ? 1 : 0);
  return rank(a) - rank(b) || String(a.createdAt).localeCompare(String(b.createdAt));
}

/**
 * Replay one asset's entries
 * @returns {{ entries: object[], lots: object[], realizedPnl: number, hasRealized: boolean, deficit: number }}
 *   entries are annotated: an incoming one with `remaining`; an outgoing one with `consumed`
 *   ([{ lotId, lotDate, qty, lotPrice, pnl }]), `pnl` (null when none of it had a price),
 *   `unpricedQty` and `uncoveredQty` (sold beyond what was held)
 */
export function replayLedger(rawEntries) {
  const entries = [...rawEntries].sort(compareEntries).map((e) => ({ ...e }));
  const lots = [];
  let deficit = 0; // sold before it was bought (covered by the next lots)
  let realizedPnl = 0;
  let hasRealized = false;

  for (const entry of entries) {
    if (entry.kind === 'manual' || entry.kind === 'buy') {
      const covering = Math.min(deficit, entry.qty);
      deficit -= covering;
      entry.remaining = entry.qty - covering;
      if (entry.remaining > EPSILON) lots.push(entry);
      continue;
    }
    let left = entry.qty;
    entry.consumed = [];
    entry.unpricedQty = 0;
    let pnl = 0;
    let priced = false;
    while (left > EPSILON && lots.length) {
      const lot = lots[0];
      const take = Math.min(left, lot.remaining);
      const lotPnl = lot.price > 0 && entry.price > 0 ? take * (entry.price - lot.price) : null;
      entry.consumed.push({ lotId: lot.id, lotKind: lot.kind, lotDate: lot.date, qty: take, lotPrice: lot.price, pnl: lotPnl });
      if (lotPnl === null) entry.unpricedQty += take;
      else {
        pnl += lotPnl;
        priced = true;
      }
      lot.remaining -= take;
      left -= take;
      if (lot.remaining <= EPSILON) {
        lot.remaining = 0;
        lots.shift();
      }
    }
    entry.uncoveredQty = left > EPSILON ? left : 0;
    deficit += entry.uncoveredQty;
    entry.pnl = priced ? pnl : null;
    if (priced) {
      realizedPnl += pnl;
      hasRealized = true;
    }
  }
  return { entries, lots, realizedPnl, hasRealized, deficit };
}

/**
 * Every asset of a portfolio, valued at today's prices
 * @param {{ holdings?: object[], transactions?: object[], priceMap?: object }} input
 * @returns {{ assets: object[], warnings: object[], summary: object }}
 *   asset: { id, assetId, assetName, assetType, category, unit, sourceId, amount, pricedQty,
 *     unpricedQty, buyPrice (average of the priced lots left), itemCost, unitRealPrice,
 *     itemRealVal, itemPnl, itemPnlPct, hasBuyPrice, partialCost, realizedPnl, deficit,
 *     entries, entryCount, firstDate, lastDate }
 */
export function buildAssetLedgers({ holdings = [], transactions = [], priceMap = {} } = {}) {
  const groups = collectEntries(holdings, transactions, priceMap);
  const assets = [];
  const warnings = [];
  let totalRealizedPnl = 0;
  let hasRealizedPnl = false;

  for (const [key, { assetId, entries: raw, meta }] of groups.entries()) {
    if (!raw.length) continue;
    const { entries, lots, realizedPnl, hasRealized, deficit } = replayLedger(raw);
    const assetType = resolveCategory(assetId, meta.assetType);
    const assetName = meta.assetName || resolveAssetDisplayName(assetId, meta);
    const unit = meta.unit || resolveAssetUnit(assetId, meta);
    if (hasRealized) {
      totalRealizedPnl += realizedPnl;
      hasRealizedPnl = true;
    }
    if (deficit > EPSILON) {
      warnings.push({
        assetId,
        assetName,
        unit,
        deficit,
        message: `موجودی دارایی «${assetName}» منفی است (${deficit.toLocaleString('fa-IR')} ${unit} فروش بیش از موجودی). لطفاً ثبت‌ها را بازبینی کنید.`,
      });
    }

    const amount = lots.reduce((sum, lot) => sum + lot.remaining, 0);
    const pricedLots = lots.filter((lot) => lot.price > 0);
    const pricedQty = pricedLots.reduce((sum, lot) => sum + lot.remaining, 0);
    const itemCost = pricedLots.reduce((sum, lot) => sum + lot.remaining * lot.price, 0);
    const buyPrice = pricedQty > EPSILON ? itemCost / pricedQty : 0;
    const unitRealPrice = resolveHoldingUnitRealPrice(
      { assetId, assetName, assetType, category: assetType, unit, buyPrice, sourceId: meta.sourceId, currentPrice: meta.currentPrice || 0 },
      priceMap
    );
    const hasBuyPrice = pricedQty > EPSILON;
    const itemRealVal = amount * unitRealPrice;
    const itemPnl = hasBuyPrice ? pricedQty * unitRealPrice - itemCost : null;
    const dates = entries.map((e) => e.date).filter(Boolean);

    assets.push({
      id: `asset:${key}`,
      assetId,
      assetName,
      assetType,
      category: assetType,
      unit,
      sourceId: meta.sourceId || null,
      amount: isZero(amount) ? 0 : amount,
      pricedQty,
      unpricedQty: amount - pricedQty,
      buyPrice,
      itemCost,
      unitRealPrice,
      itemRealVal,
      itemPnl,
      itemPnlPct: hasBuyPrice && itemCost > 0 ? parseFloat(((itemPnl / itemCost) * 100).toFixed(1)) : null,
      hasBuyPrice,
      partialCost: hasBuyPrice && amount - pricedQty > EPSILON,
      realizedPnl: hasRealized ? realizedPnl : null,
      deficit,
      entries,
      entryCount: entries.length,
      firstDate: dates.sort((a, b) => sortableDate(a).localeCompare(sortableDate(b)))[0] || '',
      lastDate: dates[dates.length - 1] || '',
    });
  }

  const costed = assets.filter((a) => a.hasBuyPrice);
  const totalCost = costed.reduce((sum, a) => sum + a.itemCost, 0);
  const totalPnl = costed.reduce((sum, a) => sum + (a.itemPnl || 0), 0);
  return {
    assets,
    warnings,
    summary: {
      totalCost,
      totalRealValue: assets.reduce((sum, a) => sum + a.itemRealVal, 0),
      totalPnl,
      totalPnlPct: totalCost > 0 ? parseFloat(((totalPnl / totalCost) * 100).toFixed(1)) : 0,
      hasAnyCost: totalCost > 0,
      totalRealizedPnl,
      hasRealizedPnl,
      count: assets.filter((a) => a.amount > EPSILON).length,
    },
  };
}

/**
 * An asset's open position in dollars: what its priced lots still held cost in dollars (each at
 * the dollar's rate on the day it was bought, «قیمت روز رکورد») against what they are worth in
 * dollars today — so a holding is judged against having kept dollars instead
 * @param {object} asset - from buildAssetLedgers
 * @param {(isoDate: string) => number|null} usdAt - the dollar's rate on a date (price history)
 * @param {number} usdToday - today's rate
 * @returns {{ costUsd: number, valueUsd: number, pnlUsd: number, pnlPct: number|null, missingQty: number }|null}
 *   null while no lot has its day's rate; `missingQty`: held quantity left out (no date, no price
 *   or no rate for its day)
 */
export function assetDollarPnl(asset, usdAt, usdToday) {
  if (!asset || !(usdToday > 0) || typeof usdAt !== 'function') return null;
  let costUsd = 0;
  let countedQty = 0;
  for (const lot of asset.entries || []) {
    if (!(lot.remaining > EPSILON) || !(lot.price > 0)) continue;
    const day = sortableDate(lot.date);
    const rate = day ? Number(usdAt(day)) || 0 : 0;
    if (rate <= 0) continue;
    costUsd += (lot.remaining * lot.price) / rate;
    countedQty += lot.remaining;
  }
  if (countedQty <= EPSILON) return null;
  const valueUsd = (countedQty * (asset.unitRealPrice || 0)) / usdToday;
  const pnlUsd = valueUsd - costUsd;
  return {
    costUsd,
    valueUsd,
    pnlUsd,
    pnlPct: costUsd > 0 ? (pnlUsd / costUsd) * 100 : null,
    missingQty: Math.max(0, (asset.amount || 0) - countedQty),
  };
}

/** The portfolio's open positions in dollars: the sum of assetDollarPnl (nulls skipped) */
export function sumDollarPnl(values) {
  const counted = values.filter(Boolean);
  if (!counted.length) return null;
  const costUsd = counted.reduce((s, v) => s + v.costUsd, 0);
  const valueUsd = counted.reduce((s, v) => s + v.valueUsd, 0);
  const pnlUsd = valueUsd - costUsd;
  return { costUsd, valueUsd, pnlUsd, pnlPct: costUsd > 0 ? (pnlUsd / costUsd) * 100 : null, partial: counted.some((v) => v.missingQty > EPSILON) || counted.length < values.length };
}
