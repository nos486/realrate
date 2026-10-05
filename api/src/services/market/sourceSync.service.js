/**
 * sourceSync.service.js — The one pipeline every price goes through
 *
 * Per tick:
 *   1. Read the price book ("prices" in KV; the sync state in D1): it holds when each source last synced
 *   2. Pick the active sources whose fetchIntervalSec is due (all of them with forceAll, or only
 *      `sourceIds` when given)
 *   3. Fetch each endpoint once (sources sharing one are fetched together)
 *   4. adapter.parse(raw, src) → { items: [{ id, name, price }], datetime }
 *   5. Hold back implausible jumps (priceGuard.js): an item keeps its last value until the new
 *      one repeats for a few syncs
 *   6. Store a source's items (`source_items:${id}`) only when they changed
 *   7. Build the price book from every active source (synced or not) → "prices", one write
 *   8. Record the prices that came in this tick in the price history, keyed by the same ids
 *
 * Nothing else is written: every screen and route reads the book.
 */

import { dbGetPriceSources } from "../../repositories/priceSource.repository.js";
import { getAdapterForSource } from "./sources/index.js";
import { saveSourceItems } from "../../repositories/sourceItems.repository.js";
import { getPriceBookCache, setPriceBookCache } from "../../repositories/priceBookStore.repository.js";
import { logger } from "../../lib/logger.js";
import { buildPriceBook } from "../../domain/priceBook.js";
import { tehranDay } from "../../repositories/priceHistory.repository.js";
import { guardSourceItems } from "../../domain/priceGuard.js";

/**
 * Records a tick's prices in the price history. Registered by the Worker entry (index.js)
 * rather than imported here: the web app shares market modules with the API, and its bundle
 * must not pull in the database code.
 */
let priceHistoryWriter = null;

/** @param {((env: object, points: Array<{ id: string, price: number }>, recordedAt: string) => Promise<unknown>)|null} writer */
export function setPriceHistoryWriter(writer) {
  priceHistoryWriter = writer;
}

/** Seconds between two fetches of a source */
export const fetchIntervalSecOf = (src) => Math.max(15, Number(src.fetchIntervalSec) || 60);

const endpointKeyOf = (src) => `${src.sourceType}::${src.endpoint || src.apiUrl || ""}`;

/**
 * Synchronizes the active sources whose fetch interval is due, then rebuilds the price book.
 *
 * @param {object} env - Cloudflare Worker environment bindings
 * @param {object} [options={}]
 * @param {boolean} [options.forceAll=false] - fetch every (selected) source, due or not
 * @param {Array<string>} [options.sourceIds] - fetch only these sources (the book is still built
 *   from all of them)
 * @returns {Promise<{
 *   totalActive: number,
 *   dueCount: number,
 *   syncedCount: number,
 *   failedCount: number,
 *   results: Array<{ sourceId: string, success: boolean, itemsCount?: number, error?: string }>,
 *   book?: object
 * }>}
 */
/**
 * Today's range of every item (Tehran day), carried from the previous book — no database read:
 * `params.day`, `dayOpen` (the day's first price), `dayHigh`, `dayLow`. A new day starts at the
 * current price. Home cards show it as a low–high bar.
 *
 * Also each item's change, the standard the cards show (`params.changePercent`), for items whose
 * source gives none: the change of its last session — against `prevClose`, the price before its
 * first move on `closeDay`. A session starts at an item's first move on a new Tehran day, so a
 * source that hasn't updated for hours (a holiday, a stalled feed) keeps showing its last
 * session's change instead of none. A source's own change (the bourse's) is kept as it is.
 * @param {{ items: Record<string, object> }} book
 * @param {{ items?: Record<string, object> }|null} previousBook
 * @param {number} now
 */
