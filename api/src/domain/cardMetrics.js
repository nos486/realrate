/**
 * cardMetrics.js — What a home card can show besides its last price, and which items are linked
 *
 * - Links (ITEM_LINKS): items that belong together, read from the asset specs — never from ids
 *   in code. A coin's bubble names its coin (`bubbleOf` in bubble.spec.js), so the coin's card can
 *   show its bubble, and the bubble's card its coin. A new kind of link is one entry here.
 * - Metrics (CARD_METRICS): one value of an item — its last price, its 30-day or one-year average
 *   (priceAverages.js), its day change, its bubble, intrinsic value, standard price, deviation.
 * - A card's main figure is its last price or one of its averages (MAIN_METRICS); a full card
 *   has up to CARD_SLOT_LIMIT slots, each a metric of the item itself ("avg:30d") or of a linked
 *   item ("bubble/price"): a slot key.
 *
 * Values come from the price book item (and, for gold and coins, the calculator's analysis at
 * the user's rates, when given) — nothing is fetched. Pure; shared with the web app.
 */

import { SPEC_BY_ID, normalizePriceId, currencyOf } from "./priceBook.js";
import { AVERAGE_WINDOWS, AVERAGE_WINDOW_KEYS } from "./priceAverages.js";

/** Kinds of link: `field` of a spec names another item; "in" links to the items naming this one */
export const ITEM_LINKS = {
  bubble: { label: "حباب", field: "bubbleOf", direction: "in" },
  coin: { label: "سکه", field: "bubbleOf", direction: "out" },
};

/** Slots a full card has */
export const CARD_SLOT_LIMIT = 3;

const avgKey = (w) => `avg:${w}`;

/**
 * Everything a card can show. kind: 'price' (in a currency) or 'pct'; `needs` says where the
 * value comes from (an item without it doesn't offer the metric)
 */
export const CARD_METRICS = {
  price: { label: "آخرین قیمت", kind: "price" },
  ...Object.fromEntries(AVERAGE_WINDOW_KEYS.map((w) => [avgKey(w), { label: `میانگین ${AVERAGE_WINDOWS[w].label}`, kind: "price", window: w }])),
  change: { label: "تغییر روز", kind: "pct" },
  bubblePct: { label: "درصد حباب", kind: "pct" },
  intrinsic: { label: "ارزش ذاتی", kind: "price" },
  standard: { label: "قیمت استاندارد", kind: "price" },
  deviation: { label: "انحراف از استاندارد", kind: "pct" },
};

/** What a card's main figure can be: its last price (the default) or an average */
export const MAIN_METRICS = ["price", ...AVERAGE_WINDOW_KEYS.map(avgKey)];

/** The slots a gold or coin card shows until its slots are chosen (the bubble analysis) */
export const ANALYSIS_SLOTS = ["intrinsic", "standard", "deviation"];

// ── Links ──────────────────────────────────────────────────────────────────

/** "in" links by kind: target id → the ids whose spec names it */
const IN_LINKS = (() => {
  const byKind = {};
  for (const [kind, { field, direction }] of Object.entries(ITEM_LINKS)) {
    if (direction !== "in") continue;
    const index = new Map();
    for (const spec of SPEC_BY_ID.values()) {
      const target = spec?.[field] ? normalizePriceId(spec[field]) : "";
      if (!target) continue;
      if (!index.has(target)) index.set(target, []);
      index.get(target).push(normalizePriceId(spec.id));
    }
    byKind[kind] = index;
  }
  return byKind;
})();

/**
 * The item a link of `kind` leads to from `id`, or null
 * @param {string} id
 * @param {string} kind - an ITEM_LINKS key
 */
export function linkedItemId(id, kind) {
  const link = ITEM_LINKS[kind];
  const key = normalizePriceId(id);
  if (!link || !key) return null;
  if (link.direction === "out") {
    const target = SPEC_BY_ID.get(key)?.[link.field];
    return target ? normalizePriceId(target) : null;
  }
  return IN_LINKS[kind]?.get(key)?.[0] || null;
}

/** Every link from an item: [{ kind, id }] */
export function linksOf(id) {
  return Object.keys(ITEM_LINKS)
    .map((kind) => ({ kind, id: linkedItemId(id, kind) }))
    .filter((l) => l.id);
}

// ── Slot keys ──────────────────────────────────────────────────────────────

/**
 * A slot key's parts: "avg:30d" → { link: null, metric: "avg:30d" }, "bubble/price" →
 * { link: "bubble", metric: "price" }; null when it isn't a valid key
 */
