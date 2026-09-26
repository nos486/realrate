/**
 * priceSource.repository.js — Cloudflare D1 & KV Price Sources Data Access Layer
 */

import { ensureD1Tables } from "./migration.repository.js";
import { getPriceBookCache } from "./kvCache.repository.js";
import { readSourceItems, saveSourceItems, deleteSourceItems } from "./sourceItems.repository.js";
import {
  getMasterPriceSourcesConfig,
  getMasterPriceSourceById,
} from "../config/sources.config.js";
import { DEFAULT_FETCH_INTERVAL_SEC } from "../config/constants.js";

/* ─────────────────────────────────────────────────────────────
 * Price sources: defined in code (sources.config.js); what each one last gave is its stored
 * item list (sourceItems.repository.js) and when it last synced is in the price book
 * ───────────────────────────────────────────────────────────── */

/**
 * A configured source with what it last gave
 * @param {object} src - the source's config
 * @param {{ json: string|null, items: Array<object> }} stored - its stored items
 * @param {object|null} state - its entry in the price book's `sources`
 */
function withRuntimeState(src, stored, state) {
  const items = stored.items;
  const source = {
    ...src,
    excludedOutputs: Array.isArray(src.excludedOutputs) ? src.excludedOutputs : [],
    displayConfig: src.displayConfig || null,
    items,
    itemsCount: items.length,
    // A single price, shown as the source's price (a list has none: see itemsCount)
    lastPrice: items.length === 1 ? Number(items[0]?.price) || 0 : 0,
    lastFetched: state?.fetchedAt || "",
    syncedAt: state?.syncedAt || null,
    lastError: state?.error || null,
    channelUsername: src.sourceType === "telegram" ? src.endpoint : "",
    apiUrl: src.sourceType === "api_url" ? src.endpoint : "",
    regexPattern: src.regex || "",
    fetchIntervalMinutes: Math.round((src.fetchIntervalSec || 300) / 60),
  };
  // The stored form, to skip rewriting an unchanged list (not sent to clients)
  Object.defineProperty(source, "storedItemsJson", { value: stored.json, enumerable: false });
  return source;
}

/**
 * Every configured source with its stored items and sync state
 * @param {object} env
 * @param {{ book?: object|null }} [options] - the price book, when the caller already read it
 * @returns {Promise<Array<object>>}
 */
export async function dbGetPriceSources(env, { book } = {}) {
  const masters = getMasterPriceSourcesConfig();
  const priceBook = book !== undefined ? book : (env ? await getPriceBookCache(env) : null);
  return Promise.all(masters.map(async (src) => {
    const stored = env ? await readSourceItems(env, src.id) : { json: null, items: [] };
    return withRuntimeState(src, stored, priceBook?.sources?.[src.id] || null);
  }));
}

/**
 * One configured source with its stored items and sync state
 * @param {object} env
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function dbGetPriceSourceById(env, id) {
  const master = id ? getMasterPriceSourceById(id) : null;
  if (!master) return null;
  const [stored, book] = env
    ? await Promise.all([readSourceItems(env, id), getPriceBookCache(env)])
    : [{ json: null, items: [] }, null];
  return withRuntimeState(master, stored, book?.sources?.[id] || null);
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

    // Remove its stored items
    await deleteSourceItems(env, id);

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
 * Store what an admin's test of a source returned as the source's items
 * @param {object} env
 * @param {string} id
 * @param {Array<object>} items - the test's items
 */
export async function dbStoreTestedSourceItems(env, id, items) {
  if (!id || !env || !Array.isArray(items) || items.length === 0) return false;
  return saveSourceItems(env, id, items);
}
