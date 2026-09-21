/**
 * priceSource.repository.js — Cloudflare D1 & KV Price Sources Data Access Layer
 */

import { ensureD1Tables } from "./migration.repository.js";
import {
  getSourcePriceCache,
  setSourcePriceCache,
  deleteSourcePriceCache,
} from "./kvCache.repository.js";
import { getSourceItems, saveSourceItems } from "./sourceItems.repository.js";
import {
  getMasterPriceSourcesConfig,
  getMasterPriceSourceById,
} from "../config/sources.config.js";
import { logger } from "../lib/logger.js";
import { DEFAULT_FETCH_INTERVAL_SEC } from "../config/constants.js";

/* ─────────────────────────────────────────────────────────────
 * Price Sources CRUD & Management (Code-First + KV/D1 Runtime Cache)
 * ───────────────────────────────────────────────────────────── */

/**
 * Helper to normalize row schema
 */
function normalizePriceSourceRow(row) {
  let parsedFieldMapping = null;
  if (row.fieldMapping) {
    try { parsedFieldMapping = typeof row.fieldMapping === 'string' ? JSON.parse(row.fieldMapping) : row.fieldMapping; } catch {}
  }
  let parsedExcludedOutputs = [];
  if (row.excludedOutputs) {
    try { parsedExcludedOutputs = typeof row.excludedOutputs === 'string' ? JSON.parse(row.excludedOutputs) : row.excludedOutputs; } catch {}
  }
  let parsedDisplayConfig = null;
  if (row.displayConfig) {
    try { parsedDisplayConfig = typeof row.displayConfig === 'string' ? JSON.parse(row.displayConfig) : row.displayConfig; } catch {}
  }
  let parsedLastMultiData = null;
  if (row.lastMultiData) {
    try { parsedLastMultiData = typeof row.lastMultiData === 'string' ? JSON.parse(row.lastMultiData) : row.lastMultiData; } catch {}
  }
  return {
    ...row,
    fieldMapping: parsedFieldMapping || row.fieldMapping || null,
    excludedOutputs: Array.isArray(parsedExcludedOutputs) ? parsedExcludedOutputs : [],
    displayConfig: parsedDisplayConfig || null,
    lastMultiData: parsedLastMultiData !== null ? parsedLastMultiData : (row.lastMultiData || null),
    channelUsername: row.sourceType === "telegram" ? row.endpoint : "",
    apiUrl: row.sourceType === "api_url" ? row.endpoint : "",
    regexPattern: row.regex || "",
    fetchIntervalMinutes: Math.round((row.fetchIntervalSec || 300) / 60),
  };
}

/**
 * Helper to hydrate catalog sources (Charisma, Emofid, Bourse) from their dedicated KV caches
 * when lastMultiData is empty or lastPrice is 0.
 */
export async function hydrateCatalogSourceFromKv(src, env, lastPrice = 0, lastFetched = null, lastMultiData = null) {
  if (!env || (lastMultiData && lastPrice > 0)) {
    return { lastPrice, lastFetched, lastMultiData };
  }
  try {
    const items = await getSourceItems(env, src.id);
    if (Array.isArray(items) && items.length > 0) {
      return {
        lastPrice: items.length,
        lastFetched: lastFetched || items[0]?.updatedAt || new Date().toISOString(),
        lastMultiData: {
          isCatalog: true,
          totalCount: items.length,
          items,
          compactList: items,
          sampleItems: items.slice(0, 50),
        },
      };
    }
  } catch (err) {
    logger.warn("hydrateCatalogSourceFromKv error:", { id: src.id, error: err.message });
  }
  return { lastPrice, lastFetched, lastMultiData };
}

/**
 * Get all price sources from Code-First registry, enriched with runtime KV/D1 cached prices
 * @param {object} env
 * @returns {Promise<Array>}
 */
