/**
 * priceIds.js — Turn any id the app has ever stored into the price book's id
 *
 * The price book (priceBook.js) gives every price one lower-case id. Older data — holdings,
 * transactions, reference assets, home pages — was saved with whatever id the screen of the
 * day built: "src_def_usd", "derived_gold_18k", "EUR", "forex_eur", "bourse_فولاد",
 * "src_def_forex::try", "gold_ounce", "full_new", …. This is the one place those old forms are
 * understood: reading resolves them, and the migration rewrites stored data with the result.
 * Shared with the web app.
 */

import { normalizePriceId } from "./priceBook.js";

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

/** The bourse catalog's source (old "bourse_<symbol>" ids belong to it) */
const BOURSE_SOURCE_ID = "src_def_bourse";

/** A user's own asset, priced by hand: never a book id */
export const isCustomAssetId = (id) => {
  const s = normalizePriceId(id);
  return s === "custom" || s.startsWith("custom_");
};

const alias = (id) => LEGACY_PRICE_ID_ALIASES[id] || id;

/**
 * Every form an old id may stand for, most likely first
 * @param {string} raw - normalized id
 */
function candidatesOf(raw) {
  const out = [raw, alias(raw)];
  // "src_def_usd" → "usd"; a catalog id ("src_def_bourse__x") is kept whole above
  if (!raw.includes("__")) {
    for (const prefix of LEGACY_PREFIXES) {
      if (raw.startsWith(prefix)) {
        const rest = raw.slice(prefix.length);
        out.push(rest, alias(rest));
      }
    }
  }
  if (raw.startsWith("bourse_")) out.push(`${BOURSE_SOURCE_ID}__${raw.slice("bourse_".length)}`);
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
  if (!knownIds) return candidates.find((c) => c !== raw && !c.includes("::")) || raw;

  // Looked up in place: the book has thousands of ids and this runs for every holding
  const has = knownIds instanceof Set ? (c) => knownIds.has(c)
    : Array.isArray(knownIds) ? (c) => knownIds.includes(c)
      : (c) => Object.hasOwn(knownIds, c);
  const hit = candidates.find(has);
  if (hit) return hit;

  // A catalog item saved under another prefix ("emofid__عیار", "charisma_plans__gold"): the one
  // book id with the same symbol
  const sep = raw.includes("::") ? "::" : raw.includes("__") ? "__" : null;
  if (sep) {
    const suffix = `__${raw.slice(raw.lastIndexOf(sep) + sep.length)}`;
    const ids = knownIds instanceof Set || Array.isArray(knownIds) ? [...knownIds] : Object.keys(knownIds);
    const matches = ids.filter((k) => k.endsWith(suffix));
    if (matches.length === 1) return matches[0];
  }
  return candidates.find((c) => c !== raw && !c.includes("::")) || raw;
}

/** Fields of stored records that hold a price id */
export const PRICE_ID_FIELDS = ["assetId", "referenceAssetId"];

/**
 * A stored record with its price ids in book form. Only ids that resolve to an existing book id
 * are rewritten (an unknown id is left for a later run, when the book knows more).
 * @param {object} record
 * @param {Record<string, unknown>|Set<string>} knownIds - the book's ids
 * @returns {{ changed: boolean, record: object }}
 */
export function migrateRecordPriceIds(record, knownIds) {
  if (!record || typeof record !== "object" || !knownIds) return { changed: false, record };
  const has = knownIds instanceof Set ? (id) => knownIds.has(id) : (id) => Object.hasOwn(knownIds, id);
  let next = record;
  for (const field of PRICE_ID_FIELDS) {
    const stored = record[field];
    if (!stored || isCustomAssetId(stored)) continue;
    const id = toPriceId(stored, knownIds);
    if (id !== stored && has(id)) next = { ...next, [field]: id };
  }
  return { changed: next !== record, record: next };
}
