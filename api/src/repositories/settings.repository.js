/**
 * settings.repository.js — The site's global settings, in D1 (table `settings`, one row)
 */

import { ensureSchema } from "./schema.repository.js";
import { logger } from "../lib/logger.js";
import { SETTINGS_MEMORY_CACHE_TTL_MS } from "../config/constants.js";

/**
 * The settings there are. The coins' target bubbles once were (`bubble_pct_*`, columns kept in
 * the table): each coin's is now its bubble's mean over the last year (domain/priceAverages.js).
 */
export const DEFAULT_SETTINGS = {
  announcement: "",
  // Maintenance ("under development") mode: only admins can sign in and use the API
  maintenance_mode: 0,
  maintenance_message: "",
};

/** Only the known settings, so retired columns never leak back out */
function pickSettings(source) {
  const picked = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (source?.[key] !== undefined && source[key] !== null) picked[key] = source[key];
  }
  return picked;
}

let memorySettings = null;
let memorySettingsTime = 0;

/**
 * Read global settings from the in-memory cache or the database
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

  // The database
  if (env && env.DB) {
    await ensureSchema(env);
    try {
      const row = await env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
      if (row) {
        loaded = pickSettings(row);
      }
    } catch (e) {
      logger.error("Error reading settings from the database:", { error: e.message });
    }
  }

  memorySettings = loaded ? { ...DEFAULT_SETTINGS, ...loaded } : { ...DEFAULT_SETTINGS };
  memorySettingsTime = Date.now();
  return memorySettings;
}

/**
 * Save global settings to the database
 * @param {object} env
 * @param {object} newSettings - validated settings object
 */
export async function saveGlobalSettings(env, newSettings) {
  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...pickSettings(newSettings),
  };

  if (env && env.DB) {
    await ensureSchema(env);
    try {
      await env.DB.prepare(`
        INSERT INTO settings (id, announcement, maintenance_mode, maintenance_message, updated_at)
        VALUES (1, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          announcement         = excluded.announcement,
          maintenance_mode     = excluded.maintenance_mode,
          maintenance_message  = excluded.maintenance_message,
          updated_at           = excluded.updated_at
      `).bind(
        mergedSettings.announcement,
        mergedSettings.maintenance_mode ? 1 : 0,
        mergedSettings.maintenance_message
      ).run();
    } catch (e) {
      logger.error("Error saving settings to the database:", { error: e.message });
    }
  }

  memorySettings = { ...mergedSettings };
  memorySettingsTime = Date.now();
}
