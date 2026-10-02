/**
 * portfolioLayoutModel.js — Default portfolio layout, category definitions and pure edit operations
 *
 * A portfolio layout is `{ version, groups: [{ id, title, icon, items: [assetKey] }], targets? }`
 * (validated by utils/portfolioLayout.js, shared with the API). `targets` (the share each category
 * aims for, utils/allocationTargets.js) rides along every edit below.
 * Every operation returns a new layout without mutating input.
 */

import {
  sanitizePortfolioLayout,
  PORTFOLIO_LAYOUT_VERSION,
  PORTFOLIO_LAYOUT_LIMITS,
} from '../../utils/portfolioLayout.js';
import { toPriceId, isCustomAssetId } from '../../utils/priceIds.js';
import { CATEGORY_DEFINITIONS } from './utils/holdingHelpers.js';

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
    targets: layout.targets,
  });
}

/**
 * Helper to ensure a sanitized layout (keeping the targets it had)
 */
const layoutOf = (groups, targets) =>
  normalizePortfolioLayout({
    version: PORTFOLIO_LAYOUT_VERSION,
    groups,
    targets,
  });

/** The layout with new category targets (an empty object clears them) */
export function setTargets(layout, targets) {
  return layoutOf(layout?.groups || [], targets);
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

  // Leftover items that didn't match any standard category
  const leftoverKeys = [];
  for (const item of items) {
    const key = getAssetKey(item);
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      leftoverKeys.push(key);
    }
  }
  if (leftoverKeys.length > 0) {
    groups.push({
      id: 'g_other',
      title: 'سایر',
      icon: 'custom',
      items: leftoverKeys,
    });
  }

  // If no items in portfolio, provide 3 clean default categories
  if (groups.length === 0) {
    groups.push(
      { id: 'g_gold', title: 'طلا و سکه', icon: 'gold', items: [] },
      { id: 'g_currency', title: 'ارزها', icon: 'currency', items: [] },
      { id: 'g_bourse', title: 'بورس و سهام', icon: 'bourse', items: [] }
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

  // Group by custom layout
  const claimedKeys = new Set();
  const groups = [];

  for (const group of layout.groups) {
    const groupItemKeys = new Set(group.items || []);
    // Items that belong to this group and haven't been claimed yet
    const groupItems = itemsToGroup.filter((it) => {
      const key = getAssetKey(it);
      if (groupItemKeys.has(key) && !claimedKeys.has(key)) {
        return true;
      }
      return false;
    });

    for (const it of groupItems) {
      claimedKeys.add(getAssetKey(it));
    }

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

  // Any items that were not claimed by any custom group go to "سایر" (Other)
  const uncategorizedItems = itemsToGroup.filter((it) => !claimedKeys.has(getAssetKey(it)));
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
        name: 'سایر',
        title: 'سایر',
        icon: 'custom',
        badge: 'سایر',
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
  layoutOf(layout.groups.map((g) => (g.id === groupId ? fn(g) : g)), layout.targets);

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

export function addGroup(layout, { title = 'دسته جدید', icon = 'custom' } = {}) {
  const current = layoutOf(layout?.groups || [], layout?.targets);
  if (current.groups.length >= PORTFOLIO_LAYOUT_LIMITS.groups) return current;
  return layoutOf([...current.groups, { id: newGroupId(), title, icon, items: [] }], current.targets);
}

export function removeGroup(layout, groupId) {
  const current = layoutOf(layout?.groups || [], layout?.targets);
  // Removing group releases its items; they will naturally fall into "سایر"
  const { [groupId]: _dropped, ...targets } = current.targets || {};
  return layoutOf(current.groups.filter((g) => g.id !== groupId), targets);
}

export function updateGroup(layout, groupId, patch) {
  const current = layoutOf(layout?.groups || [], layout?.targets);
  return mapGroup(current, groupId, (g) => ({
    ...g,
    ...patch,
    id: g.id,
    items: g.items,
  }));
}

export function moveGroup(layout, groupId, delta) {
  const current = layoutOf(layout?.groups || [], layout?.targets);
  const index = current.groups.findIndex((g) => g.id === groupId);
  return layoutOf(move(current.groups, index, delta), current.targets);
}

export function reorderGroups(layout, groupId, overId) {
  const current = layoutOf(layout?.groups || [], layout?.targets);
  const ids = current.groups.map((g) => g.id);
  return layoutOf(reorder(current.groups, ids.indexOf(groupId), ids.indexOf(overId)), current.targets);
}

/**
 * Move an asset from whatever group it's currently in to targetGroupId.
 * If targetGroupId is 'other' or 'g_other' or null, it is simply removed from all groups,
 * causing it to be placed in the "سایر" group automatically.
 */
export function moveAsset(layout, assetKey, targetGroupId) {
  const key = getAssetKey(assetKey);
  if (!key) return layout;
  const current = layoutOf(layout?.groups || [], layout?.targets);

  const groupsWithoutAsset = current.groups.map((g) => ({
    ...g,
    items: (g.items || []).filter((id) => id !== key),
  }));

  if (!targetGroupId || targetGroupId === 'other' || targetGroupId === 'g_other') {
    return layoutOf(groupsWithoutAsset, current.targets);
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

  return layoutOf(updatedGroups, current.targets);
}

export function reorderAsset(layout, groupId, assetKey, overKey) {
  const key = getAssetKey(assetKey);
  const over = getAssetKey(overKey);
  if (!key || !over) return layout;
  const current = layoutOf(layout?.groups || [], layout?.targets);

  return mapGroup(current, groupId, (g) => ({
    ...g,
    items: reorder(g.items || [], (g.items || []).indexOf(key), (g.items || []).indexOf(over)),
  }));
}

export const AVAILABLE_CATEGORY_ICONS = [
  { id: 'gold', label: 'طلا' },
  { id: 'coin', label: 'سکه' },
  { id: 'silver', label: 'نقره' },
  { id: 'currency', label: 'ارز' },
  { id: 'crypto', label: 'رمزارز' },
  { id: 'bourse', label: 'بورس' },
  { id: 'bourse_fund', label: 'صندوق' },
  { id: 'wallet', label: 'کیف پول' },
  { id: 'custom', label: 'سفارشی' },
  { id: 'sparkles', label: 'ویژه' },
];
