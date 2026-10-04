/**
 * priceOnDay.js — An asset's price (tomans) on a given day, from the daily price history
 *
 * Forms fill a rate from a record's date with it: a dollar expense's rate, the price of an asset
 * paid or compared with on a trade's day. A past day never changes, so answers are kept for the
 * session (today's for five minutes); concurrent asks for the same day share one request.
 */

import { getPricesOnDay } from './api/marketApi.js';
import { todayIso } from '../../shared/utils/dates.js';

const TODAY_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

/** Forget every kept answer (tests) */
export function clearPriceOnDayCache() {
  cache.clear();
}

/**
 * @param {string} assetId - price book id (e.g. "usd")
 * @param {string} isoDate - YYYY-MM-DD
 * @returns {Promise<number|null>} the price, or null when the history has none on or before that day
 */
export function priceOnDay(assetId, isoDate) {
  const id = String(assetId || '').trim().toLowerCase();
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ''))) return Promise.resolve(null);
  const key = `${id}|${isoDate}`;
  const kept = cache.get(key);
  if (kept && (kept.until === Infinity || kept.until > Date.now())) return kept.promise;

  const promise = getPricesOnDay([id], isoDate, { silent: true })
    .then((res) => {
      const value = Number(res?.prices?.[id]?.value);
      return value > 0 ? value : null;
    })
    .catch(() => null);
  const entry = { promise, until: isoDate < todayIso() ? Infinity : Date.now() + TODAY_TTL_MS };
  cache.set(key, entry);
  // A failed or empty answer is not kept: the next ask tries again
  promise.then((value) => {
    if (value === null && cache.get(key) === entry) cache.delete(key);
  });
  return promise;
}