export function withDayRange(book, previousBook, now) {
  const day = tehranDay(now);
  for (const item of Object.values(book?.items || {})) {
    const price = Number(item.price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const prev = previousBook?.items?.[item.id]?.params;
    const same = prev?.day === day && Number(prev.dayHigh) > 0 && Number(prev.dayLow) > 0;
    item.params = {
      ...(item.params || {}),
      day,
      dayOpen: same ? Number(prev.dayOpen) || price : price,
      dayHigh: same ? Math.max(Number(prev.dayHigh), price) : price,
      dayLow: same ? Math.min(Number(prev.dayLow), price) : price,
    };
    if (!Number.isFinite(Number(item.params.changePercent))) Object.assign(item.params, sessionChange(prev, previousBook?.items?.[item.id]?.price, price, day));
  }
  return book;
}

/**
 * An item's last-session change: { prevClose, closeDay, changePercent }, or {} before it has a base
 * @param {object|undefined} prev - its params in the previous book
 * @param {number|undefined} prevPrice - its price in the previous book
 */
function sessionChange(prev, prevPrice, price, day) {
  const before = Number(prevPrice);
  let prevClose = Number(prev?.prevClose);
  let closeDay = prev?.closeDay;
  if (before > 0 && before !== price && closeDay !== day) {
    // Its first move today: the price before it closed the last session
    prevClose = before;
    closeDay = day;
  } else if (!(prevClose > 0) && before > 0) {
    // No base yet (an item new to the book): today's first price
    prevClose = prev?.day === day && Number(prev.dayOpen) > 0 ? Number(prev.dayOpen) : before;
    closeDay = day;
  }
  if (!(prevClose > 0)) return {};
  return { prevClose, closeDay, changePercent: Math.round(((price - prevClose) / prevClose) * 10000) / 100 };
}

/**
 * The prices a tick records in the history. Each recorded price costs a row read in D1 (the
 * upsert looks the day's row up), and most prices don't move from one minute to the next — a
 * catalog of thousands of symbols barely moves outside market hours — so a tick records only
 * the items whose price differs from the previous book's. The first tick of each hour (and of
 * each Tehran day) records them all: it starts every item's day row, and repairs a change an
 * earlier failed write missed. Items of sources that didn't sync keep their value, except those
 * computed from the dollar and the ounce.
 * @param {{ updatedAt?: string, items: Record<string, object> }} book
 * @param {{ updatedAt?: string, items?: Record<string, object> }|null} previousBook
 * @param {Set<string>} syncedSourceIds
 * @returns {Array<{ id: string, price: number }>}
 */
export function historyPointsOf(book, previousBook, syncedSourceIds) {
  const at = Date.parse(book?.updatedAt || "") || Date.now();
  const before = Date.parse(previousBook?.updatedAt || "");
  const hourOf = (ms) => `${tehranDay(ms)}T${Math.floor(ms / 3_600_000)}`;
  const everything = !Number.isFinite(before) || hourOf(before) !== hourOf(at);
  return Object.values(book?.items || {})
    .filter((item) => !item.sourceId || syncedSourceIds.has(item.sourceId)
      || item.params?.usd !== undefined || item.params?.usdCross !== undefined)
    .filter((item) => everything || Number(previousBook?.items?.[item.id]?.price) !== Number(item.price))
    .map((item) => ({ id: item.id, price: item.price }));
}

export async function syncAllSources(env, options = {}) {
  const empty = { totalActive: 0, dueCount: 0, syncedCount: 0, failedCount: 0, results: [] };
  if (!env) return empty;

  const { forceAll = false, sourceIds = null } = options;

  let previousBook = null;
  let sources = [];
  try {
    previousBook = await getPriceBookCache(env, { fresh: true });
    sources = await dbGetPriceSources(env, { book: previousBook });
  } catch (err) {
    logger.error("[SourceSync] Failed to load price sources:", { error: err.message });
    return empty;
  }

  const activeSources = (Array.isArray(sources) ? sources : []).filter((s) => s.isActive !== false);
  if (activeSources.length === 0) return empty;

  const selected = Array.isArray(sourceIds) && sourceIds.length > 0
    ? activeSources.filter((s) => sourceIds.includes(s.id))
    : activeSources;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const states = { ...(previousBook?.sources || {}) };

  // 1. Due sources
  const dueSources = selected.filter((src) => {
    if (forceAll) return true;
    const last = Date.parse(states[src.id]?.syncedAt || "") || 0;
    return nowMs - last >= fetchIntervalSecOf(src) * 1000;
  });

  logger.info(`[SourceSync] Running sync for ${dueSources.length}/${activeSources.length} due sources.`);
  if (dueSources.length === 0) {
    return { ...empty, totalActive: activeSources.length };
  }

  // 2. One network request per endpoint
  const requests = new Map();
  for (const src of dueSources) {
    const key = endpointKeyOf(src);
    if (requests.has(key)) continue;
    const adapter = getAdapterForSource(src);
    requests.set(key, adapter
      ? adapter.fetchRaw(src, env).catch((err) => {
        logger.warn(`[SourceSync] Fetch failed for ${key}:`, { error: err.message });
        return null;
      })
      : Promise.resolve(null));
  }
  const keys = [...requests.keys()];
  const raws = await Promise.all(requests.values());
  const rawByEndpoint = new Map(keys.map((k, i) => [k, raws[i]]));

  // 3. Parse and store each source
  const results = [];
  const syncedSourceIds = new Set();
  const fail = (src, error) => {
    results.push({ sourceId: src.id, success: false, error });
    states[src.id] = { ...states[src.id], error, failedAt: nowIso };
  };

  for (const src of dueSources) {
    const adapter = getAdapterForSource(src);
    if (!adapter) {
      fail(src, "No adapter registered");
      continue;
    }
    const raw = rawByEndpoint.get(endpointKeyOf(src));
    if (!raw) {
      fail(src, "Empty or failed raw fetch");
      continue;
    }

    try {
      const parsed = await adapter.parse(raw, src, env);
      const parsedItems = Array.isArray(parsed?.items) ? parsed.items : [];
      if (parsedItems.length === 0) {
        fail(src, "Adapter returned 0 items");
        continue;
      }
      const { items, held, rejected } = guardSourceItems(src.items, parsedItems, {
        maxJumpPct: src.maxJumpPct,
        confirmTicks: src.confirmTicks,
        held: states[src.id]?.held,
      });
      if (rejected.length > 0) {
        logger.warn(`[SourceSync] Held back ${rejected.length} implausible price(s) from ${src.id}:`, {
          sample: rejected.slice(0, 5),
        });
      }
      const fetchedAt = parsed?.datetime || nowIso;
      await saveSourceItems(env, src.id, items, { previous: src.storedItemsJson });
      src.items = items;
      states[src.id] = {
        syncedAt: nowIso,
        fetchedAt,
        count: items.length,
        ...(Object.keys(held).length > 0 ? { held } : {}),
      };
      syncedSourceIds.add(src.id);
      results.push({ sourceId: src.id, success: true, itemsCount: items.length });
    } catch (parseErr) {
      logger.warn(`[SourceSync] Parse failed for ${src.name} (${src.id}):`, { error: parseErr.message });
      fail(src, parseErr.message);
    }
  }

  const syncedCount = syncedSourceIds.size;
  const failedCount = results.length - syncedCount;

  // 4. The price book, from every active source, with each source's sync state. Written even when
  //    nothing synced, so failures show up in the book's `sources`.
  const book = withDayRange(buildPriceBook(activeSources.map((src) => ({
    ...src,
    lastFetched: states[src.id]?.fetchedAt || src.lastFetched || null,
  })), { now: nowIso, sourceStates: states }), previousBook, Date.parse(nowIso) || Date.now());
  await setPriceBookCache(env, book);

  // 5. Price history, keyed by the book's ids (the writer never throws): only what moved since
  //    the previous book, all of it once an hour (historyPointsOf)
  if (priceHistoryWriter && syncedCount > 0) {
    const points = historyPointsOf(book, previousBook, syncedSourceIds);
    if (points.length > 0) await priceHistoryWriter(env, points, book.updatedAt);
  }

  return {
    totalActive: activeSources.length,
    dueCount: dueSources.length,
    syncedCount,
    failedCount,
    results,
    book,
  };
}
