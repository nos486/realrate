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

/* ─────────────────────────────────────────────────────────────
 * Market Rates KV
 * ───────────────────────────────────────────────────────────── */

export async function getLatestRatesCache(env) {
  const kv = getKv(env);
  if (!kv) return null;
  try {
    return await kv.get("latest_rates", "json");
  } catch (e) {
    logger.error("KV read error in getLatestRatesCache:", { error: e.message });
    return null;
  }
}

export async function setLatestRatesCache(env, latestRates) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.put("latest_rates", JSON.stringify(latestRates));
  } catch (e) {
    logger.error("KV write error for latest_rates:", { error: e.message });
  }
}

/* ─────────────────────────────────────────────────────────────
 * Single Price Source KV
 * ───────────────────────────────────────────────────────────── */

export async function getSourcePriceCache(env, id) {
  const kv = getKv(env);
  if (!kv || !id) return null;
  try {
    const data = await kv.get(`source_price:${id}`);
    if (data) return JSON.parse(data);

    const raw = await kv.get(`source_items:${id}`);
    if (raw) {
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        const price = items.length === 1 ? items[0].price : items.length;
        return {
          price,
          items,
          lastMultiData: items.length > 1 ? { items, totalCount: items.length } : undefined,
        };
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function setSourcePriceCache(env, id, data) {
  const kv = getKv(env);
  if (!kv || !id || !data) return;
  try {
    await kv.put(`source_price:${id}`, JSON.stringify(data), {
      expirationTtl: 86400 * 7,
    });
  } catch (e) {
    logger.warn("KV put error for source_price:", { id, error: e.message });
  }
}

export async function deleteSourcePriceCache(env, id) {
  const kv = getKv(env);
  if (!kv || !id) return;
  try {
    await kv.delete(`source_price:${id}`);
    await kv.delete(`source_items:${id}`);
    await kv.delete(`source_items_backup:${id}`);
    await kv.delete(`source_items_last_sync:${id}`);
  } catch (e) {
    logger.warn("KV delete error for source_price:", { id, error: e.message });
  }
}

/* ─────────────────────────────────────────────────────────────
 * Bourse, Emofid, and Charisma KV (Delegated to sourceItems)
 * ───────────────────────────────────────────────────────────── */

import { getSourceItems, saveSourceItems } from "./sourceItems.repository.js";

export const BOURSE_KV_KEY = "bourse_symbols_toman_v3";
export const BOURSE_BACKUP_KV_KEY = "bourse_symbols_backup_v1";
export const BOURSE_LAST_SYNC_KEY = "bourse_symbols_last_sync_v3";

export async function getBourseSymbolsCache(env) {
  const items = await getSourceItems(env, "src_def_bourse");
  return { cached: items.length > 0 ? JSON.stringify(items) : null, backup: null };
}

export async function setBourseSymbolsCache(env, compactJson) {
  const items = typeof compactJson === "string" ? JSON.parse(compactJson) : compactJson;
  await saveSourceItems(env, "src_def_bourse", items);
}

export async function getBourseLastSync(env) {
  const kv = getKv(env);
  return kv ? await kv.get(BOURSE_LAST_SYNC_KEY) : null;
}

export async function setBourseLastSync(env, timestamp, ttlSeconds = 86400 * 3) {
  const kv = getKv(env);
  if (!kv) return;
  await kv.put(BOURSE_LAST_SYNC_KEY, String(timestamp), { expirationTtl: ttlSeconds }).catch(() => {});
}

/* ── Forex Rates KV ── */
export const FOREX_KV_KEY = "forex_rates";
export const FOREX_HISTORY_RECORDED_KEY = "last_forex_d1_record";

export async function getForexRatesCache(env, cacheKey = FOREX_KV_KEY) {
  const kv = getKv(env);
  if (!kv) return null;
  try {
    return await kv.get(cacheKey, "json");
  } catch (e) {
    return null;
  }
}

export async function setForexRatesCache(env, record, cacheKey = FOREX_KV_KEY) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.put(cacheKey, JSON.stringify(record));
  } catch (e) {
    logger.warn("Error caching forex rates in KV:", { error: e.message });
  }
}

export async function getLastForexD1RecordTime(env, cacheKey = FOREX_HISTORY_RECORDED_KEY) {
  const kv = getKv(env);
  if (!kv) return null;
  try {
    return await kv.get(cacheKey);
  } catch (e) {
    return null;
  }
}

export async function setLastForexD1RecordTime(env, timestamp, ttlSeconds, cacheKey = FOREX_HISTORY_RECORDED_KEY) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.put(cacheKey, String(timestamp), {
      expirationTtl: ttlSeconds,
    });
  } catch (e) {
    logger.warn("Error updating forex D1 record cache in KV:", { error: e.message });
  }
}