export function parseSlotKey(key) {
  const text = String(key || "");
  const at = text.indexOf("/");
  const link = at === -1 ? null : text.slice(0, at);
  const metric = at === -1 ? text : text.slice(at + 1);
  if (link !== null && !Object.hasOwn(ITEM_LINKS, link)) return null;
  if (!Object.hasOwn(CARD_METRICS, metric)) return null;
  return { link, metric };
}

export const slotKeyOf = (link, metric) => (link ? `${link}/${metric}` : metric);

// ── Values ─────────────────────────────────────────────────────────────────

const positive = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const finite = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * One metric of an item
 * @param {object|null} item - a price book item (or the web's asset of it)
 * @param {string} metric - a CARD_METRICS key
 * @param {{ analysis?: object|null, display?: 'usd'|'toman'|null }} [options] - analysis: the
 *   calculator's row for a gold or coin (at the user's rates); display: a dollar-priced item shown
 *   in tomans
 * @returns {{ value: number, currency?: 'usd'|'toman', days?: number }|null} null when the item has none
 */
export function metricValue(item, metric, { analysis = null, display = null } = {}) {
  if (!item) return null;
  const p = item.params || {};
  const usd = currencyOf(item) === "usd" && positive(item.priceUsd);
  const inToman = !usd || display === "toman";
  const currency = inToman ? "toman" : "usd";
  const def = CARD_METRICS[metric];
  if (!def) return null;

  if (metric === "price") {
    const value = inToman ? positive(item.price) : positive(item.priceUsd);
    return value ? { value, currency } : null;
  }
  if (def.window) {
    const avg = (usd && inToman ? p.toman?.avg : p.avg)?.[def.window];
    return positive(avg?.value) ? { value: Number(avg.value), currency, days: Number(avg.days) || null } : null;
  }
  if (metric === "change") {
    const value = finite(usd && inToman ? p.toman?.changePercent : p.changePercent);
    return value === null ? null : { value };
  }
  if (metric === "bubblePct") {
    const value = finite(analysis?.bubble_pct ?? p.bubblePct);
    return value === null ? null : { value };
  }

  // Gold and coins: at the user's rates (the analysis), else at the book's
  const intrinsic = positive(analysis?.intrinsic ?? p.intrinsic);
  if (metric === "intrinsic") return intrinsic ? { value: intrinsic, currency: "toman" } : null;
  const target = finite(analysis?.target_bubble_pct ?? p.targetBubblePct);
  if (!intrinsic || !(target > 0)) return null;
  const standard = positive(analysis?.expected_price) || Math.round(intrinsic * (1 + target / 100));
  if (metric === "standard") return { value: standard, currency: "toman" };
  // deviation: the market price from the standard price
  const market = positive(analysis ? analysis.market : item.sourceId ? item.price : null);
  if (!market) return null;
  const value = finite(analysis?.diff_from_expected_pct) ?? Math.round(((market - standard) / standard) * 1000) / 10;
  return { value };
}

/**
 * The metrics a card of `id` can show in its slots, with what they show now
 * @param {string} id
 * @param {(id: string) => object|null} itemOf - the price book item of an id
 * @param {{ analysisOf?: (id: string) => object|null, display?: string|null }} [options]
 * @returns {Array<{ key: string, link: string|null, linkedId: string|null, metric: string, label: string,
 *   value: number, currency?: string, days?: number }>}
 */
export function slotOptionsOf(id, itemOf, { analysisOf = () => null, display = null } = {}) {
  const options = [];
  const add = (link, linkedId, item, analysis, itemDisplay) => {
    for (const metric of Object.keys(CARD_METRICS)) {
      if (!link && metric === "price") continue; // the card's own price is its main figure
      const value = metricValue(item, metric, { analysis, display: itemDisplay });
      if (value) options.push({ key: slotKeyOf(link, metric), link, linkedId, metric, label: CARD_METRICS[metric].label, ...value });
    }
  };
  const key = normalizePriceId(id);
  add(null, null, itemOf(key), analysisOf(key), display);
  for (const { kind, id: linkedId } of linksOf(key)) {
    const linked = itemOf(linkedId);
    if (linked) add(kind, linkedId, linked, analysisOf(linkedId), null);
  }
  return options;
}

/**
 * A card's slots: the chosen ones, or — until chosen — the bubble analysis of a gold or coin (one
 * without a market price already shows its intrinsic value as its price)
 * @param {string[]|undefined} chosen - the layout's (undefined: not chosen)
 * @param {object|null} analysis - the calculator's row of the card's item
 */
export function cardSlotsOf(chosen, analysis) {
  if (Array.isArray(chosen)) return chosen;
  if (!analysis) return [];
  const hasMarket = analysis.market !== null && analysis.market !== undefined;
  return hasMarket ? ANALYSIS_SLOTS : ANALYSIS_SLOTS.filter((key) => key !== "intrinsic");
}
