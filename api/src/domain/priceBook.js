/**
 * priceBook.js — The one standard every price in the app follows
 *
 * Every source, automatic or manual, ends up here as the same kind of item:
 *
 *   { id, price, name, category, unit, sourceId, updatedAt, params }
 *
 * - `price` is always in tomans. A source says what it quotes in (`quote` in its config):
 *   "toman" (default), "rial", "usd" (e.g. the world ounce) or "usd_cross" (a currency's value
 *   in dollars, e.g. the forex feed). Dollar quotes are turned into tomans with the book's own
 *   USD price, so e.g. the lira is computed once here and is the same number everywhere.
 * - `id` names the asset, never the provider: unique, lower-case, with Persian letters in one form.
 *   A single-price source gives its priceType ("usd", "gold_18k"), a multi-output feed its item
 *   code ("eur"), a catalog `${market}__${symbol}` ("bourse__فولاد": there is one فولاد whichever
 *   source prices it). When two sources give the same id, the primary one keeps it and the
 *   others become `${sourceId}__${id}`.
 * - Prices computed from others are items too: the intrinsic value of gold, coins and silver with
 *   no market source (from the ounce and USD), and cash (1 toman). Items that also have a market
 *   price carry their intrinsic value and bubble in `params`.
 *
 * The same ids are used for stored user data, the home page, charts and the price history.
 * Pure: no I/O. Shared with the web app (it recomputes bubbles for the calculator with it).
 */

import { GOLD_SPECS } from "./specs/gold.spec.js";
import { COIN_SPECS } from "./specs/coin.spec.js";
import { SILVER_SPECS } from "./specs/silver.spec.js";
import { FOREX_SPECS } from "./specs/forex.spec.js";
import { CRYPTO_SPECS } from "./specs/crypto.spec.js";
import { CASH_SPECS } from "./specs/cash.spec.js";
import { calculateGold24kGram, calculateSilverGram, calculateBubble } from "./formulas.js";

/** The items other prices are computed from */
export const BASE_PRICE_IDS = {
  usd: "usd",
  goldOunce: "ons_gold",
  silverOunce: "ons_silver",
};

/**
 * How long after its last successful sync a source's prices count as stale: its own
 * `staleAfterSec`, else a few missed fetches, at least half an hour
 */
export const staleAfterSecOf = (src) =>
  Number(src?.staleAfterSec) > 0
    ? Number(src.staleAfterSec)
    : Math.max(1800, 5 * Math.max(15, Number(src?.fetchIntervalSec) || 60));

/** What a source's numbers are quoted in */
export const PRICE_QUOTES = ["toman", "rial", "usd", "usd_cross"];

// ── Ids ──────────────────────────────────────────────────────────────────────

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * An id in its one form: trimmed, lower-case, Arabic ي/ك/ة/أ as their Persian letters, Persian and
 * Arabic digits as 0–9, no zero-width joiners or kashida, single spaces. A feed that writes
 * «فملي» or «اخزا۱۰۲» gives the same id as one that writes «فملی» or «اخزا102».
 */
export const normalizePriceId = (id) => String(id ?? "")
  .replace(/[ي]/g, "ی")
  .replace(/[ك]/g, "ک")
  .replace(/[ة]/g, "ه")
  .replace(/[أإٱ]/g, "ا")
  .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
  .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff\u0640]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

/** The market a catalog source lists (its ids' prefix); a source without one uses its own id */
export const catalogMarketOf = (src) => String(src?.market || src?.id || "").trim();

/** The catalog id of an item: `${market}__${symbol}` (a symbol may already carry the prefix) */
export function catalogAssetId(market, symbol) {
  const sym = String(symbol ?? "").trim();
  if (!market) return sym;
  return sym.startsWith(`${market}__`) ? sym : `${market}__${sym}`;
}

/** A catalog item's symbol, the same way the catalog reads it */
export function catalogItemSymbol(item) {
  return String(item?.id || item?.symbol || item?.s || item?.code || "").trim();
}

/**
 * A price in tomans, rounded to what matters: whole tomans from 100 up, four significant digits
 * below (a coin worth 0.37 toman stays 0.37, never 0)
 */
export function roundToman(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 100 ? Math.round(n) : Number(n.toPrecision(4));
}

/** A catalog item's price in tomans, whichever field its feed fills */
export function catalogItemPriceToman(item) {
  const n = (v) => (v !== undefined && Number(v) > 0 ? Number(v) : 0);
  if (n(item?.price)) return roundToman(n(item.price));
  if (n(item?.priceToman)) return roundToman(n(item.priceToman));
  if (n(item?.p)) return roundToman(n(item.p));
  if (n(item?.priceRial)) return roundToman(n(item.priceRial) / 10);
  if (n(item?.pl)) return roundToman(n(item.pl) / 10);
  return 0;
}