/* ── Emofid Mutual Funds KV ── */
export const EMOFID_FUNDS_KV_KEY = "emofid_funds_v1";
export const EMOFID_FUNDS_BACKUP_KV_KEY = "emofid_funds_backup_v1";
export const EMOFID_LAST_SYNC_KEY = "emofid_funds_last_sync_v1";

export async function getEmofidFundsCache(env) {
  const items = await getSourceItems(env, "src_def_emofid");
  return { cached: items.length > 0 ? JSON.stringify(items) : null, backup: null };
}

export async function setEmofidFundsCache(env, compactJson) {
  const items = typeof compactJson === "string" ? JSON.parse(compactJson) : compactJson;
  await saveSourceItems(env, "src_def_emofid", items);
}

export async function getEmofidLastSync(env) {
  const kv = getKv(env);
  return kv ? await kv.get(EMOFID_LAST_SYNC_KEY) : null;
}

export async function setEmofidLastSync(env, timestamp, ttlSeconds = 86400) {
  const kv = getKv(env);
  if (!kv) return;
  await kv.put(EMOFID_LAST_SYNC_KEY, String(timestamp), { expirationTtl: ttlSeconds }).catch(() => {});
}

/* ── Charisma Investment Funds KV ── */
export const CHARISMA_FUNDS_KV_KEY = "charisma_funds_v1";
export const CHARISMA_FUNDS_BACKUP_KV_KEY = "charisma_funds_backup_v1";
export const CHARISMA_LAST_SYNC_KEY = "charisma_funds_last_sync_v1";

export async function getCharismaFundsCache(env) {
  const items = await getSourceItems(env, "src_def_charisma");
  return { cached: items.length > 0 ? JSON.stringify(items) : null, backup: null };
}

export async function setCharismaFundsCache(env, compactJson) {
  const items = typeof compactJson === "string" ? JSON.parse(compactJson) : compactJson;
  await saveSourceItems(env, "src_def_charisma", items);
}

export async function getCharismaLastSync(env) {
  const kv = getKv(env);
  return kv ? await kv.get(CHARISMA_LAST_SYNC_KEY) : null;
}

export async function setCharismaLastSync(env, timestamp, ttlSeconds = 86400) {
  const kv = getKv(env);
  if (!kv) return;
  await kv.put(CHARISMA_LAST_SYNC_KEY, String(timestamp), { expirationTtl: ttlSeconds }).catch(() => {});
}

/* ── Charisma Investment Plans KV ── */
export const CHARISMA_PLANS_KV_KEY = "charisma_plans_v1";
export const CHARISMA_PLANS_BACKUP_KV_KEY = "charisma_plans_backup_v1";
export const CHARISMA_PLANS_LAST_SYNC_KEY = "charisma_plans_last_sync_v1";

export async function getCharismaPlansCache(env) {
  const items = await getSourceItems(env, "src_def_charisma_plans");
  return { cached: items.length > 0 ? JSON.stringify(items) : null, backup: null };
}

export async function setCharismaPlansCache(env, compactJson) {
  const items = typeof compactJson === "string" ? JSON.parse(compactJson) : compactJson;
  await saveSourceItems(env, "src_def_charisma_plans", items);
}

export async function getCharismaPlansLastSync(env) {
  const kv = getKv(env);
  return kv ? await kv.get(CHARISMA_PLANS_LAST_SYNC_KEY) : null;
}

export async function setCharismaPlansLastSync(env, timestamp, ttlSeconds = 86400) {
  const kv = getKv(env);
  if (!kv) return;
  await kv.put(CHARISMA_PLANS_LAST_SYNC_KEY, String(timestamp), { expirationTtl: ttlSeconds }).catch(() => {});
}


