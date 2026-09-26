/**
 * priceBookAssets.js — The price book (GET /api/prices/book) as the app's list of assets
 *
 * Prices are never computed here: every price is the book's (tomans, one id per item, see
 * utils/priceBook.js). This only adds what screens show next to a price — flag, badge, search
 * aliases, a one-line description — from the asset specs, and indexes the list by id.
 */

import { SPEC_BY_ID } from '../../utils/priceBook.js';
import { toPriceId } from '../../utils/priceIds.js';
import { CATEGORY_MAP } from '../../config/categories.config.js';

const fa = (n, digits = 0) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: digits });

/** The line under an asset's name: where its price comes from */
function describe(item) {
  const p = item.params || {};
  if (p.usdCross !== undefined) return `بر مبنای دلار (${fa(p.usdCross, 4)} $)`;
  if (p.usd !== undefined) return `${fa(p.usd, 2)} دلار`;
  if (p.derived === 'intrinsic') return 'ارزش ذاتی (محاسبه از انس و دلار)';
  if (p.symbol) return p.sourceName ? `نماد: ${p.symbol} • ${p.sourceName}` : `نماد: ${p.symbol}`;
  return p.sourceName || '';
}

/**
 * One book item with what screens show next to its price
 * @param {object} item - a price book item
 */
export function toAsset(item) {
  const spec = SPEC_BY_ID.get(item.id) || null;
  const p = item.params || {};
  const symbol = p.symbol || spec?.symbol || spec?.code || '';
  const isFund = item.category === 'bourse_fund' || Boolean(p.isFund);
  const aliases = [...new Set([
    ...(spec?.aliases || []),
    item.name,
    symbol,
    spec?.code,
    ...(isFund && symbol ? [`صندوق ${symbol}`] : []),
  ].filter(Boolean))];
  return {
    ...item,
    code: spec?.code || '',
    symbol,
    flag: spec?.flag || '',
    badge: CATEGORY_MAP[item.category]?.badge || spec?.badge || 'دارایی',
    isFund,
    sourceName: p.sourceName || '',
    changePercent: p.changePercent ?? null,
    intrinsicPrice: p.intrinsic ?? null,
    bubblePct: p.bubblePct ?? null,
    subText: describe(item),
    aliases,
    searchText: aliases.join(' ').toLowerCase(),
  };
}

/**
 * The whole book as assets
 * @param {{ items?: Record<string, object> }|null} book
 * @returns {{ assets: object[], priceMap: Record<string, number>, itemMap: Record<string, object> }}
 */
export function bookToAssets(book) {
  const assets = Object.values(book?.items || {}).map(toAsset);
  const priceMap = {};
  const itemMap = {};
  for (const asset of assets) {
    priceMap[asset.id] = asset.price;
    itemMap[asset.id] = asset;
  }
  return { assets, priceMap, itemMap };
}

/** The price of any stored id (old forms included), or 0 */
export const priceOf = (priceMap, id) => (id ? priceMap?.[toPriceId(id, priceMap)] || 0 : 0);

/** The asset of any stored id (old forms included), or null */
export const assetOf = (itemMap, id) => (id ? itemMap?.[toPriceId(id, itemMap)] || null : null);