export async function dbGetPriceSources(env) {
  const masterSources = getMasterPriceSourcesConfig();

  // Load latest cached runtime prices from KV (or fallback D1)
  const enriched = await Promise.all(
    masterSources.map(async (src) => {
      let lastPrice = src.lastPrice || 0;
      let lastFetched = src.lastFetched || "";
      let lastMultiData = src.lastMultiData || null;

      // 1. Check KV cache first (sub-millisecond)
      if (env) {
        const kvData = await getSourcePriceCache(env, src.id).catch(() => null);
        if (kvData) {
          lastPrice = Number(kvData.price) || lastPrice;
          lastFetched = kvData.lastFetched || lastFetched;
          lastMultiData = kvData.lastMultiData || lastMultiData;
        }

        // 2. Fallback to D1 if KV was empty
        if (!lastPrice && env.DB) {
          try {
            const row = await env.DB.prepare(
              "SELECT last_price, last_fetched, last_multi_data FROM price_sources WHERE id = ?"
            ).bind(src.id).first();
            if (row) {
              lastPrice = Number(row.last_price) || 0;
              lastFetched = row.last_fetched || "";
              if (row.last_multi_data) {
                try {
                  lastMultiData = typeof row.last_multi_data === 'string'
                    ? JSON.parse(row.last_multi_data)
                    : row.last_multi_data;
                } catch {}
              }
            }
          } catch {}
        }
      }

      // 3. Fallback to dedicated catalog KV caches if needed
      const hydrated = await hydrateCatalogSourceFromKv(src, env, lastPrice, lastFetched, lastMultiData);
      lastPrice = hydrated.lastPrice;
      lastFetched = hydrated.lastFetched;
      lastMultiData = hydrated.lastMultiData;

      return normalizePriceSourceRow({
        ...src,
        lastPrice,
        lastFetched,
        lastMultiData,
      });
    })
  );

  return enriched;
}

/**
 * Get single price source by ID from Code-First registry
 * @param {object} env
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function dbGetPriceSourceById(env, id) {
  if (!id) return null;
  const master = getMasterPriceSourceById(id);
  if (!master) return null;

  let lastPrice = master.lastPrice || 0;
  let lastFetched = master.lastFetched || "";
  let lastMultiData = master.lastMultiData || null;

  if (env) {
    const kvData = await getSourcePriceCache(env, id).catch(() => null);
    if (kvData) {
      lastPrice = Number(kvData.price) || lastPrice;
      lastFetched = kvData.lastFetched || lastFetched;
      lastMultiData = kvData.lastMultiData || lastMultiData;
    } else if (env.DB) {
      try {
        const row = await env.DB.prepare(
          "SELECT last_price, last_fetched, last_multi_data FROM price_sources WHERE id = ?"
        ).bind(id).first();
        if (row) {
          lastPrice = Number(row.last_price) || 0;
          lastFetched = row.last_fetched || "";
          if (row.last_multi_data) {
            try {
              lastMultiData = typeof row.last_multi_data === 'string'
                ? JSON.parse(row.last_multi_data)
                : row.last_multi_data;
            } catch {}
          }
        }
      } catch {}
    }

    const hydrated = await hydrateCatalogSourceFromKv(master, env, lastPrice, lastFetched, lastMultiData);
    lastPrice = hydrated.lastPrice;
    lastFetched = hydrated.lastFetched;
    lastMultiData = hydrated.lastMultiData;
  }

  return normalizePriceSourceRow({
    ...master,
    lastPrice,
    lastFetched,
    lastMultiData,
  });
}

/**
 * Save (create or update) a price source
 * @param {object} env
 * @param {object} data
 * @returns {Promise<object>}
 */
