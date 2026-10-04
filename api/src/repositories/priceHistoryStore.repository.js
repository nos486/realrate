/**
 * priceHistoryStore.repository.js — An item's daily history as clients read it: the past days
 * from a snapshot in Workers KV, today from the price book (also in KV)
 *
 * The standard for serving a whole history, as the price book is for the latest prices:
 *  - Past days never change (only an admin's backfill, move or delete does), so the history up to
 *    yesterday is read from D1 (price_daily) once a day per item and kept as one JSON under
 *    "history:<id>" (HISTORY_STORE_PREFIX): { v, key, since, through, values } — one close per day
 *    from `since` to `through` (yesterday).
 *  - Today is the book's live price (priceBookStore.repository.js), appended on every read.
 *  So a request reads KV only; D1 is read when the day turns over (the first request of the day
 *  rebuilds the snapshot) or after an admin change dropped it (dropHistorySnapshots).
 *
 * A snapshot is also kept in this isolate's memory for a minute, and concurrent rebuilds of one
 * item share one D1 read. An item with no recorded day writes nothing (an unknown id costs no
 * write). Without KV the D1 state store holds the snapshots (kvStore.repository.js).
 */

import { logger } from "../lib/logger.js";
import { normalizePriceId } from "../domain/priceBook.js";
import { getBlobStore } from "./kvStore.repository.js";
import { getPriceBookCache } from "./priceBookStore.repository.js";
import { readFullHistory, tehranDay, addDays } from "./priceHistory.repository.js";

export const HISTORY_STORE_PREFIX = "history:";
export const HISTORY_SNAPSHOT_VERSION = 1;
export const HISTORY_MEMO_MS = 60_000;

/** The store key of an item's snapshot */
export const historyStoreKey = (id) => `${HISTORY_STORE_PREFIX}${normalizePriceId(id)}`;

/** id → { snapshot, at } and id → the rebuild under way */
const memo = new Map();
const inFlight = new Map();

/** For tests: forget the snapshots kept in memory */
export function resetHistorySnapshotMemo() {
  memo.clear();
  inFlight.clear();
}

const isSnapshot = (s) => s?.v === HISTORY_SNAPSHOT_VERSION && Array.isArray(s.values) && typeof s.through === "string";

/** Read past days from D1 and keep them as the item's snapshot. undefined: no history; null: D1 failed */
async function rebuildSnapshot(env, id, through) {
  const past = await readFullHistory(env, id, { through });
  if (!past) return past;
  const snapshot = { v: HISTORY_SNAPSHOT_VERSION, key: id, since: past.since, through, values: past.values };
  try {
    await getBlobStore(env)?.put(historyStoreKey(id), JSON.stringify(snapshot));
  } catch (e) {
    logger.warn("[PriceHistory] Snapshot write failed:", { error: e.message, key: id });
  }
  return snapshot;
}

/**
 * An item's history up to yesterday (from memory, KV, else rebuilt from D1)
 * @returns {Promise<{ since: string, through: string, values: number[] }|null|undefined>}
 *   undefined when the item has no past day, null when the history can't be read now
 */
export async function getPastHistory(env, key, { now = Date.now() } = {}) {
  const id = normalizePriceId(key);
  if (!id) return undefined;
  const through = addDays(tehranDay(now), -1);

  const kept = memo.get(id);
  if (kept && kept.snapshot.through === through && now - kept.at < HISTORY_MEMO_MS) return kept.snapshot;
  if (inFlight.has(id)) return inFlight.get(id);

  const read = (async () => {
    let snapshot = null;
    try {
      snapshot = await getBlobStore(env)?.get(historyStoreKey(id), "json");
    } catch (e) {
      logger.warn("[PriceHistory] Snapshot read failed:", { error: e.message, key: id });
    }
    // Yesterday isn't in it yet (the day turned over), or it was dropped: read D1 once
    if (!isSnapshot(snapshot) || snapshot.through !== through) snapshot = await rebuildSnapshot(env, id, through);
    if (snapshot) memo.set(id, { snapshot, at: now });
    return snapshot;
  })();
  inFlight.set(id, read);
  try {
    return await read;
  } finally {
    inFlight.delete(id);
  }
}

/**
 * An item's whole daily history: a close per day from its first day to today, today being the
 * book's live price (a quiet day carries the last close)
 * @returns {Promise<{ since: string, values: number[] }|null|undefined>} undefined when the item
 *   has no history, null when it can't be read now
 */
export async function getItemHistory(env, key, { now = Date.now(), getBook = getPriceBookCache } = {}) {
  const id = normalizePriceId(key);
  if (!id) return undefined;
  const today = tehranDay(now);
  const [past, book] = await Promise.all([getPastHistory(env, id, { now }), getBook(env).catch(() => null)]);
  if (past === null) return null;

  const live = Number(book?.items?.[id]?.price);
  const todayValue = Number.isFinite(live) && live > 0 ? live : null;
  if (!past) return todayValue === null ? undefined : { since: today, values: [todayValue] };

  const values = [...past.values];
  const last = values[values.length - 1];
  // Days between the snapshot and today (none normally), then today
  for (let day = addDays(past.through, 1); day < today; day = addDays(day, 1)) values.push(last);
  values.push(todayValue ?? last);
  return { since: past.since, values };
}

/**
 * Drop items' snapshots after their past days changed (a backfill, a move, a delete): the next read
 * rebuilds them from D1. Never throws.
 * @param {object} env
 * @param {string[]} keys
 */
export async function dropHistorySnapshots(env, keys) {
  const ids = [...new Set((keys || []).map(normalizePriceId).filter(Boolean))];
  const store = getBlobStore(env);
  await Promise.all(ids.map(async (id) => {
    memo.delete(id);
    try {
      await store?.delete(historyStoreKey(id));
    } catch (e) {
      logger.warn("[PriceHistory] Snapshot delete failed:", { error: e.message, key: id });
    }
  }));
}
