/**
 * sourceItems.repository.js — Unified Storage for Price Source Items (KV + D1)
 *
 * Single Source of Truth for persisting and retrieving items extracted by any adapter:
 * - Standard KV keys:
 *     source_items:${sourceId}
 *     source_items_backup:${sourceId}
 *     source_items_last_sync:${sourceId}
 * - D1 Database Mirror:
 *     price_sources table (last_price, last_multi_data, last_fetched, updated_at)
 */

import { getKv } from "./kvCache.repository.js";
import { logger } from "../lib/logger.js";

export const SOURCE_ITEMS_KEY_PREFIX = "source_items:";
export const SOURCE_ITEMS_BACKUP_KEY_PREFIX = "source_items_backup:";
export const SOURCE_ITEMS_LAST_SYNC_KEY_PREFIX = "source_items_last_sync:";

/**
 * Saves standardized items array for a source to KV (primary + backup + sync timestamp)
 * and mirrors last price/metadata to D1 database.
 *
 * @param {object} env - Cloudflare Worker environment
 * @param {string} sourceId - Unique source identifier (e.g. "src_def_bourse", "src_def_usd")
 * @param {Array<object>} items - Array of standardized items [{ id, name, price }, ...]
 * @param {object} [options={}] - Optional metadata (datetime, ttlSeconds, etc.)
 * @returns {Promise<boolean>}
 */
export async function saveSourceItems(env, sourceId, items, options = {}) {
  if (!env || !sourceId || !Array.isArray(items)) {
    return false;
  }

  const nowIso = options.datetime || new Date().toISOString();
  const compactJson = JSON.stringify(items);
  const kv = getKv(env);

  // 1. Persist to standard KV keys
  if (kv) {
    try {
      await kv.put(`${SOURCE_ITEMS_KEY_PREFIX}${sourceId}`, compactJson);
      await kv.put(`${SOURCE_ITEMS_BACKUP_KEY_PREFIX}${sourceId}`, compactJson).catch(() => {});
      await kv.put(`${SOURCE_ITEMS_LAST_SYNC_KEY_PREFIX}${sourceId}`, nowIso, {
        expirationTtl: options.ttlSeconds || 86400 * 3,
      }).catch(() => {});
    } catch (err) {
      logger.error(`[saveSourceItems] KV write error for ${sourceId}:`, { error: err.message });
    }
  }

  // 2. Mirror to D1 database
  if (env.DB) {
    try {
      const primaryPrice = items.length === 1 ? (Number(items[0]?.price) || 0) : items.length;
      const multiDataJson = items.length > 1
        ? JSON.stringify({
            totalCount: items.length,
            items,
            datetime: nowIso,
          })
        : "";

      await env.DB.prepare(`
        UPDATE price_sources
        SET last_price = ?,
            last_multi_data = CASE WHEN ? != '' THEN ? ELSE last_multi_data END,
            last_fetched = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(primaryPrice, multiDataJson, multiDataJson, nowIso, nowIso, sourceId).run().catch(() => {});
    } catch (d1Err) {
      logger.warn(`[saveSourceItems] D1 mirror write error for ${sourceId}:`, { error: d1Err.message });
    }
  }

  return true;
}

const SOURCE_ID_ALIASES = {
  bourse_symbols: "src_def_bourse",
  bourse: "src_def_bourse",
  emofid_funds: "src_def_emofid",
  emofid: "src_def_emofid",
  charisma_funds: "src_def_charisma",
  charisma: "src_def_charisma",
  charisma_plans: "src_def_charisma_plans",
};

/**
 * Retrieves items array for a source from KV (primary -> backup -> legacy fallbacks -> D1).
 *
 * @param {object} env - Cloudflare Worker environment
 * @param {string} sourceId - Source identifier
 * @returns {Promise<Array<object>>} - Array of items [{ id, name, price }, ...]
 */
export async function getSourceItems(env, sourceId) {
  if (!env || !sourceId) {
    return [];
  }

  const canonicalId = SOURCE_ID_ALIASES[sourceId] || sourceId;
  const idsToCheck = Array.from(new Set([sourceId, canonicalId]));
  const kv = getKv(env);

  // 1. Primary & Backup KV for all candidate IDs
  if (kv) {
    try {
      for (const id of idsToCheck) {
        const cached = await kv.get(`${SOURCE_ITEMS_KEY_PREFIX}${id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          if (Array.isArray(parsed?.items) && parsed.items.length > 0) return parsed.items;
        }

        const backup = await kv.get(`${SOURCE_ITEMS_BACKUP_KEY_PREFIX}${id}`);
        if (backup) {
          const parsed = JSON.parse(backup);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          if (Array.isArray(parsed?.items) && parsed.items.length > 0) return parsed.items;
        }
      }

      // 2. Legacy KV keys fallback (transition period)
      const legacyKeyMap = {
        src_def_bourse: "bourse_symbols_toman_v3",
        bourse_symbols: "bourse_symbols_toman_v3",
        bourse: "bourse_symbols_toman_v3",

        src_def_emofid: "emofid_funds_v1",
        emofid_funds: "emofid_funds_v1",
        emofid: "emofid_funds_v1",

        src_def_charisma: "charisma_funds_v1",
        charisma_funds: "charisma_funds_v1",
        charisma: "charisma_funds_v1",

        src_def_charisma_plans: "charisma_plans_v1",
        charisma_plans: "charisma_plans_v1",
      };

      for (const id of idsToCheck) {
        const legacyKey = legacyKeyMap[id];
        if (legacyKey) {
          const legacyStr = await kv.get(legacyKey);
          if (legacyStr) {
            const parsed = JSON.parse(legacyStr);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            if (Array.isArray(parsed?.items) && parsed.items.length > 0) return parsed.items;
          }
        }
      }

      // Also check source_price:${id}
      for (const id of idsToCheck) {
        const sp = await kv.get(`source_price:${id}`);
        if (sp) {
          const parsed = JSON.parse(sp);
          if (Array.isArray(parsed?.items) && parsed.items.length > 0) return parsed.items;
          if (Array.isArray(parsed?.lastMultiData?.items) && parsed.lastMultiData.items.length > 0) return parsed.lastMultiData.items;
          if (parsed?.price !== undefined) {
            return [{ id, name: parsed.name || id, price: Number(parsed.price) }];
          }
        }
      }
    } catch (err) {
      logger.warn(`[getSourceItems] KV read error for ${sourceId}:`, { error: err.message });
    }
  }

  // 4. D1 Fallback
  if (env.DB) {
    try {
      const row = await env.DB.prepare(
        "SELECT last_price, last_multi_data FROM price_sources WHERE id = ?"
      ).bind(sourceId).first();

      if (row) {
        if (row.last_multi_data) {
          try {
            const parsed = JSON.parse(row.last_multi_data);
            if (Array.isArray(parsed)) return parsed;
            if (Array.isArray(parsed?.items)) return parsed.items;
          } catch (_) {}
        }
        if (Number(row.last_price) > 0) {
          return [{ id: sourceId, name: sourceId, price: Number(row.last_price) }];
        }
      }
    } catch (d1Err) {
      logger.warn(`[getSourceItems] D1 fallback read error for ${sourceId}:`, { error: d1Err.message });
    }
  }

  return [];
}