export async function dbSavePriceSource(env, data) {
  const name = String(data.name || "").trim();
  const priceType = String(data.priceType || data.price_type || "").trim();
  const endpoint = String(data.endpoint || data.channelUsername || data.apiUrl || "").trim();

  if (!name || !priceType || !endpoint) {
    throw new Error("نام، نوع قیمت و آدرس سورس (endpoint) الزامی هستند.");
  }

  const now = new Date().toISOString();
  const id = data.id || `src_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const sourceType = data.sourceType === "api_url" ? "api_url" : "telegram";
  const regex = String(data.regex || data.regexPattern || "").trim();
  const jsonPath = String(data.jsonPath || data.json_path || "").trim();
  const fieldMapping = data.fieldMapping !== undefined
    ? (typeof data.fieldMapping === 'object' ? JSON.stringify(data.fieldMapping) : String(data.fieldMapping))
    : (data.field_mapping !== undefined ? (typeof data.field_mapping === 'object' ? JSON.stringify(data.field_mapping) : String(data.field_mapping)) : '');
  const fetchIntervalSec = parseInt(data.fetchIntervalSec, 10) > 0
    ? parseInt(data.fetchIntervalSec, 10)
    : (parseInt(data.fetchIntervalMinutes, 10) > 0 ? parseInt(data.fetchIntervalMinutes, 10) * 60 : DEFAULT_FETCH_INTERVAL_SEC);
  const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1;
  let isPrimary = data.isPrimary !== undefined ? (data.isPrimary ? 1 : 0) : 0;
  const lastMultiData = data.lastMultiData !== undefined
    ? (typeof data.lastMultiData === 'string' ? data.lastMultiData : JSON.stringify(data.lastMultiData))
    : '';

  const excludedOutputsRaw = data.excludedOutputs !== undefined ? data.excludedOutputs : (data.excluded_outputs !== undefined ? data.excluded_outputs : []);
  const excludedOutputs = Array.isArray(excludedOutputsRaw) ? JSON.stringify(excludedOutputsRaw) : (String(excludedOutputsRaw || ''));

  const displayConfigRaw = data.displayConfig !== undefined ? data.displayConfig : (data.display_config !== undefined ? data.display_config : null);
  const displayConfig = displayConfigRaw
    ? (typeof displayConfigRaw === 'object' ? JSON.stringify(displayConfigRaw) : String(displayConfigRaw))
    : '';

  if (env && env.DB) {
    await ensureD1Tables(env);

    // If this source is marked as primary, demote other sources of same priceType
    if (isPrimary === 1) {
      await env.DB.prepare(`
        UPDATE price_sources
        SET is_primary = 0, updated_at = ?
        WHERE price_type = ? AND id != ?
      `).bind(now, priceType, id).run();
    } else {
      // If there is no existing primary source for this priceType, make this one primary
      const existingPrimary = await env.DB.prepare(`
        SELECT id FROM price_sources WHERE price_type = ? AND is_primary = 1 AND id != ?
      `).bind(priceType, id).first();
      if (!existingPrimary && isActive === 1) {
        isPrimary = 1;
      }
    }

    await env.DB.prepare(`
      INSERT INTO price_sources (
        id, name, price_type, source_type, endpoint, regex, json_path, field_mapping,
        excluded_outputs, display_config,
        fetch_interval_sec, is_active, is_primary, last_price, last_multi_data, last_fetched,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        price_type = excluded.price_type,
        source_type = excluded.source_type,
        endpoint = excluded.endpoint,
        regex = excluded.regex,
        json_path = excluded.json_path,
        field_mapping = excluded.field_mapping,
        excluded_outputs = excluded.excluded_outputs,
        display_config = excluded.display_config,
        fetch_interval_sec = excluded.fetch_interval_sec,
        is_active = excluded.is_active,
        is_primary = excluded.is_primary,
        last_multi_data = CASE WHEN excluded.last_multi_data != '' THEN excluded.last_multi_data ELSE price_sources.last_multi_data END,
        updated_at = excluded.updated_at
    `).bind(
      id,
      name,
      priceType,
      sourceType,
      endpoint,
      regex,
      jsonPath,
      fieldMapping,
      excludedOutputs,
      displayConfig,
      fetchIntervalSec,
      isActive,
      isPrimary,
      data.lastPrice !== undefined ? Number(data.lastPrice) : 0,
      lastMultiData,
      data.lastFetched || '',
      data.createdAt || now,
      now
    ).run();

    const saved = await dbGetPriceSourceById(env, id);
    return saved;
  }

  return null;
}

/**
 * Delete a price source by ID
 * @param {object} env
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function dbDeletePriceSource(env, id) {
  if (!id) return false;

  if (env && env.DB) {
    await ensureD1Tables(env);

    const target = await dbGetPriceSourceById(env, id);

    // Delete the source configuration
    await env.DB.prepare("DELETE FROM price_sources WHERE id = ?").bind(id).run();

    // If was primary, promote the next active source of this price_type
    if (target?.isPrimary) {
      const nextCandidate = await env.DB.prepare(`
        SELECT id FROM price_sources
        WHERE price_type = ? AND is_active = 1
        ORDER BY created_at ASC
        LIMIT 1
      `).bind(target.priceType).first();

      if (nextCandidate) {
        await env.DB.prepare(`
          UPDATE price_sources
          SET is_primary = 1, updated_at = ?
          WHERE id = ?
        `).bind(new Date().toISOString(), nextCandidate.id).run();
      }
    }

    // Remove from KV
    await deleteSourcePriceCache(env, id);

    return true;
  }

  return false;
}

/**
 * Set a specific price source as primary for its price type
 * @param {object} env
 * @param {string} id
 * @param {string} [priceType=null]
 * @returns {Promise<object|null>}
 */
export async function dbSetPrimaryPriceSource(env, id, priceType = null) {
  if (!id) throw new Error("شناسه سورس الزامی است.");

  if (env && env.DB) {
    await ensureD1Tables(env);
    const now = new Date().toISOString();

    let targetType = priceType;
    if (!targetType) {
      const source = await dbGetPriceSourceById(env, id);
      if (!source) throw new Error("سورس مورد نظر یافت نشد.");
      targetType = source.priceType;
    }

    // Demote others of this price type
    await env.DB.prepare(`
      UPDATE price_sources
      SET is_primary = 0, updated_at = ?
      WHERE price_type = ?
    `).bind(now, targetType).run();

    // Promote target
    await env.DB.prepare(`
      UPDATE price_sources
      SET is_primary = 1, is_active = 1, updated_at = ?
      WHERE id = ?
    `).bind(now, id).run();

    const updated = await dbGetPriceSourceById(env, id);
    return updated;
  }

  return null;
}

/**
 * Update last price and fetched timestamp of a source
 * @param {object} env
 * @param {string} id
 * @param {number} lastPrice
 * @param {string} [lastFetched=null]
 * @param {string|object|null} [lastMultiData=null]
 */
export async function dbUpdateSourceLastPrice(env, id, lastPrice, lastFetched = null, lastMultiData = null) {
  if (!id || !env) return;
  const isoTime = lastFetched || new Date().toISOString();
  const priceNum = Number(lastPrice) || 0;
  let items = [];
  if (lastMultiData) {
    try {
      const parsedMulti = typeof lastMultiData === 'string' ? JSON.parse(lastMultiData) : lastMultiData;
      if (Array.isArray(parsedMulti?.items)) {
        items = parsedMulti.items;
      }
    } catch (_) {}
  }
  if (items.length === 0) {
    items = [{ id, name: id, price: priceNum }];
  }
  await saveSourceItems(env, id, items, { datetime: isoTime });
}

/**
 * Batch update forex primary sources last_price in D1
 * @param {object} env
 * @param {Array<{priceType: string, crossRate: number}>} updates
 * @param {string} nowIso
 */
export async function dbBatchUpdateForexPrices(env, updates, nowIso) {
  if (!env || !env.DB || !updates || updates.length === 0) return;
  await ensureD1Tables(env);
  const statements = updates.map(({ priceType, crossRate }) =>
    env.DB.prepare(`
      UPDATE price_sources
      SET last_price = ?, last_fetched = ?, updated_at = ?
      WHERE price_type = ? AND is_primary = 1
    `).bind(crossRate, nowIso, nowIso, priceType)
  );
  await env.DB.batch(statements);
}
