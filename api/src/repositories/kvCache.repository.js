/**
 * kvCache.repository.js — Encapsulated Cloudflare KV Data Access Layer
 * Provides clean access methods for all KV keys used in RealRate
 */

import { logger } from "../lib/logger.js";
import { getStateStore } from "./stateStore.repository.js";
import { SESSION_TTL_SECONDS } from "../config/constants.js";

/**
 * Resolve the KV binding from env
 * @param {object} env
 * @returns {object|null}
 */
export function getKv(env) {
  return env?.REALRATE_KV || env?.KV || null;
}

/* ─────────────────────────────────────────────────────────────
 * Sessions KV
 * ───────────────────────────────────────────────────────────── */

export async function getSessionKV(env, token) {
  const kv = getKv(env);
  if (!kv || !token) return null;
  try {
    const sessionStr = await kv.get(`session:${token}`);
    return sessionStr ? JSON.parse(sessionStr) : null;
  } catch (e) {
    logger.warn("KV getSession error:", { token, error: e.message });
    return null;
  }
}

export async function setSessionKV(env, token, sessionData, ttlSeconds = SESSION_TTL_SECONDS) {
  const kv = getKv(env);
  if (!kv || !token) return;
  try {
    await kv.put(`session:${token}`, JSON.stringify(sessionData), {
      expirationTtl: ttlSeconds,
    });
  } catch (e) {
    logger.error("KV setSession error:", { token, error: e.message });
  }
}

export async function deleteSessionKV(env, token) {
  const kv = getKv(env);
  if (!kv || !token) return;
  try {
    await kv.delete(`session:${token}`);
  } catch (e) {
    logger.warn("KV deleteSession error:", { token, error: e.message });
  }
}

/* ─────────────────────────────────────────────────────────────
 * Global Settings KV
 * ───────────────────────────────────────────────────────────── */

export async function getGlobalSettingsKV(env) {
  const kv = getKv(env);
  if (!kv) return null;
  try {
    const storedStr = await kv.get("global_settings");
    return storedStr ? JSON.parse(storedStr) : null;
  } catch (e) {
    logger.error("Error reading global_settings from KV:", { error: e.message });
    return null;
  }
}

export async function setGlobalSettingsKV(env, settings) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.put("global_settings", JSON.stringify(settings));
  } catch (e) {
    logger.error("Error writing global_settings to KV:", { error: e.message });
  }
}

/* ─────────────────────────────────────────────────────────────
 * Price book: the latest price of every item, one JSON under "prices" in the state store
 * (Postgres; stateStore.repository.js). Every price request reads it, so a read is kept in this
 * isolate's memory for a few seconds (the cron's own reads skip that: `fresh`).
 * ───────────────────────────────────────────────────────────── */

export const PRICE_BOOK_KV_KEY = "prices";
export const PRICE_BOOK_MEMO_MS = 5000;

let bookMemo = null; // { book, at }

/** For tests: forget the price book kept in memory */
export function resetPriceBookMemo() {
  bookMemo = null;
}

/**
 * @param {object} env
 * @param {{ fresh?: boolean }} [options] fresh: skip the in-memory copy
 * @returns {Promise<{ updatedAt: string, items: Record<string, object> }|null>}
 */
export async function getPriceBookCache(env, { fresh = false } = {}) {
  const store = getStateStore(env);
  if (!store) return null;
  const memo = store.kind === "postgres";
  if (memo && !fresh && bookMemo && Date.now() - bookMemo.at < PRICE_BOOK_MEMO_MS) return bookMemo.book;
  try {
    const book = await store.get(PRICE_BOOK_KV_KEY, "json");
    if (memo) bookMemo = { book, at: Date.now() };
    return book;
  } catch (e) {
    logger.error("State read error for prices:", { error: e.message });
    return memo && bookMemo ? bookMemo.book : null;
  }
}

export async function setPriceBookCache(env, book) {
  const store = getStateStore(env);
  if (!store) return;
  try {
    await store.put(PRICE_BOOK_KV_KEY, JSON.stringify(book));
    if (store.kind === "postgres") bookMemo = { book, at: Date.now() };
  } catch (e) {
    logger.error("State write error for prices:", { error: e.message });
  }
}
