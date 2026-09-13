/**
 * settings.repository.js — Cloudflare D1 & KV System Settings Data Access Layer
 */

import { ensureD1Tables } from "./migration.repository.js";
import { getGlobalSettingsKV, setGlobalSettingsKV } from "./kvCache.repository.js";
import { logger } from "../lib/logger.js";
import { SETTINGS_MEMORY_CACHE_TTL_MS } from "../config/constants.js";

export const DEFAULT_SETTINGS = {
  default_usd_toman: 62000,
  default_gold_usd: 2450,
  bubble_pct_full: 15,
  bubble_pct_half: 20,
  bubble_pct_quarter: 25,
  announcement: "",
  usd_source_type: "telegram",
  usd_telegram_channel: "tahran_sabza",
  usd_api_url: "",
  usd_api_json_path: "",
};

let memorySettings = null;
let memorySettingsTime = 0;

/**
 * Read global settings from in-memory cache, D1 SQL, or KV (fallback)
 * @param {object} env
 * @param {boolean} [forceFresh=false]
 * @returns {Promise<object>} settings object
 */
export async function getGlobalSettings(env, forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && memorySettings && (now - memorySettingsTime < SETTINGS_MEMORY_CACHE_TTL_MS)) {
    return memorySettings;
  }

  let loaded = null;

  // 1. Try D1 SQL
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
      if (row) {
        loaded = {
          default_usd_toman: row.default_usd_toman ?? DEFAULT_SETTINGS.default_usd_toman,
          default_gold_usd:  row.default_gold_usd  ?? DEFAULT_SETTINGS.default_gold_usd,
          bubble_pct_full:   row.bubble_pct_full   ?? DEFAULT_SETTINGS.bubble_pct_full,
          bubble_pct_half:   row.bubble_pct_half   ?? DEFAULT_SETTINGS.bubble_pct_half,
          bubble_pct_quarter:row.bubble_pct_quarter ?? DEFAULT_SETTINGS.bubble_pct_quarter,
          announcement:      row.announcement || "",
          usd_source_type:   row.usd_source_type || DEFAULT_SETTINGS.usd_source_type,
          usd_telegram_channel: row.usd_telegram_channel || DEFAULT_SETTINGS.usd_telegram_channel,
          usd_api_url:       row.usd_api_url || "",
          usd_api_json_path: row.usd_api_json_path || "",
        };
      }
    } catch (e) {
      logger.error("Error reading settings from D1:", { error: e.message });
    }
  }

  // 2. Try KV
  if (!loaded) {
    const kvSettings = await getGlobalSettingsKV(env);
    if (kvSettings) {
      loaded = { ...DEFAULT_SETTINGS, ...kvSettings };
    }
  }

  memorySettings = loaded ? { ...DEFAULT_SETTINGS, ...loaded } : { ...DEFAULT_SETTINGS };
  memorySettingsTime = Date.now();
  return memorySettings;
}

/**
 * Save global settings to D1 SQL and KV
 * @param {object} env
 * @param {object} newSettings - validated settings object
 */
export async function saveGlobalSettings(env, newSettings) {
  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...newSettings,
  };

  // 1. Save to D1 SQL
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        INSERT INTO settings (
          id, default_usd_toman, default_gold_usd, bubble_pct_full, bubble_pct_half, bubble_pct_quarter, announcement,
          usd_source_type, usd_telegram_channel, usd_api_url, usd_api_json_path, updated_at
        )
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          default_usd_toman    = excluded.default_usd_toman,
          default_gold_usd     = excluded.default_gold_usd,
          bubble_pct_full      = excluded.bubble_pct_full,
          bubble_pct_half      = excluded.bubble_pct_half,
          bubble_pct_quarter   = excluded.bubble_pct_quarter,
          announcement         = excluded.announcement,
          usd_source_type      = excluded.usd_source_type,
          usd_telegram_channel = excluded.usd_telegram_channel,
          usd_api_url          = excluded.usd_api_url,
          usd_api_json_path    = excluded.usd_api_json_path,
          updated_at           = excluded.updated_at
      `).bind(
        mergedSettings.default_usd_toman,
        mergedSettings.default_gold_usd,
        mergedSettings.bubble_pct_full,
        mergedSettings.bubble_pct_half,
        mergedSettings.bubble_pct_quarter,
        mergedSettings.announcement,
        mergedSettings.usd_source_type,
        mergedSettings.usd_telegram_channel,
        mergedSettings.usd_api_url,
        mergedSettings.usd_api_json_path
      ).run();
    } catch (e) {
      logger.error("Error saving settings to D1:", { error: e.message });
    }
  }

  // 2. Save to KV
  await setGlobalSettingsKV(env, mergedSettings);

  memorySettings = { ...mergedSettings };
  memorySettingsTime = Date.now();
}
