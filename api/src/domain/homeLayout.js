/**
 * homeLayout.js — Shape and validation of a user's customized home page
 *
 * The home page is a list of sections; each section shows any market assets (gold, coins,
 * currencies, crypto, bourse symbols, funds, ...) in one card style. Shared by the API (which
 * stores the layout per user) and the web client (which edits it), through a symlink.
 *
 * {
 *   version: 1,
 *   sections: [
 *     { id: "s_gold", title: "طلا و سکه", style: "detailed", items: ["gold_18k", "full_coin"] },
 *     { id: "s_fx",   title: "ارزها",     style: "compact",  items: ["USD", "EUR"] },
 *   ]
 * }
 * A section saved with the older "trend" style is read as "detailed" (the full card now carries
 * the trend chart).
 *
 * A section can also say how a dollar-priced asset's card shows its price (the ounce, oil):
 * `display: { ons_gold: "toman" }` — its toman price large and the dollar one under it. Absent
 * means its own currency, dollars. Only the display changes: the item and its id stay the same.
 *
 * And what each card shows (cardMetrics.js): `cards: { full_coin: { main: "avg:30d",
 * slots: ["intrinsic", "bubble/price", "bubble/avg:30d"] } }` — its main figure (absent: the last
 * price) and a full card's slots (absent: the default, the bubble analysis for gold and coins; an
 * empty list: none). Only cards of the section's own items are kept.
 *
 * A section can also hold cards the user built from several assets with a formula (cardFormula.js):
 * `formulas: { fx_ab12: { name, expr: "a/(b-a)", vars: { a: "bubble_full_coin", b: "full_coin" },
 * format: "percent" } }`, each placed by its id in `items`. A formula card without a valid
 * definition is dropped, and so is a definition whose card isn't in the section.
 */

import { MAIN_METRICS, CARD_SLOT_LIMIT, parseSlotKey } from "./cardMetrics.js";
import { isFormulaId, sanitizeFormulaCard, FORMULA_ID_RE } from "./cardFormula.js";

export const HOME_LAYOUT_VERSION = 1;

/** Card styles a section can use: the full card (with its price chart) and the compact one */
export const HOME_SECTION_STYLES = {
  detailed: "کارت کامل",
  compact: "کارت فشرده",
};

/** How a dollar-priced asset's card shows its price: in dollars (its own, the default) or in tomans */
export const HOME_PRICE_DISPLAYS = {
  usd: "دلاری",
  toman: "تومانی",
};

/** Styles of older layouts → today's */
const LEGACY_STYLES = { trend: "detailed" };

export const HOME_LAYOUT_LIMITS = {
  sections: 12,
  itemsPerSection: 60,
  titleLength: 40,
  idLength: 120,
};

const SECTION_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Normalize a layout into the valid shape, dropping anything malformed. Returns null when the
 * input isn't a layout at all (so callers can fall back to the default home page).
 * @param {unknown} input
 * @returns {{ version: number, sections: Array<{ id: string, title: string, style: string, items: string[],
 *   display?: Record<string, "toman">, cards?: Record<string, { main?: string, slots?: string[] }>,
 *   formulas?: Record<string, object> }> }|null}
 */
export function sanitizeHomeLayout(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.sections)) return null;

  const seenSections = new Set();
  const sections = [];
  for (const raw of input.sections) {
    if (sections.length >= HOME_LAYOUT_LIMITS.sections) break;
    if (!raw || typeof raw !== "object") continue;

    let id = String(raw.id || "").trim();
    if (!SECTION_ID_RE.test(id) || seenSections.has(id)) id = `s_${sections.length + 1}_${seenSections.size}`;
    seenSections.add(id);

    const title = String(raw.title ?? "").trim().slice(0, HOME_LAYOUT_LIMITS.titleLength);
    const rawStyle = LEGACY_STYLES[raw.style] || raw.style;
    const style = Object.hasOwn(HOME_SECTION_STYLES, rawStyle) ? rawStyle : "compact";

    const rawFormulas = raw.formulas && typeof raw.formulas === "object" ? raw.formulas : {};
    const seenItems = new Set();
    const items = [];
    const formulas = {};
    for (const item of Array.isArray(raw.items) ? raw.items : []) {
      if (items.length >= HOME_LAYOUT_LIMITS.itemsPerSection) break;
      const assetId = String(item ?? "").trim();
      if (!assetId || assetId.length > HOME_LAYOUT_LIMITS.idLength || seenItems.has(assetId)) continue;
      if (isFormulaId(assetId)) {
        const formula = FORMULA_ID_RE.test(assetId) && Object.hasOwn(rawFormulas, assetId) ? sanitizeFormulaCard(rawFormulas[assetId]) : null;
        if (!formula) continue;
        formulas[assetId] = formula;
      }
      seenItems.add(assetId);
      items.push(assetId);
    }

    // Only the cards in the section that aren't shown in their own currency
    const display = {};
    const rawDisplay = raw.display && typeof raw.display === "object" ? raw.display : {};
    for (const assetId of items) {
      if (Object.hasOwn(rawDisplay, assetId) && rawDisplay[assetId] === "toman") display[assetId] = "toman";
    }

    const cards = sanitizeCards(raw.cards, items);

    sections.push({
      id,
      title,
      style,
      items,
      ...(Object.keys(display).length ? { display } : {}),
      ...(Object.keys(cards).length ? { cards } : {}),
      ...(Object.keys(formulas).length ? { formulas } : {}),
    });
  }

  return { version: HOME_LAYOUT_VERSION, sections };
}

/**
 * What each card shows: a main figure other than the last price, and chosen slots (valid keys,
 * no repeats, at most CARD_SLOT_LIMIT). A card with neither is left out.
 * @param {unknown} input
 * @param {string[]} items - the section's items
 */
function sanitizeCards(input, items) {
  const cards = {};
  if (!input || typeof input !== "object") return cards;
  for (const assetId of items) {
    const raw = Object.hasOwn(input, assetId) ? input[assetId] : null;
    if (!raw || typeof raw !== "object") continue;
    const card = {};
    if (MAIN_METRICS.includes(raw.main) && raw.main !== "price") card.main = raw.main;
    if (Array.isArray(raw.slots)) {
      card.slots = [...new Set(raw.slots.map(String).filter((key) => parseSlotKey(key)))].slice(0, CARD_SLOT_LIMIT);
    }
    if (Object.keys(card).length) cards[assetId] = card;
  }
  return cards;
}
