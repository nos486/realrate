/**
 * portfolioLayout.js — Shape and validation of a user's customized portfolio category layout
 *
 * A portfolio layout groups assets into custom categories.
 * Encrypted and stored in the account vault under record kind 'portfolio_layout'
 * with parent_id = portfolioId.
 *
 * {
 *   version: 1,
 *   groups: [
 *     { id: "g_gold", title: "طلا و سکه", icon: "gold", items: ["gold_18k", "full_coin"] },
 *     { id: "g_saving", title: "پس‌انداز ارزی", icon: "currency", items: ["usd", "eur"] }
 *   ]
 * }
 */

export const PORTFOLIO_LAYOUT_VERSION = 1;

export const PORTFOLIO_LAYOUT_LIMITS = {
  groups: 30,
  itemsPerGroup: 100,
  titleLength: 50,
  idLength: 120,
};

const GROUP_ID_RE = /^[A-Za-z0-9_-]{1,50}$/;

export const ALLOWED_CATEGORY_ICONS = new Set([
  'gold',
  'coin',
  'silver',
  'currency',
  'crypto',
  'bourse',
  'bourse_fund',
  'custom',
  'wallet',
  'sparkles',
]);

/**
 * Normalize and validate a portfolio layout into a valid shape.
 * Returns null if input is invalid or missing groups array.
 * Ensures:
 * - max groups limit
 * - valid group id (alphanumeric/hyphen/underscore) and unique group ids
 * - trimmed title with max length
 * - valid icon
 * - unique items per group and across layout (each assetKey only assigned once)
 * - items count limit
 *
 * @param {unknown} input
 * @returns {{ version: number, groups: Array<{ id: string, title: string, icon: string, items: string[] }> }|null}
 */
export function sanitizePortfolioLayout(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.groups)) return null;

  const seenGroups = new Set();
  const seenItems = new Set();
  const groups = [];

  for (const raw of input.groups) {
    if (groups.length >= PORTFOLIO_LAYOUT_LIMITS.groups) break;
    if (!raw || typeof raw !== 'object') continue;

    let id = String(raw.id || '').trim();
    if (!GROUP_ID_RE.test(id) || seenGroups.has(id)) {
      id = `g_${groups.length + 1}_${seenGroups.size}`;
    }
    seenGroups.add(id);

    const title = String(raw.title ?? '').trim().slice(0, PORTFOLIO_LAYOUT_LIMITS.titleLength);
    const rawIcon = String(raw.icon || '').trim().toLowerCase();
    const icon = ALLOWED_CATEGORY_ICONS.has(rawIcon) ? rawIcon : 'custom';

    const items = [];
    for (const item of Array.isArray(raw.items) ? raw.items : []) {
      if (items.length >= PORTFOLIO_LAYOUT_LIMITS.itemsPerGroup) break;
      const assetKey = String(item ?? '').trim();
      if (!assetKey || assetKey.length > PORTFOLIO_LAYOUT_LIMITS.idLength) continue;
      // An asset should only appear in ONE group across the layout
      if (seenItems.has(assetKey)) continue;
      seenItems.add(assetKey);
      items.push(assetKey);
    }

    groups.push({ id, title: title || 'دسته جدید', icon, items });
  }

  return { version: PORTFOLIO_LAYOUT_VERSION, groups };
}
