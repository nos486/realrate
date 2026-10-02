/**
 * priceBookStore.repository.js — The price book: the latest price of every item, one JSON under
 * "prices" in the state store (Postgres, stateStore.repository.js)
 *
 * Every price request reads it, so a read is kept in this isolate's memory for a few seconds and
 * concurrent reads share one query (the cron's own reads skip the memory: `fresh`).
 */

import { logger } from "../lib/logger.js";
import { getStateStore } from "./stateStore.repository.js";

export const PRICE_BOOK_KEY = "prices";
export const PRICE_BOOK_MEMO_MS = 5000;

let bookMemo = null; // { book, at }
let inFlight = null; // the read under way, shared by everyone asking meanwhile

/** For tests: forget the price book kept in memory */
export function resetPriceBookMemo() {
  bookMemo = null;
  inFlight = null;
}

/**
 * @param {object} env
 * @param {{ fresh?: boolean }} [options] fresh: skip the in-memory copy
 * @returns {Promise<{ updatedAt: string, items: Record<string, object> }|null>}
 */
export async function getPriceBookCache(env, { fresh = false } = {}) {
  const store = getStateStore(env);
  if (!store) return null;
  if (!fresh && bookMemo && Date.now() - bookMemo.at < PRICE_BOOK_MEMO_MS) return bookMemo.book;
  if (!fresh && inFlight) return inFlight;
  const read = (async () => {
    try {
      const book = await store.get(PRICE_BOOK_KEY, "json");
      bookMemo = { book, at: Date.now() };
      return book;
    } catch (e) {
      logger.error("State read error for prices:", { error: e.message });
      return bookMemo ? bookMemo.book : null;
    }
  })();
  if (fresh) return read;
  inFlight = read;
  try {
    return await read;
  } finally {
    if (inFlight === read) inFlight = null;
  }
}

export async function setPriceBookCache(env, book) {
  const store = getStateStore(env);
  if (!store) return;
  try {
    await store.put(PRICE_BOOK_KEY, JSON.stringify(book));
    bookMemo = { book, at: Date.now() };
  } catch (e) {
    logger.error("State write error for prices:", { error: e.message });
  }
}
