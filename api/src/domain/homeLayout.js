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
 *     { id: "s_fx",   title: "ارزها",     style: "compact",  items: ["USD", "EUR"] }
 *   ]
 * }
 */

export const HOME_LAYOUT_VERSION = 1;

/** Card styles a section can use */
export const HOME_SECTION_STYLES = {
  detailed: "کارت کامل",
  compact: "کارت فشرده",
};

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
 * @returns {{ version: number, sections: Array<{ id: string, title: string, style: string, items: string[] }> }|null}
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
    const style = Object.hasOwn(HOME_SECTION_STYLES, raw.style) ? raw.style : "compact";

    const seenItems = new Set();
    const items = [];
    for (const item of Array.isArray(raw.items) ? raw.items : []) {
      if (items.length >= HOME_LAYOUT_LIMITS.itemsPerSection) break;
      const assetId = String(item ?? "").trim();
      if (!assetId || assetId.length > HOME_LAYOUT_LIMITS.idLength || seenItems.has(assetId)) continue;
      seenItems.add(assetId);
      items.push(assetId);
    }

    sections.push({ id, title, style, items });
  }

  return { version: HOME_LAYOUT_VERSION, sections };
}
