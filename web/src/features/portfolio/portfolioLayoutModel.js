/**
 * portfolioLayoutModel.js — Default portfolio layout, category definitions and pure edit operations
 *
 * A portfolio layout is `{ version, groups: [{ id, title, icon, items: [assetKey] }], other?, targets? }`
 * (validated by utils/portfolioLayout.js, shared with the API). `targets` (the share each category
 * aims for, utils/allocationTargets.js) and `other` (assets the user put in «سایر») ride along every
 * edit below.
 * An asset no group lists goes to the group of its standard category (resolveAssetGroupId), so a
 * new asset lands where it belongs; only one with no such group, or one the user moved there,
 * goes to «سایر».
 * Every operation returns a new layout without mutating input.
 */

import {
  sanitizePortfolioLayout,
  PORTFOLIO_LAYOUT_VERSION,
  PORTFOLIO_LAYOUT_LIMITS,
} from '../../utils/portfolioLayout.js';
import { toPriceId, isCustomAssetId } from '../../utils/priceIds.js';
import { CATEGORY_DEFINITIONS } from './utils/holdingHelpers.js';
import { t } from '../../utils/i18n.js';

export function newGroupId() {
  return `g_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Standard asset key for grouping (price book id for market assets, raw id for custom assets)
 * @param {object|string} item
 * @returns {string}
 */
export function getAssetKey(item) {
  if (!item) return '';
  const rawId = item.assetId || (typeof item === 'string' ? item : item.id);
  if (!rawId) return '';
  return isCustomAssetId(rawId) ? String(rawId).trim() : toPriceId(rawId);
}

/**
 * Normalizes layout item IDs to book IDs or custom IDs and sanitizes
 * @param {object} layout
 * @returns {object|null}
 */
export function normalizePortfolioLayout(layout) {
  if (!layout || !Array.isArray(layout.groups)) return null;
  return sanitizePortfolioLayout({
    version: PORTFOLIO_LAYOUT_VERSION,
    groups: layout.groups.map((g) => ({
      ...g,
      items: (g.items || []).map((id) => getAssetKey(id)).filter(Boolean),
    })),
    other: (layout.other || []).map((id) => getAssetKey(id)).filter(Boolean),
    targets: layout.targets,
  });
}

/**
 * Helper to ensure a sanitized layout (keeping the targets and «سایر» list it had)
 */
const layoutOf = (groups, targets, other = []) =>
  normalizePortfolioLayout({
    version: PORTFOLIO_LAYOUT_VERSION,
    groups,
    other,
    targets,
  });

/** The layout's edits keep these as they were */
const extrasOf = (layout) => [layout?.targets, layout?.other || []];

/** The layout with new category targets (an empty object clears them) */
export function setTargets(layout, targets) {
  return layoutOf(layout?.groups || [], targets, layout?.other || []);
}

/**
 * The standard category (CATEGORY_DEFINITIONS) an asset belongs to
 * @param {object|string} item - a holding or an asset id
 * @returns {object|null}
 */
export function standardCategoryOf(item) {
  return CATEGORY_DEFINITIONS.find((cat) => cat.match(item)) || null;
}

/**
 * The layout group that stands for a standard category: the one built for it (`g_<key>`, kept
 * through renames), else the first with its icon
 * @param {object|null} layout
 * @param {string} categoryKey
 * @returns {object|null}
 */
export function groupForCategory(layout, categoryKey) {
  const groups = layout?.groups || [];
  if (!categoryKey) return null;
  return groups.find((g) => g.id === `g_${categoryKey}`) || groups.find((g) => g.icon === categoryKey) || null;
}

/**
 * The group an asset shows in under a custom layout: the group that lists it, else (unless the
 * user put it in «سایر») its standard category's group; null means «سایر»
 * @param {object|null} layout
 * @param {object|string} item - a holding or an asset id
 * @returns {string|null}
 */
export function resolveAssetGroupId(layout, item) {
  const key = getAssetKey(item);
  if (!key || !layout?.groups?.length) return null;
  const listed = layout.groups.find((g) => (g.items || []).includes(key));
  if (listed) return listed.id;
  if ((layout.other || []).includes(key)) return null;
  return groupForCategory(layout, standardCategoryOf(item)?.key)?.id || null;
}

/**
 * Where the user has placed an asset: the group that lists it, `'other'` when kept in «سایر», or
 * '' when it follows its standard category (the add form's category picker shows this)
 * @param {object|null} layout
 * @param {object|string} item
 * @returns {string}
 */
export function placementOf(layout, item) {
  const key = getAssetKey(item);
  if (!key) return '';
  const listed = (layout?.groups || []).find((g) => (g.items || []).includes(key));
  if (listed) return listed.id;
  return (layout?.other || []).includes(key) ? 'other' : '';
}

/**
 * Place an asset in the portfolio's custom layout: in a group, in «سایر» (`'other'`), or ('')
 * in its standard category's group, made (named for the category) when the layout has none —
 * so a newly added asset never falls into «سایر» just because its category had no group yet.
 * Without a custom layout nothing changes.
 * @param {object|null} layout
 * @param {object|string} item - the holding or its asset id
 * @param {string} [placement] - a group id, 'other', or '' (see placementOf)
 * @returns {object|null}
 */
export function placeAsset(layout, item, placement = '') {
  const key = getAssetKey(item);
  if (!key || !layout?.groups?.length) return layout;
  if (placement) return placementOf(layout, key) === placement ? layout : moveAsset(layout, key, placement);

  const [targets, other] = extrasOf(layout);
  const groups = layout.groups.map((g) => ({ ...g, items: (g.items || []).filter((id) => id !== key) }));
  const unlisted = other.filter((id) => id !== key);
  const category = standardCategoryOf(item);
  if (category && !groupForCategory(layout, category.key) && groups.length < PORTFOLIO_LAYOUT_LIMITS.groups) {
    groups.push({ id: `g_${category.key}`, title: category.name, icon: category.key, items: [key] });
  }
  return layoutOf(groups, targets, unlisted);
}

/**
 * Build default editable layout from current portfolio items matching CATEGORY_DEFINITIONS
 * @param {Array<object>} items
 * @returns {object}
 */
export function buildDefaultPortfolioLayout(items = [], targets = undefined) {
  const groups = [];
  const seenKeys = new Set();

  for (const cat of CATEGORY_DEFINITIONS) {
    const matchingItems = items.filter(cat.match);
    const catKeys = [];
    for (const item of matchingItems) {
      const key = getAssetKey(item);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        catKeys.push(key);
      }
    }
    if (catKeys.length > 0) {
      groups.push({
        id: `g_${cat.key}`,
        title: cat.name,
        icon: cat.key,
        items: catKeys,
      });
    }
  }

  // Items that match no standard category resolve to "سایر" on their own

  // If no items in portfolio, provide 3 clean default categories
  if (groups.length === 0) {
    groups.push(
      { id: 'g_gold', title: t('طلا و سکه'), icon: 'gold', items: [] },
      { id: 'g_currency', title: t('ارزها'), icon: 'currency', items: [] },
      { id: 'g_bourse', title: t('بورس و سهام'), icon: 'bourse', items: [] }
    );
  }

  return layoutOf(groups, targets);
}

/**
 * Group portfolio items by custom layout or fall back to standard CATEGORY_DEFINITIONS
 *
 * @param {Array<object>} itemsList - Normalized holding items with itemRealVal, itemCost, itemPnl
 * @param {object|null} layout - Sanitized portfolio layout
 * @param {string} filterQuery - Search query
 * @param {{ keepEmpty?: boolean }} options - If true, keeps empty groups (useful for edit mode)
 * @returns {Array<object>}
 */
export function buildCustomCategoryGroups(itemsList = [], layout = null, filterQuery = '', options = {}) {
  let itemsToGroup = itemsList || [];
  if (filterQuery && filterQuery.trim()) {
    const q = filterQuery.trim().toLowerCase();
    itemsToGroup = itemsToGroup.filter((it) => {
      const name = (it.assetName || it.name || '').toLowerCase();
      const id = (it.assetId || it.id || '').toLowerCase();
      const notes = (it.notes || '').toLowerCase();
      return name.includes(q) || id.includes(q) || notes.includes(q);
    });
  }

  // If no custom layout is active, use standard fixed categories
  if (!layout || !Array.isArray(layout.groups) || layout.groups.length === 0) {
    return CATEGORY_DEFINITIONS.map((cat) => {
      const groupItems = itemsToGroup.filter(cat.match);
      const costedGroupItems = groupItems.filter((it) => it.hasBuyPrice);
      const hasCostedItems = costedGroupItems.length > 0;
      const groupCost = costedGroupItems.reduce((acc, it) => acc + it.itemCost, 0);
      const groupRealVal = groupItems.reduce((acc, it) => acc + it.itemRealVal, 0);
      const groupPnl = costedGroupItems.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
      const groupPnlPct = groupCost > 0 ? parseFloat(((groupPnl / groupCost) * 100).toFixed(1)) : 0;
      return {
        ...cat,
        items: groupItems,
        totalCost: groupCost,
        totalRealValue: groupRealVal,
        totalPnl: hasCostedItems ? groupPnl : null,
        totalPnlPct: groupPnlPct,
        hasCostedItems,
      };
    }).filter((group) => options.keepEmpty || group.items.length > 0);
  }

  // Group by custom layout: each item in the one group it resolves to (null: «سایر»)
  const groupIdOf = new Map(itemsToGroup.map((it) => [it, resolveAssetGroupId(layout, it)]));
  const groups = [];

  for (const group of layout.groups) {
    const groupItems = itemsToGroup.filter((it) => groupIdOf.get(it) === group.id);

    const costedGroupItems = groupItems.filter((it) => it.hasBuyPrice);
    const hasCostedItems = costedGroupItems.length > 0;
    const groupCost = costedGroupItems.reduce((acc, it) => acc + it.itemCost, 0);
    const groupRealVal = groupItems.reduce((acc, it) => acc + it.itemRealVal, 0);
    const groupPnl = costedGroupItems.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
    const groupPnlPct = groupCost > 0 ? parseFloat(((groupPnl / groupCost) * 100).toFixed(1)) : 0;

    groups.push({
      key: group.id,
      id: group.id,
      name: group.title,
      title: group.title,
      icon: group.icon || 'custom',
      badge: group.title,
      items: groupItems,
      totalCost: groupCost,
      totalRealValue: groupRealVal,
      totalPnl: hasCostedItems ? groupPnl : null,
      totalPnlPct: groupPnlPct,
      hasCostedItems,
    });
  }

  // Items that resolve to no group go to "سایر" (Other)
  const uncategorizedItems = itemsToGroup.filter((it) => groupIdOf.get(it) === null);
  if (uncategorizedItems.length > 0 || (options.keepEmpty && layout.groups.length > 0)) {
    const costedOther = uncategorizedItems.filter((it) => it.hasBuyPrice);
    const hasCostedOther = costedOther.length > 0;
    const otherCost = costedOther.reduce((acc, it) => acc + it.itemCost, 0);
    const otherRealVal = uncategorizedItems.reduce((acc, it) => acc + it.itemRealVal, 0);
    const otherPnl = costedOther.reduce((acc, it) => acc + (it.itemPnl || 0), 0);
    const otherPnlPct = otherCost > 0 ? parseFloat(((otherPnl / otherCost) * 100).toFixed(1)) : 0;

    if (uncategorizedItems.length > 0 || options.keepEmpty) {
      groups.push({
        key: 'other',
        id: 'g_other',
        name: t('سایر'),
        title: t('سایر'),
        icon: 'custom',
        badge: t('سایر'),
        items: uncategorizedItems,
        totalCost: otherCost,
        totalRealValue: otherRealVal,
        totalPnl: hasCostedOther ? otherPnl : null,
        totalPnlPct: otherPnlPct,
        hasCostedItems: hasCostedOther,
        isOther: true,
      });
    }
  }

  return options.keepEmpty ? groups : groups.filter((g) => g.items.length > 0);
}

// ── Pure Edit Operations ─────────────────────────────────────────────────────

const mapGroup = (layout, groupId, fn) =>
  layoutOf(layout.groups.map((g) => (g.id === groupId ? fn(g) : g)), ...extrasOf(layout));

const move = (list, index, delta) => {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

const reorder = (list, fromIndex, toIndex) => {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

export function addGroup(layout, { title = t('دسته جدید'), icon = 'custom' } = {}) {
  const current = layoutOf(layout?.groups || [], ...extrasOf(layout));
  if (current.groups.length >= PORTFOLIO_LAYOUT_LIMITS.groups) return current;
  return layoutOf([...current.groups, { id: newGroupId(), title, icon, items: [] }], ...extrasOf(current));
}

export function removeGroup(layout, groupId) {
  const current = layoutOf(layout?.groups || [], ...extrasOf(layout));
  // Removing a group moves its items to "سایر" (kept there, not back in their standard category)
  const { [groupId]: _dropped, ...targets } = current.targets || {};
  const released = current.groups.find((g) => g.id === groupId)?.items || [];
  return layoutOf(current.groups.filter((g) => g.id !== groupId), targets, [...(current.other || []), ...released]);
}

export function updateGroup(layout, groupId, patch) {
  const current = layoutOf(layout?.groups || [], ...extrasOf(layout));
  return mapGroup(current, groupId, (g) => ({
    ...g,
    ...patch,
    id: g.id,
    items: g.items,
  }));
}

export function moveGroup(layout, groupId, delta) {
  const current = layoutOf(layout?.groups || [], ...extrasOf(layout));
  const index = current.groups.findIndex((g) => g.id === groupId);
  return layoutOf(move(current.groups, index, delta), ...extrasOf(current));
}

export function reorderGroups(layout, groupId, overId) {
  const current = layoutOf(layout?.groups || [], ...extrasOf(layout));
  const ids = current.groups.map((g) => g.id);
  return layoutOf(reorder(current.groups, ids.indexOf(groupId), ids.indexOf(overId)), ...extrasOf(current));
}

/**
 * Move an asset from whatever group it's currently in to targetGroupId.
 * If targetGroupId is 'other' or 'g_other' or null, it is removed from all groups and listed in
 * `other`, so it stays in "سایر" rather than going back to its standard category's group.
 */
export function moveAsset(layout, assetKey, targetGroupId) {
  const key = getAssetKey(assetKey);
  if (!key) return layout;
  const current = layoutOf(layout?.groups || [], ...extrasOf(layout));

  const groupsWithoutAsset = current.groups.map((g) => ({
    ...g,
    items: (g.items || []).filter((id) => id !== key),
  }));

  const otherWithoutAsset = (current.other || []).filter((id) => id !== key);
  if (!targetGroupId || targetGroupId === 'other' || targetGroupId === 'g_other') {
    return layoutOf(groupsWithoutAsset, current.targets, [...otherWithoutAsset, key]);
  }

  const updatedGroups = groupsWithoutAsset.map((g) => {
    if (g.id === targetGroupId) {
      if (g.items.includes(key) || g.items.length >= PORTFOLIO_LAYOUT_LIMITS.itemsPerGroup) {
        return g;
      }
      return { ...g, items: [...g.items, key] };
    }
    return g;
  });

  return layoutOf(updatedGroups, current.targets, otherWithoutAsset);
}

/**
 * Move an asset to where another sits in the same group. `shownKeys` is the group's assets as
 * shown (its listed ones, then those it takes by category), so the result lists them all in that order.
 */
export function reorderAsset(layout, groupId, assetKey, overKey, shownKeys = null) {
  const key = getAssetKey(assetKey);
  const over = getAssetKey(overKey);
  if (!key || !over) return layout;
  const current = layoutOf(layout?.groups || [], ...extrasOf(layout));

  return mapGroup(current, groupId, (g) => {
    // Listed assets not in the portfolio now keep their place after the shown ones
    const order = shownKeys
      ? [...shownKeys, ...(g.items || []).filter((id) => !shownKeys.includes(id))]
      : g.items || [];
    return { ...g, items: reorder(order, order.indexOf(key), order.indexOf(over)) };
  });
}

export const AVAILABLE_CATEGORY_ICONS = [
  { id: 'gold', label: t('طلا') },
  { id: 'coin', label: t('سکه') },
  { id: 'silver', label: t('نقره') },
  { id: 'currency', label: t('ارز') },
  { id: 'crypto', label: t('رمزارز') },
  { id: 'bourse', label: t('بورس') },
  { id: 'bourse_fund', label: t('صندوق') },
  { id: 'wallet', label: t('کیف پول') },
  { id: 'custom', label: t('سفارشی') },
  { id: 'sparkles', label: t('ویژه') },
];
