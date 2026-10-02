/**
 * priceSource.repository.js — Price sources: config in code, runtime state in the state store
 * (Postgres, stateStore.repository.js)
 */

import { getPriceBookCache } from "./priceBookStore.repository.js";
import { getStateStore } from "./stateStore.repository.js";
import { readSourceItems, saveSourceItems, sourceItemsKey, parseStoredItems } from "./sourceItems.repository.js";
import {
  getMasterPriceSourcesConfig,
  getMasterPriceSourceById,
} from "../config/sources.config.js";

/* ─────────────────────────────────────────────────────────────
 * Price sources: defined in code (sources.config.js); what each one last gave is its stored
 * item list (sourceItems.repository.js) and when it last synced is in the price book. The admin
 * can switch a source off or make it the primary one for its id without a deploy: those two
 * choices are kept in one state-store record (PRICE_SOURCE_OVERRIDES_KEY) laid over the config.
 * ───────────────────────────────────────────────────────────── */

export const PRICE_SOURCE_OVERRIDES_KEY = "price_source_overrides";

/** What an admin may change on a source defined in code */
const OVERRIDABLE_FIELDS = ["isActive", "isPrimary"];

/** @returns {Promise<Record<string, { isActive?: boolean, isPrimary?: boolean }>>} */
async function readOverrides(env) {
  const store = getStateStore(env);
  if (!store) return {};
  try {
    return (await store.get(PRICE_SOURCE_OVERRIDES_KEY, "json")) || {};
  } catch {
    return {};
  }
}

async function writeOverrides(env, overrides) {
  const store = getStateStore(env);
  if (!store) throw new Error("ذخیره‌سازی تنظیمات سورس در دسترس نیست.");
  await store.put(PRICE_SOURCE_OVERRIDES_KEY, JSON.stringify(overrides));
}

const withOverrides = (src, overrides) => ({ ...src, ...overrides?.[src.id] });

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
  const configs = getMasterPriceSourcesConfig();
  // The admin's overrides and every source's items in one read
  const store = env ? getStateStore(env) : null;
  const itemKeys = configs.map((src) => sourceItemsKey(src.id));
  let values = new Map();
  if (store) {
    try {
      values = await store.getMany([PRICE_SOURCE_OVERRIDES_KEY, ...itemKeys]);
    } catch {
      values = new Map();
    }
  }
  let overrides = {};
  try {
    overrides = JSON.parse(values.get(PRICE_SOURCE_OVERRIDES_KEY) || "{}") || {};
  } catch {}
  const priceBook = book !== undefined ? book : (env ? await getPriceBookCache(env) : null);
  return configs.map((config, i) => {
    const src = withOverrides(config, overrides);
    return withRuntimeState(src, parseStoredItems(values.get(itemKeys[i])), priceBook?.sources?.[src.id] || null);
  });
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
  const [stored, book, overrides] = env
    ? await Promise.all([readSourceItems(env, id), getPriceBookCache(env), readOverrides(env)])
    : [{ json: null, items: [] }, null, {}];
  return withRuntimeState(withOverrides(master, overrides), stored, book?.sources?.[id] || null);
}

/**
 * Save an admin's change to a source. Sources are defined in code: only switching one on or off
 * (and whether it is primary) is kept; anything else is changed in sources.config.js.
 * @param {object} env
 * @param {{ id: string, isActive?: boolean, isPrimary?: boolean }} data
 * @returns {Promise<object>} the source as it now is
 */
export async function dbSavePriceSource(env, data) {
  const id = String(data?.id || "");
  if (!getMasterPriceSourceById(id)) {
    throw new Error("سورس‌ها در کد (sources.config.js) تعریف می‌شوند؛ سورس جدید را آنجا اضافه کنید.");
  }
  const overrides = await readOverrides(env);
  const change = {};
  for (const field of OVERRIDABLE_FIELDS) {
    if (data[field] !== undefined) change[field] = Boolean(data[field]);
  }
  overrides[id] = { ...overrides[id], ...change };
  await writeOverrides(env, overrides);
  return dbGetPriceSourceById(env, id);
}

/**
 * Make a source the primary one for its id (the others giving the same priceType stop being
 * primary), and switch it on
 * @param {object} env
 * @param {string} id
 * @returns {Promise<object|null>} the source as it now is
 */
export async function dbSetPrimaryPriceSource(env, id) {
  const target = id ? getMasterPriceSourceById(id) : null;
  if (!target) throw new Error("سورس مورد نظر یافت نشد.");
  const overrides = await readOverrides(env);
  const type = String(target.priceType || "").toLowerCase();
  for (const src of getMasterPriceSourcesConfig()) {
    if (src.id !== id && String(src.priceType || "").toLowerCase() === type) {
      overrides[src.id] = { ...overrides[src.id], isPrimary: false };
    }
  }
  overrides[id] = { ...overrides[id], isPrimary: true, isActive: true };
  await writeOverrides(env, overrides);
  return dbGetPriceSourceById(env, id);
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
