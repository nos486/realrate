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
};

/**
 * Read global settings from D1 SQL (preferred) or KV (fallback), or use defaults
 * @param {object} env
 * @returns {object} settings object
 */
export async function getGlobalSettings(env) {
  // 1. Try D1 SQL
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      const row = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
      if (row) {
        return {
          default_usd_toman: row.default_usd_toman ?? DEFAULT_SETTINGS.default_usd_toman,
          default_gold_usd:  row.default_gold_usd  ?? DEFAULT_SETTINGS.default_gold_usd,
          bubble_pct_full:   row.bubble_pct_full   ?? DEFAULT_SETTINGS.bubble_pct_full,
          bubble_pct_half:   row.bubble_pct_half   ?? DEFAULT_SETTINGS.bubble_pct_half,
          bubble_pct_quarter:row.bubble_pct_quarter ?? DEFAULT_SETTINGS.bubble_pct_quarter,
          announcement:      row.announcement || "",
        };
      }
    } catch (e) {
      console.error("Error reading settings from D1:", e);
    }
  }

  // 2. Try KV
  if (env && env.REALRATE_KV) {
    try {
      const storedStr = await env.REALRATE_KV.get("global_settings");
      if (storedStr) {
        const parsed = JSON.parse(storedStr);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.error("Error reading global_settings from KV:", e);
    }
  }

  return { ...DEFAULT_SETTINGS };
}

/**
 * Save global settings to D1 SQL and KV
 * @param {object} env
 * @param {object} newSettings - validated settings object
 */
export async function saveGlobalSettings(env, newSettings) {
  // 1. Save to D1 SQL
  if (env && env.DB) {
    await ensureD1Tables(env);
    try {
      await env.DB.prepare(`
        INSERT INTO settings (id, default_usd_toman, default_gold_usd, bubble_pct_full, bubble_pct_half, bubble_pct_quarter, announcement, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          default_usd_toman  = excluded.default_usd_toman,
          default_gold_usd   = excluded.default_gold_usd,
          bubble_pct_full    = excluded.bubble_pct_full,
          bubble_pct_half    = excluded.bubble_pct_half,
          bubble_pct_quarter = excluded.bubble_pct_quarter,
          announcement       = excluded.announcement,
          updated_at         = excluded.updated_at
      `).bind(
        newSettings.default_usd_toman,
        newSettings.default_gold_usd,
        newSettings.bubble_pct_full,
        newSettings.bubble_pct_half,
        newSettings.bubble_pct_quarter,
        newSettings.announcement
      ).run();
    } catch (e) {
      console.error("Error saving settings to D1:", e);
    }
  }

  // 2. Save to KV
  if (env && env.REALRATE_KV) {
    await env.REALRATE_KV.put("global_settings", JSON.stringify(newSettings));
  }
}
