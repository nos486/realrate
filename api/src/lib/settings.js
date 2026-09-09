/**
 * settings.js — Global system settings: read from D1 SQL (with KV fallback), write to both
 */

import { ensureD1Tables } from "./db.js";

const DEFAULT_SETTINGS = {
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
  primary_color: "#0284c7",
  accent_color: "#38bdf8",
  border_color: "#1e293b",
  card_bg_color: "#0d131f",
  color_preset: "ocean",
};

let memorySettings = null;
let memorySettingsTime = 0;

/**
 * Read global settings from in-memory cache (60s), D1 SQL, or KV (fallback)
 * @param {object} env
 * @param {boolean} [forceFresh=false]
 * @returns {object} settings object
 */
export async function getGlobalSettings(env, forceFresh = false) {
  const now = Date.now();
  if (!forceFresh && memorySettings && (now - memorySettingsTime < 60000)) {
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
          primary_color:     row.primary_color || DEFAULT_SETTINGS.primary_color,
          accent_color:      row.accent_color || DEFAULT_SETTINGS.accent_color,
          border_color:      row.border_color || DEFAULT_SETTINGS.border_color,
          card_bg_color:     row.card_bg_color || DEFAULT_SETTINGS.card_bg_color,
          color_preset:      row.color_preset || DEFAULT_SETTINGS.color_preset,
        };
      }
    } catch (e) {
      console.error("Error reading settings from D1:", e);
    }
  }

  // 2. Try KV
  if (!loaded && env && env.REALRATE_KV) {
    try {
      const storedStr = await env.REALRATE_KV.get("global_settings");
      if (storedStr) {
        const parsed = JSON.parse(storedStr);
        loaded = { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.error("Error reading global_settings from KV:", e);
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
          usd_source_type, usd_telegram_channel, usd_api_url, usd_api_json_path,
          primary_color, accent_color, border_color, card_bg_color, color_preset, updated_at
        )
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
          primary_color        = excluded.primary_color,
          accent_color         = excluded.accent_color,
          border_color         = excluded.border_color,
          card_bg_color        = excluded.card_bg_color,
          color_preset         = excluded.color_preset,
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
        mergedSettings.usd_api_json_path,
        mergedSettings.primary_color,
        mergedSettings.accent_color,
        mergedSettings.border_color,
        mergedSettings.card_bg_color,
        mergedSettings.color_preset
      ).run();
    } catch (e) {
      console.error("Error saving settings to D1:", e);
    }
  }

  // 2. Save to KV
  if (env && env.REALRATE_KV) {
    await env.REALRATE_KV.put("global_settings", JSON.stringify(mergedSettings));
  }

  memorySettings = { ...mergedSettings };
  memorySettingsTime = Date.now();
}
