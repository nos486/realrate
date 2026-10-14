/**
 * priceBookAssets.js — The price book (GET /api/prices/book) as the app's list of assets
 *
 * Prices are never computed here: every price is the book's (tomans, one id per item, see
 * utils/priceBook.js). This only adds what screens show next to a price — flag, badge, search
 * aliases, a one-line description — from the asset specs, and indexes the list by id.
 * A dollar-priced asset keeps `currency: "usd"` and `priceUsd` (its own price, assetPrice.js).
 */

import { intlLocale, t } from '../../utils/i18n.js';
import { SPEC_BY_ID } from '../../utils/priceBook.js';
import { toPriceId } from '../../utils/priceIds.js';
import { CATEGORY_MAP } from '../../config/categories.config.js';
import { currencyOf } from '../../utils/priceBook.js';

const fa = (n, digits = 0) => Number(n).toLocaleString(intlLocale(), { maximumFractionDigits: digits });

/** The line under an asset's name: where its price comes from */
function describe(item) {
  const p = item.params || {};
  if (p.usdCross !== undefined) return t('بر مبنای دلار ({rate} $)', { rate: fa(p.usdCross, 4) });
  // A dollar-priced asset shows its dollar price; the line under it is the toman equivalent
  if (currencyOf(item) === 'usd') return t('≈ {price} تومان', { price: fa(item.price) });
  if (p.usd !== undefined) return t('{price} دلار', { price: fa(p.usd, 2) });
  // A coin's bubble (tgju): its percent of the coin's gold value
  if (p.bubbleOf && p.bubblePct !== undefined) return t('{pct}٪ بالاتر از ارزش طلای سکه', { pct: fa(p.bubblePct, 1) });
  if (p.derived === 'intrinsic') return t('ارزش ذاتی (محاسبه از انس و دلار)');
  if (p.symbol) return p.sourceName ? t('نماد: {symbol} • {source}', { symbol: p.symbol, source: p.sourceName }) : t('نماد: {symbol}', { symbol: p.symbol });
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
    ...(isFund && symbol ? [`صندوق ${symbol}`] : []), // i18n-ignore
  ].filter(Boolean))];
  return {
    ...item,
    currency: currencyOf(item),
    priceUsd: currencyOf(item) === 'usd' ? Number(item.priceUsd) || null : null,
    code: spec?.code || '',
    symbol,
    flag: spec?.flag || '',
    badge: CATEGORY_MAP[item.category]?.badge || spec?.badge || t('دارایی'),
    isFund,
    sourceName: p.sourceName || '',
    changePercent: p.changePercent ?? null,
    intrinsicPrice: p.intrinsic ?? null,
    bubblePct: p.bubblePct ?? null,
    // Its source hasn't synced for a while (or it is computed from a stale dollar/ounce)
    stale: Boolean(p.stale),
    staleSince: p.staleSince || null,
    subText: describe(item),
    aliases,
    searchText: aliases.join(' ').toLowerCase(),
  };
}

/**
 * An item's asset, built once per item object: the catalog (thousands of exchange symbols and funds)
 * is kept between refreshes, so each refresh rebuilds only the core items that were just downloaded.
 * The same object also keeps its search index (pricingEngine.js) and keeps screens' memoized rows valid.
 */
const assetOfItem = new WeakMap();
function cachedAsset(item) {
  let asset = assetOfItem.get(item);
  if (!asset) {
    asset = toAsset(item);
    assetOfItem.set(item, asset);
  }
  return asset;
}

/**
 * The whole book as assets
 * @param {{ items?: Record<string, object> }|null} book
 * @returns {{ assets: object[], priceMap: Record<string, number>, itemMap: Record<string, object> }}
 */
export function bookToAssets(book) {
  const assets = Object.values(book?.items || {}).map(cachedAsset);
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