/**
 * Gets last sync timestamp (as ms number) for a source.
 * @param {object} env
 * @param {string} sourceId
 * @returns {Promise<number|null>}
 */
export async function getSourceLastSync(env, sourceId) {
  const kv = getKv(env);
  if (!kv || !sourceId) return null;

  const canonicalId = SOURCE_ID_ALIASES[sourceId] || sourceId;
  const idsToCheck = Array.from(new Set([sourceId, canonicalId]));

  try {
    for (const id of idsToCheck) {
      const primary = await kv.get(`${SOURCE_ITEMS_LAST_SYNC_KEY_PREFIX}${id}`);
      if (primary) {
        const parsed = parseInt(primary, 10);
        if (!isNaN(parsed)) return parsed;
        const dateParsed = Date.parse(primary);
        if (!isNaN(dateParsed)) return dateParsed;
      }
    }

    const legacyKeyMap = {
      src_def_bourse: "bourse_symbols_last_sync_v3",
      bourse_symbols: "bourse_symbols_last_sync_v3",
      src_def_emofid: "emofid_funds_last_sync_v1",
      emofid_funds: "emofid_funds_last_sync_v1",
      src_def_charisma: "charisma_funds_last_sync_v1",
      charisma_funds: "charisma_funds_last_sync_v1",
      src_def_charisma_plans: "charisma_plans_last_sync_v1",
      charisma_plans: "charisma_plans_last_sync_v1",
    };

    for (const id of idsToCheck) {
      const legacyKey = legacyKeyMap[id];
      if (legacyKey) {
        const legacy = await kv.get(legacyKey);
        if (legacy) {
          const parsed = parseInt(legacy, 10);
          if (!isNaN(parsed)) return parsed;
        }
      }
    }
  } catch (err) {
    logger.warn(`[getSourceLastSync] Error reading last sync for ${sourceId}:`, { error: err.message });
  }
  return null;
}

/**
 * Sets last sync timestamp for a source in KV.
 * @param {object} env
 * @param {string} sourceId
 * @param {number|string} timestamp
 * @param {number} [ttlSeconds=259200]
 * @returns {Promise<boolean>}
 */
export async function setSourceLastSync(env, sourceId, timestamp, ttlSeconds = 86400 * 3) {
  const kv = getKv(env);
  if (!kv || !sourceId) return false;

  try {
    await kv.put(`${SOURCE_ITEMS_LAST_SYNC_KEY_PREFIX}${sourceId}`, String(timestamp), {
      expirationTtl: ttlSeconds,
    });
    return true;
  } catch (err) {
    logger.warn(`[setSourceLastSync] Error writing last sync for ${sourceId}:`, { error: err.message });
    return false;
  }
}
