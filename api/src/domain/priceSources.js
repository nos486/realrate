/**
 * priceSources.js — What a price source is and how its sync is doing, as one standard both the
 * pipeline (services/market/sourceSync.service.js) and the admin's sources page read
 *
 * - kind: what a source gives — `single` (one price: its priceType, e.g. the dollar), `multi`
 *   (several items with ids of their own: `outputs: "multi"` in its config, e.g. the forex feed or
 *   tgju series) or `catalog` (a market's whole list: `isCatalog`, e.g. the exchange's symbols).
 * - schedule: how often it is fetched (`fetchIntervalSec`, at least MIN_FETCH_INTERVAL_SEC), when
 *   it is due next, and when its prices count as stale (priceBook.js `staleAfterSecOf`).
 * - status: off (switched off), pending (never synced), error (its last try failed), stale (no
 *   successful sync for too long) or ok.
 * - catalog lists are merged with what the source gave before (mergeCatalogItems): a symbol a
 *   fetch leaves out, or gives without a price, keeps its last price, so a partial answer never
 *   empties a market.
 * Pure: no I/O.
 */

import { staleAfterSecOf, catalogItemPriceToman } from "./priceBook.js";
import { DEFAULT_MAX_JUMP_PCT, DEFAULT_CONFIRM_TICKS } from "./priceGuard.js";

/** The shortest time between two fetches of a source (5 minutes: kept light on the feeds) */
export const MIN_FETCH_INTERVAL_SEC = 300;

/** What a source's numbers are in, as the admin reads it */
export const QUOTE_LABELS = { toman: "تومان", rial: "ریال", usd: "دلار", usd_cross: "نرخ در برابر دلار" };

/** What a source gives, as the admin reads it */
export const SOURCE_KIND_LABELS = { single: "تک‌نرخی", multi: "چندخروجی", catalog: "کاتالوگ" };

/**
 * @param {object} src - a source's config
 * @returns {'single'|'multi'|'catalog'}
 */
export function sourceKindOf(src) {
  if (src?.isCatalog) return "catalog";
  return src?.outputs === "multi" ? "multi" : "single";
}

/** Seconds between two fetches of a source */
export const fetchIntervalSecOf = (src) => Math.max(MIN_FETCH_INTERVAL_SEC, Number(src?.fetchIntervalSec) || MIN_FETCH_INTERVAL_SEC);

/** The time of a source's last try (its last sync or failure), in ms, or 0 */
const lastTryOf = (state) => Math.max(Date.parse(state?.syncedAt || "") || 0, Date.parse(state?.failedAt || "") || 0);

/** Whether a source is due: one interval after its last try, successful or not */
export const isSourceDue = (src, state, nowMs = Date.now()) => nowMs - lastTryOf(state) >= fetchIntervalSecOf(src) * 1000;

/**
 * How a source's sync is doing
 * @param {object} src - a source's config (with any admin override)
 * @param {{ syncedAt?: string, failedAt?: string, error?: string }|null} state - its entry in the
 *   price book's `sources`
 * @param {number} [nowMs]
 * @returns {{ status: 'off'|'pending'|'error'|'stale'|'ok', intervalSec: number, staleAfterSec: number,
 *   syncedAt: string|null, failedAt: string|null, error: string|null, nextDueAt: string|null }}
 */
export function sourceScheduleOf(src, state, nowMs = Date.now()) {
  const intervalSec = fetchIntervalSecOf(src);
  const staleAfterSec = staleAfterSecOf(src);
  const syncedAt = state?.syncedAt || null;
  const failedAt = state?.failedAt || null;
  const synced = Date.parse(syncedAt || "") || 0;
  const failed = Date.parse(failedAt || "") || 0;
  // A failure after the last success is the source's current state
  const error = failed > synced ? state?.error || "خطای نامشخص" : null;
  const lastTry = lastTryOf(state);
  let status = "ok";
  if (src?.isActive === false) status = "off";
  else if (error) status = "error";
  else if (!synced) status = "pending";
  else if (nowMs - synced > staleAfterSec * 1000) status = "stale";
  return {
    status,
    intervalSec,
    staleAfterSec,
    syncedAt,
    failedAt,
    error,
    // The cron runs every minute: a due source is fetched on the next tick
    nextDueAt: src?.isActive === false ? null : new Date(lastTry ? lastTry + intervalSec * 1000 : nowMs).toISOString(),
  };
}

/** A stored or fetched catalog item as { id, name, price } (tomans), whichever fields it uses */
const catalogItemOf = (item) => {
  const id = String(item?.id ?? item?.symbol ?? item?.s ?? item?.code ?? "").trim();
  return id ? { id, name: String(item.name ?? item.n ?? item.title ?? id).trim() || id, price: catalogItemPriceToman(item) } : null;
};

/**
 * A catalog's new list over its previous one: new and changed items take their new price, an item
 * the fetch gives without a price keeps its last one (with the new name), and one the fetch left
 * out stays as it was
 * @param {Array<object>} previous - what the source stored last
 * @param {Array<object>} fresh - what this fetch gave
 * @returns {Array<{ id: string, name: string, price: number }>}
 */
export function mergeCatalogItems(previous, fresh) {
  const byId = new Map();
  for (const item of Array.isArray(previous) ? previous : []) {
    const it = catalogItemOf(item);
    if (it && it.price > 0) byId.set(it.id, it);
  }
  for (const item of Array.isArray(fresh) ? fresh : []) {
    const it = catalogItemOf(item);
    if (!it) continue;
    const before = byId.get(it.id);
    if (it.price > 0) byId.set(it.id, it);
    else if (before) byId.set(it.id, { ...before, name: it.name || before.name });
  }
  return [...byId.values()];
}

/**
 * A source's jump guard (priceGuard.js): its limit and confirmations, and the outputs with a
 * limit of their own (`series: [{ id, maxJumpPct }]` — a bubble moves far more than a price)
 * @param {object} src
 * @returns {{ maxJumpPct: number, confirmTicks: number, maxJumpPctByKey: Record<string, number> }}
 */
export function guardOf(src) {
  const maxJumpPctByKey = {};
  for (const s of Array.isArray(src?.series) ? src.series : []) {
    if (s?.id && Number(s.maxJumpPct) > 0) maxJumpPctByKey[s.id] = Number(s.maxJumpPct);
  }
  return {
    maxJumpPct: Number(src?.maxJumpPct) > 0 ? Number(src.maxJumpPct) : DEFAULT_MAX_JUMP_PCT,
    confirmTicks: Number(src?.confirmTicks) > 0 ? Number(src.confirmTicks) : DEFAULT_CONFIRM_TICKS,
    maxJumpPctByKey,
  };
}
