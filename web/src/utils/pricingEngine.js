/**
 * pricingEngine.js — Searching the app's assets
 *
 * Prices are not computed here (or anywhere in the browser): every price comes from the
 * server's price book (features/market/priceBookAssets.js). This ranks assets for a search.
 */

/** Persian text in a form that compares equal however it was typed */
export function normalizePersianText(str) {
  if (!str) return '';
  return String(str)
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '') // zero-width
    .replace(/[ي]/g, 'ی') // i18n-ignore
    .replace(/[ك]/g, 'ک') // i18n-ignore
    .replace(/[آأإ]/g, 'ا') // i18n-ignore
    .replace(/[ة]/g, 'ه') // i18n-ignore
    .trim()
    .toLowerCase();
}

/**
 * What a search compares an asset with, normalized once per asset object (a keystroke then only
 * normalizes the query, not every name, symbol and alias again)
 */
const searchIndex = new WeakMap();
function indexOf(item) {
  let entry = searchIndex.get(item);
  if (!entry) {
    entry = {
      name: normalizePersianText(item.name || ''),
      sym: normalizePersianText(item.symbol || item.code || ''),
      code: (item.code || item.symbol || '').toUpperCase(),
      aliases: Array.isArray(item.aliases) ? item.aliases.map(normalizePersianText) : [],
    };
    searchIndex.set(item, entry);
  }
  return entry;
}

/**
 * Filter and rank resolved assets by query string
 *
 * @param {Array} assets
 * @param {string} query
 * @param {object} [options]
 * @returns {Array}
 */
export function searchUnifiedAssets(assets = [], query = '', options = {}) {
  const { category = '', limit = 50 } = options;
  if (!Array.isArray(assets)) return [];

  const cleanQ = normalizePersianText(query);
  const qUpper = query.trim().toUpperCase();

  let filtered = assets;

  // Filter by category if specified
  if (category) {
    if (category === 'gold_coin') {
      filtered = filtered.filter(a => a.category === 'gold' || a.category === 'coin');
    } else {
      filtered = filtered.filter(a => a.category === category);
    }
  }

  if (!cleanQ) {
    return filtered.slice(0, limit);
  }

  // Score items for ranking
  const scored = [];

  for (const item of filtered) {
    const { name: normName, sym: normSym, code, aliases } = indexOf(item);

    let score = 0;

    // Exact symbol / code match (highest priority)
    if (code === qUpper || normSym === cleanQ) {
      score += 1000;
    } else if (code.startsWith(qUpper) || normSym.startsWith(cleanQ)) {
      score += 500;
    } else if (code.includes(qUpper) || normSym.includes(cleanQ)) {
      score += 300;
    }

    // Exact name match
    if (normName === cleanQ) {
      score += 800;
    } else if (normName.startsWith(cleanQ)) {
      score += 400;
    } else if (normName.includes(cleanQ)) {
      score += 200;
    }

    // Aliases match (e.g. سکه گرمی, لیر, یورو)
    if (aliases.length) {
      if (aliases.some(al => al === cleanQ)) {
        score += 600;
      } else if (aliases.some(al => al.includes(cleanQ))) {
        score += 150;
      }
    }

    if (score > 0) {
      scored.push({ item, score });
    }
  }

  // Sort descending by score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(s => s.item);
}