// ── Specs ────────────────────────────────────────────────────────────────────

/** Every known asset's spec by id (names, units, gold weights, …) */
export const SPEC_BY_ID = (() => {
  const index = new Map();
  const add = (spec, id = spec.id) => index.set(normalizePriceId(id), spec);
  Object.values(GOLD_SPECS).forEach((s) => add(s));
  Object.values(COIN_SPECS).forEach((s) => add(s));
  Object.values(SILVER_SPECS).forEach((s) => add(s));
  Object.values(CRYPTO_SPECS).forEach((s) => add(s));
  Object.values(CASH_SPECS).forEach((s) => add(s));
  FOREX_SPECS.forEach((s) => add({ ...s, id: s.code, category: s.category || "currency" }, s.code));
  return index;
})();

// ── Building ─────────────────────────────────────────────────────────────────

const positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const parseList = (v) => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const parseObject = (v) => {
  if (v && typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Whether the admin shows an item of a source on the home page by default (displayConfig:
 * showOnHomePage true/false or a list of item codes, homePageOutputs, excludedHomePageOutputs)
 * @param {string} code - the item's code ("EUR", "usd", …)
 * @param {object|string|null} displayConfig - the source's displayConfig
 */
export function isShownOnHome(code, displayConfig) {
  const dc = parseObject(displayConfig);
  if (!dc) return true;
  if (dc.showOnHomePage === false) return false;
  const key = String(code ?? "").trim().toUpperCase();
  const allowed = [dc.homePageOutputs, dc.homeOutputs, dc.displayOutputs, dc.showOnHomePage].find(Array.isArray);
  if (allowed) return allowed.some((x) => String(x).trim().toUpperCase() === key);
  if (Array.isArray(dc.excludedHomePageOutputs)
    && dc.excludedHomePageOutputs.some((x) => String(x).trim().toUpperCase() === key)) return false;
  return true;
}

/** What a source last gave: its stored item list */
const itemsOf = (src) => (Array.isArray(src.items) ? src.items : []);

const isCatalogSource = (src) => Boolean(src.isCatalog);

/**
 * Every value each active source offers, before ids are settled
 * @returns {Array<{ baseId: string, src: object, value: number, quote: string, meta: object }>}
 */
function collectEntries(sources) {
  const entries = [];
  for (const src of sources) {
    if (!src || src.isActive === false) continue;
    const quote = PRICE_QUOTES.includes(src.quote) ? src.quote : "toman";
    const items = itemsOf(src);

    if (isCatalogSource(src)) {
      for (const item of items) {
        const symbol = catalogItemSymbol(item);
        const value = catalogItemPriceToman(item);
        if (!symbol || !value) continue;
        entries.push({
          baseId: normalizePriceId(catalogAssetId(catalogMarketOf(src), symbol)),
          src,
          value,
          quote: "toman",
          meta: {
            name: String(item.name || item.n || item.title || symbol).trim(),
            updatedAt: item.updatedAt || null,
            params: {
              symbol,
              ...(Number.isFinite(Number(item.changePercent ?? item.cp ?? item.plp))
                ? { changePercent: Number(item.changePercent ?? item.cp ?? item.plp) }
                : {}),
              ...(src.isFund || item.isFund || item.f === 1 ? { isFund: true } : {}),
            },
          },
        });
      }
      continue;
    }

    // A single-price source gives one item under its own id; items with ids of their own make a
    // multi-output feed
    const ownIds = new Set([normalizePriceId(src.id), normalizePriceId(src.priceType)]);
    const isMulti = items.some((item) => !ownIds.has(normalizePriceId(item?.id)));

    if (isMulti) {
      const excluded = new Set(parseList(src.excludedOutputs).map(normalizePriceId));
      for (const item of items) {
        const baseId = normalizePriceId(item?.id);
        if (!baseId || excluded.has(baseId)) continue;
        const value = positive(item.price);
        if (!value) continue;
        const params = isShownOnHome(item.id, src.displayConfig) ? {} : { hideOnHome: true };
        entries.push({ baseId, src, value, quote, meta: { name: item.name || "", updatedAt: item.updatedAt || null, params } });
      }
      continue;
    }

    const baseId = normalizePriceId(src.priceType);
    const value = positive(items[0]?.price);
    const params = isShownOnHome(baseId, src.displayConfig) ? {} : { hideOnHome: true };
    if (baseId && value) entries.push({ baseId, src, value, quote, meta: { name: src.name || "", params } });
  }
  return entries;
}

/**
 * The primary source of an id keeps it; every other source's copy is `${sourceId}__${id}`.
 * Sources keep their config order otherwise.
 */
function assignIds(entries) {
  const byBase = new Map();
  entries.forEach((entry, order) => {
    if (!byBase.has(entry.baseId)) byBase.set(entry.baseId, []);
    byBase.get(entry.baseId).push({ ...entry, order });
  });
  const assigned = [];
  for (const [baseId, group] of byBase) {
    group.sort((a, b) => Number(Boolean(b.src.isPrimary)) - Number(Boolean(a.src.isPrimary)) || a.order - b.order);
    group.forEach((entry, i) => {
      assigned.push({ ...entry, id: i === 0 ? baseId : normalizePriceId(`${entry.src.id}__${baseId}`) });
    });
  }
  return assigned;
}

function toItem(entry, price, extraParams = {}) {
  const spec = SPEC_BY_ID.get(entry.baseId) || null;
  return {
    id: entry.id,
    price,
    name: spec?.name || entry.meta.name || entry.src.name || entry.id,
    category: spec?.category || (entry.meta.params.isFund ? "bourse_fund" : entry.src.category) || "",
    // A dollar-quoted spec names its currency as the unit ("دلار"); in tomans the unit is what
    // is priced (the source's "اونس")
    unit: (entry.quote === "usd" ? entry.src.unit || spec?.unit : spec?.unit || entry.src.unit) || "",
    sourceId: entry.src.id,
    updatedAt: entry.meta.updatedAt || entry.src.lastFetched || null,
    params: { ...entry.meta.params, sourceName: entry.src.name || "", ...extraParams },
  };
}

/** Intrinsic value (tomans) of a gold, coin or silver spec from the ounce prices, or 0 */
function intrinsicOf(spec, { goldGram, silverGram }) {
  if (!spec || spec.id === BASE_PRICE_IDS.goldOunce || spec.id === BASE_PRICE_IDS.silverOunce) return 0;
  if (spec.category === "silver") {
    return silverGram ? Math.round(silverGram * (spec.silverRatio ?? 1) * (spec.weight || 1)) : 0;
  }
  const weight = spec.gold24kWeight || 0;
  return goldGram && weight ? Math.round(goldGram * weight) : 0;
}

/**
 * Build the price book from the sources
 * @param {Array<object>} sources - price sources with what they last gave (`items`)
 * @param {{ now?: string, sourceStates?: Record<string, object> }} [options] - `sourceStates`: when
 *   each source last synced (kept in the book as `sources`)
 * @returns {{ updatedAt: string, items: Record<string, object>, sources: Record<string, object> }}
 */
export function buildPriceBook(sources, { now = new Date().toISOString(), sourceStates = {} } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const entries = assignIds(collectEntries(list));
  const items = {};

  // 1. Prices already in tomans
  for (const entry of entries) {
    if (entry.quote === "toman") items[entry.id] = toItem(entry, roundToman(entry.value));
    else if (entry.quote === "rial") items[entry.id] = toItem(entry, roundToman(entry.value / 10));
  }

  // 2. Dollar quotes, through the book's own USD price
  const usdToman = positive(items[BASE_PRICE_IDS.usd]?.price);
  for (const entry of entries) {
    if (entry.quote === "usd" && usdToman) {
      items[entry.id] = toItem(entry, roundToman(entry.value * usdToman), { usd: entry.value });
    } else if (entry.quote === "usd_cross" && usdToman) {
      items[entry.id] = toItem(entry, roundToman(entry.value * usdToman), { usdCross: entry.value });
    }
  }

  // 3. Intrinsic values: on the items that have a market price, and as items where there is none
  const goldUsd = positive(items[BASE_PRICE_IDS.goldOunce]?.params?.usd);
  const silverUsd = positive(items[BASE_PRICE_IDS.silverOunce]?.params?.usd);
  const grams = {
    goldGram: calculateGold24kGram(goldUsd, usdToman),
    silverGram: calculateSilverGram(silverUsd, usdToman),
  };
  for (const spec of [...Object.values(GOLD_SPECS), ...Object.values(COIN_SPECS), ...Object.values(SILVER_SPECS)]) {
    const id = normalizePriceId(spec.id);
    const intrinsic = intrinsicOf(spec, grams);
    if (!intrinsic) continue;
    const market = items[id];
    if (market) {
      const bubble = calculateBubble(market.price, intrinsic);
      const targetBubblePct = market.sourceId
        ? (list.find((s) => s.id === market.sourceId)?.bubblePct ?? spec.targetBubblePct ?? 0)
        : (spec.targetBubblePct ?? 0);
      market.params = { ...market.params, intrinsic, bubblePct: bubble.bubblePct, targetBubblePct };
    } else {
      items[id] = {
        id,
        price: intrinsic,
        name: spec.name,
        category: spec.category,
        unit: spec.unit || "",
        sourceId: null,
        updatedAt: now,
        params: { intrinsic, derived: "intrinsic", targetBubblePct: spec.targetBubblePct ?? 0 },
      };
    }
  }

  // 4. Fixed prices (cash)
  for (const spec of Object.values(CASH_SPECS)) {
    const id = normalizePriceId(spec.id);
    if (!items[id] && positive(spec.staticPrice)) {
      items[id] = {
        id,
        price: spec.staticPrice,
        name: spec.name,
        category: spec.category,
        unit: spec.unit || "",
        sourceId: null,
        updatedAt: now,
        params: { derived: "static" },
      };
    }
  }

  // 5. Staleness: a source that hasn't synced for a while marks its prices, and prices computed
  //    from a stale dollar or ounce are stale too
  markStale(items, list, sourceStates || {}, Date.parse(now) || Date.now());

  return { updatedAt: now, version: priceBookVersion(items), items, sources: sourceStates || {} };
}

/**
 * A catalog item (a symbol of a catalog source: the exchange, funds, plans) — thousands of them,
 * synced about once an hour, so clients load them apart from the rest of the book
 */
export const isCatalogItem = (item) => Boolean(item?.params?.symbol);

/**
 * The book's items in two parts: `core` (currencies, gold, coins… — what moves every minute) and
 * `catalog` (isCatalogItem)
 * @param {Record<string, object>} items
 * @returns {{ core: Record<string, object>, catalog: Record<string, object> }}
 */
export function splitPriceBook(items) {
  const core = {};
  const catalog = {};
  for (const [id, item] of Object.entries(items || {})) (isCatalogItem(item) ? catalog : core)[id] = item;
  return { core, catalog };
}

/**
 * A short fingerprint of what the book says: every id with its price and whether it is stale
 * (not the timestamps, which move on every sync). Equal versions mean nothing a screen shows
 * changed; it is the book's ETag.
 * @param {Record<string, object>} items
 */
export function priceBookVersion(items) {
  // FNV-1a, 32 bits, over "id=price[!];" in id order
  let hash = 0x811c9dc5;
  const text = Object.keys(items || {}).sort()
    .map((id) => `${id}=${items[id]?.price}${items[id]?.params?.stale ? "!" : ""};`).join("");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Set `params.stale` (and `params.staleSince`, the last successful sync) on stale items
 * @param {Record<string, object>} items - the book's items (changed in place)
 */
function markStale(items, sources, states, nowMs) {
  const staleSince = new Map();
  for (const src of sources) {
    const syncedAt = states[src.id]?.syncedAt;
    const last = Date.parse(syncedAt || "");
    // A source the book has no sync time for (just added, or before the first sync) isn't judged
    if (last && nowMs - last > staleAfterSecOf(src) * 1000) staleSince.set(src.id, syncedAt);
  }
  const mark = (item, since) => {
    item.params = { ...item.params, stale: true, ...(since ? { staleSince: since } : {}) };
  };
  for (const item of Object.values(items)) {
    if (item.sourceId && staleSince.has(item.sourceId)) mark(item, staleSince.get(item.sourceId));
  }
  // Prices computed from the dollar or the ounces inherit their staleness
  const isStale = (id) => Boolean(items[id]?.params?.stale);
  for (const item of Object.values(items)) {
    if (item.params?.stale) continue;
    const p = item.params || {};
    const fromDollar = p.usd !== undefined || p.usdCross !== undefined;
    const ounce = item.category === "silver" ? BASE_PRICE_IDS.silverOunce : BASE_PRICE_IDS.goldOunce;
    if ((fromDollar && isStale(BASE_PRICE_IDS.usd))
      || (p.derived === "intrinsic" && (isStale(BASE_PRICE_IDS.usd) || isStale(ounce)))) mark(item, null);
  }
}

/**
 * Ids that more than one primary source claims (a config mistake: only one may own an id)
 * @returns {Array<{ id: string, sourceIds: string[] }>}
 */
export function findPrimaryIdConflicts(sources) {
  const owners = new Map();
  for (const entry of collectEntries(sources || [])) {
    if (!entry.src.isPrimary) continue;
    if (!owners.has(entry.baseId)) owners.set(entry.baseId, new Set());
    owners.get(entry.baseId).add(entry.src.id);
  }
  return [...owners].filter(([, ids]) => ids.size > 1).map(([id, ids]) => ({ id, sourceIds: [...ids] }));
}

