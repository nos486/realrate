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
 * - `id` is unique and lower-case. A single-price source gives its priceType ("usd", "gold_18k"),
 *   a multi-output feed its item code ("eur"), a catalog `${sourceId}__${symbol}`. When two
 *   sources give the same id, the primary one keeps it and the others become `${sourceId}__${id}`.
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

/** What a source's numbers are quoted in */
export const PRICE_QUOTES = ["toman", "rial", "usd", "usd_cross"];

// ── Ids ──────────────────────────────────────────────────────────────────────

/** Lower-case, trimmed id */
export const normalizePriceId = (id) => String(id ?? "").trim().toLowerCase();

/** The catalog id of an item: `${sourceId}__${symbol}` (a symbol may already carry the prefix) */
export function catalogAssetId(sourceId, symbol) {
  const sym = String(symbol ?? "").trim();
  if (!sourceId) return sym;
  return sym.startsWith(`${sourceId}__`) ? sym : `${sourceId}__${sym}`;
}

/** A catalog item's symbol, the same way the catalog reads it */
export function catalogItemSymbol(item) {
  return String(item?.id || item?.symbol || item?.s || item?.code || "").trim();
}

/** A catalog item's price in tomans, whichever field its feed fills */
export function catalogItemPriceToman(item) {
  const n = (v) => (v !== undefined && Number(v) > 0 ? Number(v) : 0);
  if (n(item?.price)) return Math.round(n(item.price));
  if (n(item?.priceToman)) return Math.round(n(item.priceToman));
  if (n(item?.p)) return Math.round(n(item.p));
  if (n(item?.priceRial)) return Math.round(n(item.priceRial) / 10);
  if (n(item?.pl)) return Math.round(n(item.pl) / 10);
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
          baseId: normalizePriceId(catalogAssetId(src.id, symbol)),
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
    if (entry.quote === "toman") items[entry.id] = toItem(entry, Math.round(entry.value));
    else if (entry.quote === "rial") items[entry.id] = toItem(entry, Math.round(entry.value / 10));
  }

  // 2. Dollar quotes, through the book's own USD price
  const usdToman = positive(items[BASE_PRICE_IDS.usd]?.price);
  for (const entry of entries) {
    if (entry.quote === "usd" && usdToman) {
      items[entry.id] = toItem(entry, Math.round(entry.value * usdToman), { usd: entry.value });
    } else if (entry.quote === "usd_cross" && usdToman) {
      items[entry.id] = toItem(entry, Math.round(entry.value * usdToman), { usdCross: entry.value });
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

  return { updatedAt: now, items, sources: sourceStates || {} };
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

/** The book's items as history points */
export const priceBookPoints = (book) =>
  Object.values(book?.items || {}).map((item) => ({ id: item.id, price: item.price }));
