/**
 * kvCleanup.js — Delete the KV keys the app no longer uses
 *
 * Prices are one JSON under "prices" plus one list per source ("source_items:<id>"); every copy
 * the older code kept beside them is dead weight: the old rates compile, per-source price copies,
 * backups and sync stamps, and the catalogs' own caches.
 */

import { getKv } from "../../repositories/kvCache.repository.js";

/** Whole keys */
export const LEGACY_KV_KEYS = [
  "latest_rates",
  "forex_rates",
  "last_forex_d1_record",
  "bourse_symbols_toman_v3",
  "bourse_symbols_backup_v1",
  "bourse_symbols_last_sync_v3",
  "emofid_funds_v1",
  "emofid_funds_backup_v1",
  "emofid_funds_last_sync_v1",
  "charisma_funds_v1",
  "charisma_funds_backup_v1",
  "charisma_funds_last_sync_v1",
  "charisma_plans_v1",
  "charisma_plans_backup_v1",
  "charisma_plans_last_sync_v1",
];

/** Key prefixes */
export const LEGACY_KV_PREFIXES = ["source_price:", "source_items_backup:", "source_items_last_sync:"];

/**
 * Delete them all
 * @returns {Promise<{ deleted: string[] }>}
 */
export async function deleteLegacyKvKeys(env) {
  const kv = getKv(env);
  if (!kv) throw new Error("KV در دسترس نیست.");
  const names = [];
  for (const key of LEGACY_KV_KEYS) {
    if ((await kv.get(key)) !== null) names.push(key);
  }
  for (const prefix of LEGACY_KV_PREFIXES) {
    let cursor;
    do {
      const page = await kv.list({ prefix, cursor });
      names.push(...(page.keys || []).map((k) => k.name));
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
  for (const name of names) await kv.delete(name);
  return { deleted: names };
}
