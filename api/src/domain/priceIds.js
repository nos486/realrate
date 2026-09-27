/**
 * priceIds.js — Turn any id the app has ever stored into the price book's id
 *
 * The price book (priceBook.js) gives every price one id that names the asset, not the provider.
 * Older data — holdings, transactions, reference assets, home pages — was saved with whatever id
 * the screen of the day built: "src_def_usd", "derived_gold_18k", "EUR", "forex_eur",
 * "bourse_فولاد", "src_def_bourse__فولاد", "emofid__عیار", "src_def_forex::try", "gold_ounce",
 * "full_new", …. This is the one place those old forms are understood: reading resolves them,
 * and the migration rewrites stored data with the result.
 *
 * Records written with book ids carry `priceIdVersion` (PRICE_ID_VERSION): they are never
 * guessed at again, so these old forms only ever apply to old data.
 * Shared with the web app.
 */

import { normalizePriceId, catalogMarketOf } from "./priceBook.js";
import { getMasterPriceSourcesConfig } from "../config/sources.config.js";

/**
 * The id form stored records are written in. 2: catalog ids by market ("bourse__فولاد") and
 * Persian letters in one form.
 */
export const PRICE_ID_VERSION = 2;

/** Old names of book items */
export const LEGACY_PRICE_ID_ALIASES = {
  usd_toman: "usd",
  full_new: "full_coin",
  half: "half_coin",
  quarter: "quarter_coin",
  bank_gram: "gerami_coin",
  gram: "gerami_coin",
  gold_ounce: "ons_gold",
  xau: "ons_gold",
  ons_gold_toman: "ons_gold",
  gold_ounce_toman: "ons_gold",
  xau_toman: "ons_gold",
  silver_ounce: "ons_silver",
  xag: "ons_silver",
  ons_silver_toman: "ons_silver",
  silver_ounce_toman: "ons_silver",
  xag_toman: "ons_silver",
  cash: "toman",
  rial: "toman",
};

/** Prefixes old screens put in front of a book id */
const LEGACY_PREFIXES = ["src_def_", "derived_", "forex_", "crypto_"];

/**
 * Old prefixes of catalog ids → the market their items belong to, from the source config: a
 * catalog was once keyed by its source id ("src_def_bourse__x"), its short name ("emofid__x"),
 * its priceType or its adapter's name. Built on first use.
 */
let legacyCatalogPrefixes = null;
function catalogPrefixes() {
  if (!legacyCatalogPrefixes) {
    legacyCatalogPrefixes = new Map();
    for (const src of getMasterPriceSourcesConfig()) {
      if (!src.isCatalog) continue;
      const market = normalizePriceId(catalogMarketOf(src));
      const names = [src.id, String(src.id).replace(/^src_def_/, ""), src.priceType, src.sourceType];
      for (const name of names) {
        const prefix = normalizePriceId(name);
        if (prefix && prefix !== market) legacyCatalogPrefixes.set(prefix, market);
      }
    }
  }
  return legacyCatalogPrefixes;
}

/** A user's own asset, priced by hand: never a book id */
export const isCustomAssetId = (id) => {
  const s = normalizePriceId(id);
  return s === "custom" || s.startsWith("custom_");
};

const alias = (id) => LEGACY_PRICE_ID_ALIASES[id] || id;

/**
 * An old catalog id in its market form: "src_def_bourse__x" / "emofid__x" → "bourse__x",
 * "bourse_x" → "bourse__x" (the oldest form). Null when it isn't one.
 */
function legacyCatalogId(raw) {
  const sep = raw.indexOf("__");
  if (sep > 0) {
    const market = catalogPrefixes().get(raw.slice(0, sep));
    const rest = raw.slice(sep + 2);
    // "src_def_emofid__bourse__x" is today's id of a second source's copy, not an old form
    if (!market || rest.startsWith(`${market}__`)) return null;
    return `${market}__${rest}`;
  }
  const m = /^bourse_(?!_)(.+)$/.exec(raw);
  return m ? `bourse__${m[1]}` : null;
}

/** Whether an id is in an old form (only those are ever resolved by guessing) */
const isLegacyForm = (raw) => raw.includes("::") || Boolean(legacyCatalogId(raw))
  || LEGACY_PREFIXES.some((p) => raw.startsWith(p)) || Object.hasOwn(LEGACY_PRICE_ID_ALIASES, raw);

/**
 * Every form an old id may stand for, most likely first
 * @param {string} raw - normalized id
 */
