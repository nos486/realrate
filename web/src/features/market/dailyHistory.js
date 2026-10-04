/**
 * dailyHistory.js — The standard way to read a past price: an asset's whole daily history, loaded
 * once and read for any date in the browser
 *
 * Valuing a record "as of its date" — what a toman expense was in dollars on its day, what the
 * money spent on gold would have bought in dollars, a compared asset's price on a purchase day —
 * never stores that price on the record: it is read here from the record's date (one request per
 * asset: GET /api/prices/history). A record keeps a price of its own only when it is the price the
 * trade actually happened at, or one the user typed over this (see docs/ARCHITECTURE.md, «قیمت روز
 * رکورد»).
 *
 * Kept for the session: past days never change, and today's value is refreshed after a few minutes.
 */

import { useEffect, useMemo, useState } from 'react';
import { getPriceHistory } from './api/marketApi.js';

const TTL_MS = 10 * 60 * 1000;
const DAY_MS = 86_400_000;
/** id → { history: { since, sinceMs, values } | null, at: number, promise?: Promise } */
const cache = new Map();
const listeners = new Set();

const norm = (id) => String(id || '').trim().toLowerCase();
const dayMs = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isIsoDay = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));

/** Forget every loaded history (tests) */
export function clearDailyHistoryCache() {
  cache.clear();
}

/**
 * The asset's price on a day: that day's close, the last one before it for a quiet day, the
 * latest one for a day after the history; null before the history starts
 * @param {{ sinceMs: number, values: number[] }|null} history
 * @param {string} isoDate - YYYY-MM-DD (a longer ISO string is cut to its day)
 */
export function historyPriceAt(history, isoDate) {
  if (!history?.values?.length || !isIsoDay(isoDate)) return null;
  const index = Math.round((dayMs(String(isoDate).slice(0, 10)) - history.sinceMs) / DAY_MS);
  if (index < 0) return null;
  const value = history.values[Math.min(index, history.values.length - 1)];
  return value > 0 ? value : null;
}

/** The loaded history of an asset, or undefined while it isn't (synchronous) */
export function peekDailyHistory(id) {
  return cache.get(norm(id))?.history;
}

/**
 * Load an asset's history (shared by concurrent callers, kept for the session)
 * @returns {Promise<{ since: string, sinceMs: number, values: number[] }|null>} null when it has none
 */
export function loadDailyHistory(id) {
  const key = norm(id);
  if (!key) return Promise.resolve(null);
  const kept = cache.get(key);
  if (kept?.promise) return kept.promise;
  if (kept && Date.now() - kept.at < TTL_MS) return Promise.resolve(kept.history);

  const promise = getPriceHistory(key, { silent: true })
    .then((res) => {
      const values = Array.isArray(res?.values) ? res.values.map(Number) : [];
      const history = isIsoDay(res?.since) && values.length ? { since: res.since, sinceMs: dayMs(res.since), values } : null;
      // A failed read (history unavailable) is not kept: the next ask tries again
      if (res?.available === false) cache.delete(key);
      else cache.set(key, { history, at: Date.now() });
      return history;
    })
    .catch(() => {
      // Keep an older copy when the refresh fails
      if (kept?.history) cache.set(key, { history: kept.history, at: Date.now() });
      else cache.delete(key);
      return kept?.history || null;
    })
    .finally(() => listeners.forEach((fn) => fn()));
  cache.set(key, { history: kept?.history, at: kept?.at || 0, promise });
  return promise;
}

/** An asset's price on a day (loads its history when needed); null when unknown */
export async function priceOnDay(id, isoDate) {
  return historyPriceAt(await loadDailyHistory(id), isoDate);
}

/**
 * Prices on any date, for the given assets, in render: loads their histories and re-renders when
 * they arrive. `priceAt(id, date)` is null until then (and for a date before the history).
 * @param {string[]} ids
 * @returns {{ priceAt: (id: string, isoDate: string) => number|null, loading: boolean }}
 */
export function useDailyHistory(ids) {
  const wanted = useMemo(() => [...new Set((ids || []).map(norm).filter(Boolean))].sort(), [ids]);
  const signature = wanted.join(',');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!wanted.length) return undefined;
    let alive = true;
    const bump = () => alive && setVersion((v) => v + 1);
    listeners.add(bump);
    wanted.forEach((id) => loadDailyHistory(id));
    return () => {
      alive = false;
      listeners.delete(bump);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return useMemo(() => ({
    priceAt: (id, isoDate) => historyPriceAt(peekDailyHistory(id), isoDate),
    loading: wanted.some((id) => peekDailyHistory(id) === undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [signature, version]);
}

const USD = ['usd'];
const NONE = [];

/**
 * The dollar's rate (tomans) on any date: (isoDate) => number|null
 * @param {boolean} [enabled] false: nothing is loaded (no record needs it), every date is null
 */
export function useUsdAt(enabled = true) {
  const { priceAt } = useDailyHistory(enabled ? USD : NONE);
  return useMemo(() => (isoDate) => priceAt('usd', isoDate), [priceAt]);
}
