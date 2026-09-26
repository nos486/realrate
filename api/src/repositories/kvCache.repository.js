/**
 * kvCache.repository.js — Encapsulated Cloudflare KV Data Access Layer
 * Provides clean access methods for all KV keys used in RealRate
 */

import { logger } from "../lib/logger.js";
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
 * Price book KV: the latest price of every item, one JSON under "prices"
 * ───────────────────────────────────────────────────────────── */

export const PRICE_BOOK_KV_KEY = "prices";

/** @returns {Promise<{ updatedAt: string, items: Record<string, object> }|null>} */
export async function getPriceBookCache(env) {
  const kv = getKv(env);
  if (!kv) return null;
  try {
    return await kv.get(PRICE_BOOK_KV_KEY, "json");
  } catch (e) {
    logger.error("KV read error for prices:", { error: e.message });
    return null;
  }
}

export async function setPriceBookCache(env, book) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.put(PRICE_BOOK_KV_KEY, JSON.stringify(book));
  } catch (e) {
    logger.error("KV write error for prices:", { error: e.message });
  }
}