function candidatesOf(raw) {
  const out = [raw, alias(raw)];
  const catalog = legacyCatalogId(raw);
  if (catalog) out.push(catalog);
  // "src_def_usd" → "usd"; a catalog id is handled above
  if (!raw.includes("__")) {
    for (const prefix of LEGACY_PREFIXES) {
      if (raw.startsWith(prefix)) {
        const rest = raw.slice(prefix.length);
        out.push(rest, alias(rest));
      }
    }
  }
  // "src_def_forex::try" → "try"
  if (raw.includes("::")) {
    const tail = raw.slice(raw.lastIndexOf("::") + 2);
    out.push(tail, alias(tail));
  }
  return out;
}

/**
 * The book id for any stored id
 * @param {string} id - an id as it was stored
 * @param {Iterable<string>|Record<string, unknown>|null} [knownIds] - the book's ids (or its items
 *   object); with them, old forms resolve to an id that exists
 * @returns {string} the book id, or the normalized id when nothing better is known
 */
export function toPriceId(id, knownIds = null) {
  const raw = normalizePriceId(id);
  if (!raw || isCustomAssetId(raw)) return raw;

  const candidates = candidatesOf(raw);
  const bestGuess = () => candidates.find((c) => c !== raw && !c.includes("::")) || raw;
  if (!knownIds) return bestGuess();

  // Looked up in place: the book has thousands of ids and this runs for every holding
  const has = knownIds instanceof Set ? (c) => knownIds.has(c)
    : Array.isArray(knownIds) ? (c) => knownIds.includes(c)
      : (c) => Object.hasOwn(knownIds, c);
  const hit = candidates.find(has);
  if (hit) return hit;

  // An old catalog id of a source whose items the book no longer names that way: the one book id
  // with the same symbol. Never for an id in today's form — an item missing from the book stays
  // missing rather than turning into a lookalike.
  if (isLegacyForm(raw)) {
    const sep = raw.includes("::") ? "::" : raw.includes("__") ? "__" : null;
    if (sep) {
      const suffix = `__${raw.slice(raw.lastIndexOf(sep) + sep.length)}`;
      const ids = knownIds instanceof Set || Array.isArray(knownIds) ? [...knownIds] : Object.keys(knownIds);
      const matches = ids.filter((k) => k.endsWith(suffix));
      if (matches.length === 1) return matches[0];
    }
  }
  return bestGuess();
}

/** Fields of stored records that hold a price id */
export const PRICE_ID_FIELDS = ["assetId", "referenceAssetId", "compareAssetId"];

/**
 * A record about to be stored, in the current id form (its ids resolved, and stamped so they are
 * never guessed at again)
 * @param {object} record
 * @param {Record<string, unknown>|Set<string>|null} [knownIds]
 */
export function withPriceIdVersion(record, knownIds = null) {
  if (!record || typeof record !== "object") return record;
  const next = { ...record, priceIdVersion: PRICE_ID_VERSION };
  for (const field of PRICE_ID_FIELDS) {
    const stored = record[field];
    if (stored && !isCustomAssetId(stored)) next[field] = toPriceId(stored, knownIds);
  }
  return next;
}

/**
 * A stored record with its price ids in book form. Only ids that resolve to an existing book id
 * are rewritten (an unknown id is left for a later run, when the book knows more); a record whose
 * ids all resolve is stamped with the current version. Records already stamped are left alone.
 * @param {object} record
 * @param {Record<string, unknown>|Set<string>} knownIds - the book's ids
 * @returns {{ changed: boolean, record: object }}
 */
export function migrateRecordPriceIds(record, knownIds) {
  if (!record || typeof record !== "object" || !knownIds) return { changed: false, record };
  if (Number(record.priceIdVersion) >= PRICE_ID_VERSION) return { changed: false, record };
  const has = knownIds instanceof Set ? (id) => knownIds.has(id) : (id) => Object.hasOwn(knownIds, id);
  let next = record;
  let resolved = true;
  for (const field of PRICE_ID_FIELDS) {
    const stored = record[field];
    if (!stored || isCustomAssetId(stored)) continue;
    const id = toPriceId(stored, knownIds);
    if (!has(id)) {
      resolved = false;
      continue;
    }
    if (id !== stored) next = { ...next, [field]: id };
  }
  // Stamped only when it changed: a record already in book form needs no rewrite to stay so
  if (next !== record && resolved) next = { ...next, priceIdVersion: PRICE_ID_VERSION };
  return { changed: next !== record, record: next };
}
