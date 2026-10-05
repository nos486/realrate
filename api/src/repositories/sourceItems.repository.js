/**
 * sourceItems.repository.js — What each price source last gave, one key per source in Workers KV
 * (kvStore.repository.js)
 *
 * A source's cleaned output (the adapter's `items`) is kept under `source_items:${sourceId}`.
 * It is the only stored copy: the price book ("prices") is built from these lists, and a list
 * is written again only when its content changed. When each source last synced is kept in the
 * price book itself (`book.sources`), not here.
 */

import { getBlobStore } from "./kvStore.repository.js";
import { logger } from "../lib/logger.js";

export const SOURCE_ITEMS_KEY_PREFIX = "source_items:";

/** Old names of catalog sources (search routes may still name them this way) */
const SOURCE_ID_ALIASES = {
  bourse_symbols: "src_def_bourse",
  bourse: "src_def_bourse",
  emofid_funds: "src_def_emofid",
  emofid: "src_def_emofid",
  charisma_funds: "src_def_charisma",
  charisma: "src_def_charisma",
  charisma_plans: "src_def_charisma_plans",
};

const canonicalSourceId = (sourceId) => SOURCE_ID_ALIASES[sourceId] || sourceId;

/** The state-store key of a source's list */
export const sourceItemsKey = (sourceId) => `${SOURCE_ITEMS_KEY_PREFIX}${canonicalSourceId(sourceId)}`;

/** The stored form of a list (compared to skip writing an unchanged one) */
export const serializeSourceItems = (items) => JSON.stringify(Array.isArray(items) ? items : []);

/**
 * Store a source's items, unless they are the same as what is stored
 * @param {object} env
 * @param {string} sourceId
 * @param {Array<object>} items - the adapter's items [{ id, name, price, ... }]
 * @param {{ previous?: string|null }} [options] - the stored form read earlier this tick, if any
 * @returns {Promise<boolean>} whether the list was written
 */
export async function saveSourceItems(env, sourceId, items, { previous } = {}) {
  const store = getBlobStore(env);
  if (!store || !sourceId || !Array.isArray(items)) return false;
  const json = serializeSourceItems(items);
  if (previous !== undefined && previous === json) return false;
  try {
    await store.put(sourceItemsKey(sourceId), json);
    return true;
  } catch (err) {
    logger.error(`[saveSourceItems] write error for ${sourceId}:`, { error: err.message });
    return false;
  }
}

/**
 * A source's stored list, as stored (for a later unchanged-check) and parsed
 * @returns {Promise<{ json: string|null, items: Array<object> }>}
 */
export async function readSourceItems(env, sourceId) {
  if (!sourceId) return { json: null, items: [] };
  return (await readSourceItemsMany(env, [sourceId])).get(sourceId) || { json: null, items: [] };
}

export function parseStoredItems(json) {
  if (!json) return { json: null, items: [] };
  try {
    const parsed = JSON.parse(json);
    const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : []);
    return { json, items };
  } catch {
    return { json: null, items: [] };
  }
}

/**
 * Several sources' stored lists in one read (the cron reads every source each tick)
 * @returns {Promise<Map<string, { json: string|null, items: Array<object> }>>} by the ids given
 */
export async function readSourceItemsMany(env, sourceIds) {
  const result = new Map();
  const store = getBlobStore(env);
  const ids = (sourceIds || []).filter(Boolean);
  const empty = () => { for (const id of ids) result.set(id, { json: null, items: [] }); return result; };
  if (!store || !ids.length) return empty();
  try {
    const values = await store.getMany(ids.map(sourceItemsKey));
    for (const id of ids) result.set(id, parseStoredItems(values.get(sourceItemsKey(id))));
    return result;
  } catch (err) {
    logger.warn("[readSourceItems] read error:", { error: err.message });
    return empty();
  }
}

/**
 * A source's stored items
 * @returns {Promise<Array<object>>}
 */
export async function getSourceItems(env, sourceId) {
  return (await readSourceItems(env, sourceId)).items;
}

