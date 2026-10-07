/**
 * priceAverages.service.js — Keeps the price book's averages (domain/priceAverages.js) up to date
 *
 * Every sync tick carries the previous book's averages. Once a Tehran day they move one day
 * forward: the running sums (state key "price_averages", D1 app_state — it must read back exactly)
 * take in yesterday's closes and drop the closes that left each window, reading three days of rows.
 * The first tick of every hour also looks at the state, so averages summed again after past days
 * changed (resetPriceAverages, called by the history backfill) reach the book within the hour.
 * Without the database nothing changes and the book keeps what it had.
 */

import { logger } from "../../lib/logger.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { readAverageSums, readDayCloses, tehranDay } from "../../repositories/priceHistory.repository.js";
import { historyKeysOf } from "../../domain/priceBook.js";
import {
  advanceAverageState,
  applyAverages,
  averageStateFromSums,
  averagesOf,
  boundaryDaysOf,
  canAdvance,
  carryAverages,
  shiftDay,
  AVERAGE_STATE_VERSION,
} from "../../domain/priceAverages.js";

export const AVERAGES_STATE_KEY = "price_averages";

const hourOf = (iso) => String(iso || "").slice(0, 13);

/**
 * The averages state through `through`: the stored one, moved a day forward, or summed again
 * @param {object} env
 * @param {string[]} bookKeys - the book's history keys
 * @param {string} through
 * @returns {Promise<object|null>} null when the history can't be read
 */
export async function averageStateThrough(env, bookKeys, through) {
  const store = getStateStore(env);
  if (!store) return null;
  const state = await store.get(AVERAGES_STATE_KEY, "json").catch(() => null);
  if (state?.v === AVERAGE_STATE_VERSION && state.through === through) return state;

  let next = null;
  if (canAdvance(state, through)) {
    // A key that left the book still has closes leaving its windows
    const keys = [...new Set([...bookKeys, ...Object.values(state.sums || {}).flatMap(Object.keys)])];
    const rows = await readDayCloses(env, keys, boundaryDaysOf(through));
    if (rows) next = advanceAverageState(state, rows, through);
  } else {
    const rows = await readAverageSums(env, bookKeys, through);
    if (rows) next = averageStateFromSums(rows, through);
  }
  if (!next) return null;
  await store.put(AVERAGES_STATE_KEY, JSON.stringify(next)).catch((err) => {
    logger.warn("[PriceAverages] State not saved:", { error: err.message });
  });
  return next;
}

/**
 * Put the averages on a new book: the previous book's, or — on a new day, and once an hour —
 * the stored state's (in place)
 * @param {object} env
 * @param {object} book - built this tick (after withDayRange)
 * @param {object|null} previousBook
 * @param {number} nowMs
 */
export async function withAverages(env, book, previousBook, nowMs = Date.now()) {
  carryAverages(book, previousBook);
  const through = shiftDay(tehranDay(nowMs), -1);
  const newHour = hourOf(previousBook?.updatedAt) !== hourOf(book.updatedAt);
  if (book.averagesThrough === through && !newHour) return book;
  try {
    const state = await averageStateThrough(env, historyKeysOf(book.items), through);
    if (state) applyAverages(book, averagesOf(state), through);
  } catch (err) {
    logger.warn("[PriceAverages] Not updated:", { error: err.message });
  }
  return book;
}

/** Forget the running sums (past days changed): the next hour's tick sums the windows again */
export async function resetPriceAverages(env) {
  await getStateStore(env)?.delete(AVERAGES_STATE_KEY).catch(() => {});
}
