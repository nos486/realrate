/**
 * priceSource.repository.js — Cloudflare D1 & KV Price Sources and Source Types Data Access Layer
 */

import { ensureD1Tables } from "./migration.repository.js";
import { setSourcePriceCache, deleteSourcePriceCache } from "./kvCache.repository.js";
import { logger } from "../lib/logger.js";
import { DEFAULT_FETCH_INTERVAL_SEC } from "../config/constants.js";

/* ─────────────────────────────────────────────────────────────
 * Source Types CRUD (Dynamic price-type definitions)
 * ───────────────────────────────────────────────────────────── */

/**
 * Get all source types from D1
 * @param {object} env
 * @returns {Promise<Array>}
 */
export async function dbGetSourceTypes(env) {
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const { results } = await env.DB.prepare(`
        SELECT id, label, category, unit, badge_color AS badgeColor,
               output_config AS outputConfig, is_system AS isSystem, sort_order AS sortOrder,
               created_at AS createdAt
        FROM source_types
        ORDER BY sort_order ASC, id ASC
      `).all();
      if (Array.isArray(results)) {
        return results.map(r => ({
          ...r,
          isSystem: !!r.isSystem,
          outputConfig: r.outputConfig ? (() => { try { return JSON.parse(r.outputConfig); } catch { return null; } })() : null,
        }));
      }
    } catch (e) {
      logger.error("D1 dbGetSourceTypes error:", { error: e.message });
    }
  }
  return [];
}

/**
 * Save (create or update) a source type definition
 * @param {object} env
 * @param {object} data - { id, label, category, unit, badgeColor, outputConfig, sortOrder }
 * @returns {Promise<object|null>}
 */
export async function dbSaveSourceType(env, data) {
  const id = String(data.id || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const label = String(data.label || '').trim();
  if (!id || !label) throw new Error("شناسه و عنوان نوع سورس الزامی هستند.");

  const category = ['multi_output'].includes(data.category) ? data.category : 'single';
  const unit = String(data.unit || 'تومان').trim();
  const badgeColor = String(data.badgeColor || data.badge_color || 'blue').trim();
  const outputConfig = data.outputConfig ? (typeof data.outputConfig === 'object' ? JSON.stringify(data.outputConfig) : String(data.outputConfig)) : '';
  const isSystem = data.isSystem ? 1 : 0;
  const sortOrder = parseInt(data.sortOrder || data.sort_order || 99, 10);
  const now = new Date().toISOString();

  if (env && env.DB) {
    await ensureD1Tables(env);
    await env.DB.prepare(`
      INSERT INTO source_types (id, label, category, unit, badge_color, output_config, is_system, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        category = excluded.category,
        unit = excluded.unit,
        badge_color = excluded.badge_color,
        output_config = excluded.output_config,
        sort_order = excluded.sort_order
    `).bind(id, label, category, unit, badgeColor, outputConfig, isSystem, sortOrder, now).run();

    const saved = await env.DB.prepare(`
      SELECT id, label, category, unit, badge_color AS badgeColor,
             output_config AS outputConfig, is_system AS isSystem, sort_order AS sortOrder,
             created_at AS createdAt
      FROM source_types WHERE id = ?
    `).bind(id).first();
    return saved ? { ...saved, isSystem: !!saved.isSystem } : null;
  }
  return null;
}

/**
 * Delete a source type by ID (only non-system types can be deleted)
 * @param {object} env
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function dbDeleteSourceType(env, id) {
  if (!id) return false;
  if (env && env.DB) {
    await ensureD1Tables(env);
    await env.DB.prepare("DELETE FROM source_types WHERE id = ?").bind(id).run();
    return true;
  }
  return false;
}

/* ─────────────────────────────────────────────────────────────
 * Price Sources CRUD & Management (D1 + KV)
 * ───────────────────────────────────────────────────────────── */

/**
 * Helper to normalize row schema from D1
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
 * Get all price sources from D1
 * @param {object} env
 * @returns {Promise<Array>}
 */
export async function dbGetPriceSources(env) {
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const { results } = await env.DB.prepare(`
        SELECT id, name, price_type AS priceType, source_type AS sourceType,
               endpoint, regex, json_path AS jsonPath, field_mapping AS fieldMapping,
               excluded_outputs AS excludedOutputs, display_config AS displayConfig,
               fetch_interval_sec AS fetchIntervalSec,
               is_active AS isActive, is_primary AS isPrimary,
               last_price AS lastPrice, last_multi_data AS lastMultiData,
               last_fetched AS lastFetched,
               created_at AS createdAt, updated_at AS updatedAt
        FROM price_sources
        ORDER BY price_type ASC, is_primary DESC, created_at ASC
      `).all();

      if (Array.isArray(results) && results.length > 0) {
        return results.map(normalizePriceSourceRow);
      }
    } catch (e) {
      logger.error("D1 dbGetPriceSources error:", { error: e.message });
    }
  }

  return [];
}

/**
 * Get single price source by ID
 * @param {object} env
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function dbGetPriceSourceById(env, id) {
  if (!id) return null;
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare(`
        SELECT id, name, price_type AS priceType, source_type AS sourceType,
               endpoint, regex, json_path AS jsonPath, field_mapping AS fieldMapping,
               excluded_outputs AS excludedOutputs, display_config AS displayConfig,
               fetch_interval_sec AS fetchIntervalSec,
               is_active AS isActive, is_primary AS isPrimary,
               last_price AS lastPrice, last_multi_data AS lastMultiData,
               last_fetched AS lastFetched,
               created_at AS createdAt, updated_at AS updatedAt
        FROM price_sources
        WHERE id = ?
      `).bind(id).first();
      if (!row) return null;
      return normalizePriceSourceRow(row);
    } catch (e) {
      logger.error("D1 dbGetPriceSourceById error:", { error: e.message });
    }
  }
  return null;
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
  const multiStr = typeof lastMultiData === 'string'
    ? lastMultiData
    : (lastMultiData ? JSON.stringify(lastMultiData) : null);

  if (env.DB) {
    try {
      if (multiStr !== null) {
        await env.DB.prepare(`
          UPDATE price_sources
          SET last_price = ?, last_fetched = ?, last_multi_data = ?, updated_at = ?
          WHERE id = ?
        `).bind(priceNum, isoTime, multiStr, new Date().toISOString(), id).run();
      } else {
        await env.DB.prepare(`
          UPDATE price_sources
          SET last_price = ?, last_fetched = ?, updated_at = ?
          WHERE id = ?
        `).bind(priceNum, isoTime, new Date().toISOString(), id).run();
      }
    } catch (e) {
      logger.error("D1 dbUpdateSourceLastPrice error:", { id, error: e.message });
    }
  }

  // Save latest price to individual clean KV key for instant lookups
  await setSourcePriceCache(env, id, {
    price: priceNum,
    lastFetched: isoTime,
    lastMultiData: multiStr ? JSON.parse(multiStr) : undefined,
  });
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
