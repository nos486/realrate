/**
 * homeAssets.js — Turn a layout's asset id into what a home card shows, for ANY market asset
 * (gold, coin, currency, crypto, bourse symbol, fund, ...).
 *
 * The price is always the price book's (tomans, the same number everywhere). Gold and coins also
 * carry the calculator's analysis (intrinsic value and bubble at the rates the user entered).
 */

import { assetOf } from '../market/priceBookAssets.js';

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

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @returns {{ id: string, found: boolean, name?: string, code?: string, flag?: string,
 *   category?: string, badge?: string, price?: number|null, unit?: string, perUnit?: string,
 *   note?: string, sourceName?: string, changePercent?: number|null, analysis?: object|null,
 *   searchText?: string }}
 */
export function resolveHomeAsset(id, index) {
  const asset = assetOf(index.itemMap, id);
  if (!asset) return { id, found: false };
  const analysis = index.analysisById.get(asset.id) || null;
  return {
    id: asset.id,
    found: true,
    name: asset.name,
    code: String(asset.code || asset.symbol || '').toUpperCase(),
    flag: asset.flag || '',
    category: asset.category || '',
    badge: asset.badge || '',
    price: num(asset.price),
    // Every book price is in tomans; `perUnit` is what one unit is (گرم, عدد, یورو, …)
    unit: 'تومان',
    perUnit: asset.unit || '',
    note: asset.subText || '',
    sourceName: asset.sourceName || '',
    changePercent: num(asset.changePercent),
    analysis,
    searchText: asset.searchText || String(asset.name || '').toLowerCase(),
  };
}
