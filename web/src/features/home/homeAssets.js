/**
 * homeAssets.js — Turn a layout's asset id into what a home card shows, for ANY market asset
 * (gold, coin, currency, crypto, bourse symbol, fund, ...).
 *
 * The price is always the price book's (tomans, the same number everywhere). Gold and coins also
 * carry the calculator's analysis (intrinsic value and bubble at the rates the user entered).
 * A dollar-priced asset (the ounce, oil) shows its dollar price, or — when its card is set to
 * "toman" in the layout — its toman price, with the toman day range, change and chart.
 */

import { assetOf } from '../market/priceBookAssets.js';
import { ownPriceOf, formatPrice } from '../market/assetPrice.js';
import { usdSeriesKey } from '../../utils/priceBook.js';

/**
 * Lookup tables built once per data refresh
 * @param {{ itemMap?: object, analysis?: object[] }} data
 */
export function buildAssetIndex({ itemMap = {}, analysis = [] }) {
  return {
    itemMap: itemMap || {},
    analysisById: new Map((analysis || []).map((a) => [String(a.id).toLowerCase(), a])),
  };
}

const tehranDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Today's low / high / first price from the book (only when they are today's, Tehran time)
 * @param {object} params - the item's params
 * @param {object} [range] - where the range is: the params themselves, or a dollar-priced
 *   asset's toman range (`params.toman`)
 */
function dayRangeOf(params, range = params, today = tehranDayFormat.format(new Date())) {
  if (!params || !range || params.day !== today) return null;
  const low = Number(range.dayLow);
  const high = Number(range.dayHigh);
  if (!(low > 0) || !(high > 0)) return null;
  return { low, high, open: Number(range.dayOpen) || null };
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @returns {{ id: string, found: boolean, name?: string, code?: string, flag?: string,
 *   category?: string, badge?: string, price?: number|null, unit?: string, perUnit?: string,
 *   note?: string, sourceName?: string, changePercent?: number|null, stale?: boolean,
 *   staleSince?: string|null, analysis?: object|null, dayRange?: { low: number, high: number, open: number|null }|null,
 *   searchText?: string, usdPriced?: boolean, display?: 'usd'|'toman'|null }}
 * @param {string} id
 * @param {object} index - buildAssetIndex()
 * @param {'usd'|'toman'} [display] - how the card shows a dollar-priced asset (the layout's)
 */
export function resolveHomeAsset(id, index, display) {
  const asset = assetOf(index.itemMap, id);
  if (!asset) return { id, found: false };
  const analysis = index.analysisById.get(asset.id) || null;
  // Its own price: a dollar-priced asset (the ounce, oil) in dollars, the rest in tomans
  const own = ownPriceOf(asset);
  const usdPriced = own.currency === 'usd';
  const base = {
    id: asset.id,
    found: true,
    name: asset.name,
    code: String(asset.code || asset.symbol || '').toUpperCase(),
    flag: asset.flag || '',
    category: asset.category || '',
    badge: asset.badge || '',
    price: num(own.value),
    currency: own.currency,
    // تومان, or دلار for a dollar-priced asset; `perUnit` is what one unit is (گرم, اونس, بشکه, …)
    unit: own.unit,
    perUnit: asset.unit || '',
    // The history its chart reads: a dollar-priced asset's dollar closes (`${id}@usd`)
    seriesId: own.currency === 'usd' ? usdSeriesKey(asset.id) : asset.id,
    note: asset.subText || '',
    sourceName: asset.sourceName || '',
    changePercent: num(asset.changePercent),
    stale: Boolean(asset.stale),
    staleSince: asset.staleSince || asset.updatedAt || null,
    analysis,
    dayRange: dayRangeOf(asset.params),
    searchText: asset.searchText || String(asset.name || '').toLowerCase(),
    // A dollar-priced asset's card can be set to show it in tomans (the layout's `display`)
    usdPriced,
    display: usdPriced ? 'usd' : null,
  };
  if (!usdPriced || display !== 'toman' || !(own.toman > 0)) return base;
  // In tomans: the toman price large, the dollar one under it; the toman range, change
  // (`params.toman`, kept by the sync) and history (the item's own id)
  const toman = asset.params?.toman || null;
  return {
    ...base,
    display: 'toman',
    price: own.toman,
    currency: 'toman',
    unit: 'تومان',
    seriesId: asset.id,
    note: `≈ ${formatPrice(own.value, 'usd')} دلار`,
    changePercent: num(toman?.changePercent),
    dayRange: dayRangeOf(asset.params, toman),
  };
}
