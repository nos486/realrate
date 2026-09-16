/**
 * kvCache.repository.js — Encapsulated Cloudflare KV Data Access Layer
 * Provides clean access methods for all KV keys used in RealRate
 */

import { logger } from "../lib/logger.js";
import { SESSION_TTL_SECONDS, BOURSE_SYNC_EXPIRATION_TTL } from "../config/constants.js";

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
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

export async function setSourcePriceCache(env, id, data) {
  const kv = getKv(env);
  if (!kv || !id) return;
  try {
    await kv.put(`source_price:${id}`, JSON.stringify(data));
  } catch (e) {
    logger.warn("KV write error for source_price:", { id, error: e.message });
  }
}

export async function deleteSourcePriceCache(env, id) {
  const kv = getKv(env);
  if (!kv || !id) return;
  try {
    await kv.delete(`source_price:${id}`);
  } catch (e) {
    logger.warn("KV delete error for source_price:", { id, error: e.message });
  }
}

/* ─────────────────────────────────────────────────────────────
 * Bourse Symbols KV
 * ───────────────────────────────────────────────────────────── */

export const BOURSE_KV_KEY = "bourse_symbols_toman_v3";
export const BOURSE_BACKUP_KV_KEY = "bourse_symbols_backup_v1";
export const BOURSE_LAST_SYNC_KEY = "bourse_symbols_last_sync_v3";

export async function getBourseSymbolsCache(env) {
  const kv = getKv(env);
  if (!kv) return { cached: null, backup: null };
  try {
    const cached = await kv.get(BOURSE_KV_KEY);
    let backup = null;
    if (!cached) {
      backup = await kv.get(BOURSE_BACKUP_KV_KEY);
    }
    return { cached, backup };
  } catch (e) {
    logger.error("Error reading bourse KV:", { error: e.message });
    return { cached: null, backup: null };
  }
}

export async function setBourseSymbolsCache(env, compactJson, alsoBackup = true) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.put(BOURSE_KV_KEY, compactJson);
    if (alsoBackup) {
      await kv.put(BOURSE_BACKUP_KV_KEY, compactJson).catch(() => {});
    }
  } catch (e) {
    logger.error("Error saving bourse symbols in KV:", { error: e.message });
  }
}

export async function getBourseLastSync(env) {
  const kv = getKv(env);
  if (!kv) return null;
  try {
    return await kv.get(BOURSE_LAST_SYNC_KEY);
  } catch (e) {
    return null;
  }
}

export async function setBourseLastSync(env, timestamp, ttlSeconds = BOURSE_SYNC_EXPIRATION_TTL) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.put(BOURSE_LAST_SYNC_KEY, String(timestamp), {
      expirationTtl: ttlSeconds,
    });
  } catch (e) {
    logger.error("Error saving bourse last sync to KV:", { error: e.message });
  }
}

/* ─────────────────────────────────────────────────────────────
 * Forex Rates KV
 * ───────────────────────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────────────────────
 * Emofid Mutual Funds KV
 * ───────────────────────────────────────────────────────────── */

export const EMOFID_FUNDS_KV_KEY = "emofid_funds_v1";
export const EMOFID_FUNDS_BACKUP_KV_KEY = "emofid_funds_backup_v1";
export const EMOFID_LAST_SYNC_KEY = "emofid_funds_last_sync_v1";

export async function getEmofidFundsCache(env) {
  const kv = getKv(env);
  if (!kv) return { cached: null, backup: null };
  try {
    const cached = await kv.get(EMOFID_FUNDS_KV_KEY);
    let backup = null;
    if (!cached) {
      backup = await kv.get(EMOFID_FUNDS_BACKUP_KV_KEY);
    }
    return { cached, backup };
  } catch (e) {
    logger.error("Error reading emofid funds KV:", { error: e.message });
    return { cached: null, backup: null };
  }
}

export async function setEmofidFundsCache(env, compactJson, alsoBackup = true) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.put(EMOFID_FUNDS_KV_KEY, compactJson);
    if (alsoBackup) {
      await kv.put(EMOFID_FUNDS_BACKUP_KV_KEY, compactJson).catch(() => {});
    }
  } catch (e) {
    logger.error("Error saving emofid funds in KV:", { error: e.message });
  }
}

export async function getEmofidLastSync(env) {
  const kv = getKv(env);
  if (!kv) return null;
  try {
    return await kv.get(EMOFID_LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export async function setEmofidLastSync(env, timestamp, ttlSeconds = 86400) {
  const kv = getKv(env);
  if (!kv) return;
  try {
    await kv.put(EMOFID_LAST_SYNC_KEY, String(timestamp), {
      expirationTtl: ttlSeconds,
    });
  } catch (e) {
    logger.error("Error saving emofid last sync to KV:", { error: e.message });
  }
}
