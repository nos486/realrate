/**
 * bourseSymbols.js — Backward-compatible wrapper for Tehran Stock Exchange (TSETMC) Service
 * Logic has been migrated to api/src/services/market/sources/bourseSymbols.source.adapter.js
 */

import {
  bourseSymbolsSourceAdapter,
  normalizePersian,
  mergeBourseSymbols,
  BOURSE_API_URL,
} from "./market/sources/bourseSymbols.source.adapter.js";
import {
  BOURSE_KV_KEY,
  BOURSE_BACKUP_KV_KEY,
  BOURSE_LAST_SYNC_KEY,
} from "../repositories/kvCache.repository.js";
import { dbUpdateSourceLastPrice } from "../repositories/priceSource.repository.js";
import { DEFAULT_BOURSE_SEARCH_LIMIT } from "../config/constants.js";
import { getSourceDisplayName } from "../config/sources.config.js";
import { logger } from "../lib/logger.js";

export {
  BOURSE_API_URL,
  BOURSE_KV_KEY,
  BOURSE_BACKUP_KV_KEY,
  BOURSE_LAST_SYNC_KEY,
  normalizePersian,
  mergeBourseSymbols,
};

/**
 * Fetch fresh symbols from BRS API, merge with existing, and update KV & D1
 * @param {object} env
 * @returns {Promise<{ success: boolean, count?: number, symbols?: Array, error?: string }>}
 */
export async function fetchAndStoreBourseSymbols(env) {
  try {
    const raw = await bourseSymbolsSourceAdapter.fetchRaw({}, env);
    const parsed = await bourseSymbolsSourceAdapter.parse(raw, { name: "بورس اوراق بهادار تهران (TSETMC / BRS API)" }, env);

    if (env?.DB) {
      await dbUpdateSourceLastPrice(
        env,
        'src_def_bourse',
        parsed.price,
        parsed.datetime,
        parsed.multiData
      );
    }

    return { success: true, count: parsed.price, symbols: parsed.compactList };
  } catch (err) {
    logger.error("fetchAndStoreBourseSymbols error:", { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Get symbols list with optional search query
 * @param {object} env
 * @param {string} [query=""]
 * @param {number} [limit=DEFAULT_BOURSE_SEARCH_LIMIT]
 * @returns {Promise<Array>}
 */
export async function getBourseSymbols(env, query = "", limit = DEFAULT_BOURSE_SEARCH_LIMIT) {
  let list = await bourseSymbolsSourceAdapter.getSymbols(env);

  if (!list || list.length === 0) {
    const res = await fetchAndStoreBourseSymbols(env);
    if (res.success && res.symbols) {
      list = res.symbols;
    }
  }

  const cleanQuery = normalizePersian(query);
  const defaultBourseName = getSourceDisplayName("src_def_bourse") || "بورس اوراق بهادار تهران (TSETMC / BRS API)";

  if (!cleanQuery) {
    return (list || []).slice(0, limit).map(item => ({
      symbol: item.s,
      name: item.n,
      price: item.p,
      priceToman: item.priceToman || item.p,
      priceRial: item.priceRial || item.pl || (item.p * 10),
      updatedAt: item.updatedAt || null,
      isFund: Boolean(item.isFund || (item.n && item.n.includes('صندوق'))),
      sourceName: item.sourceName || defaultBourseName,
      sourceId: item.sourceId || "src_def_bourse",
    }));
  }

  const filtered = (list || []).filter(item => {
    const symNorm = normalizePersian(item.s);
    const nameNorm = normalizePersian(item.n);
    return symNorm.includes(cleanQuery) || nameNorm.includes(cleanQuery);
  });

  filtered.sort((a, b) => {
    const aSym = normalizePersian(a.s);
    const bSym = normalizePersian(b.s);
    if (aSym === cleanQuery) return -1;
    if (bSym === cleanQuery) return 1;
    if (aSym.startsWith(cleanQuery) && !bSym.startsWith(cleanQuery)) return -1;
    if (!aSym.startsWith(cleanQuery) && bSym.startsWith(cleanQuery)) return 1;
    return (b.p || 0) - (a.p || 0);
  });

  return filtered.slice(0, limit).map(item => ({
    symbol: item.s,
    name: item.n,
    price: item.p,
    priceToman: item.priceToman || item.p,
    priceRial: item.priceRial || item.pl || (item.p * 10),
    updatedAt: item.updatedAt || null,
    isFund: Boolean(item.isFund || (item.n && item.n.includes('صندوق'))),
    sourceName: item.sourceName || defaultBourseName,
    sourceId: item.sourceId || "src_def_bourse",
  }));
}

/**
 * Look up a single stock symbol by ticker code
 * @param {object} env
 * @param {string} symbol
 * @returns {Promise<object|null>}
 */
export async function getBourseSymbolDetail(env, symbol) {
  if (!symbol) return null;
  const list = await bourseSymbolsSourceAdapter.getSymbols(env);
  if (!list || list.length === 0) return null;

  const targetNorm = normalizePersian(symbol);
  const found = list.find(item => normalizePersian(item.s) === targetNorm);
  if (!found) return null;

  const toman = found.priceToman || found.p || Math.round((found.priceRial || found.pl || 0) / 10);
  const rial = found.priceRial || found.pl || (toman * 10);

  return {
    symbol: found.s,
    name: found.n,
    price: toman,
    priceToman: toman,
    priceRial: rial,
    pl: rial,
    updatedAt: found.updatedAt || null,
    isFund: Boolean(found.isFund || (found.n && found.n.includes('صندوق'))),
  };
}

/**
 * Scheduled handler for daily Bourse sync
 */
export async function handleScheduledBourseSync(env) {
  return await bourseSymbolsSourceAdapter.handleScheduledSync(env);
}
