/**
 * homeAssets.js — Turn a layout's asset id into what a home card shows, for ANY market asset
 * (gold, coin, currency, crypto, bourse symbol, fund, ...).
 */

/**
 * Lookup tables built once per data refresh
 * @param {{ assets?: object[], itemMap?: object, analysis?: object[], currencies?: object[] }} data
 */
export function buildAssetIndex({ assets = [], itemMap = {}, analysis = [], currencies = [] }) {
  const byId = new Map();
  for (const asset of assets) {
    if (asset?.id && !byId.has(asset.id)) byId.set(asset.id, asset);
  }
  return {
    byId,
    itemMap: itemMap || {},
    analysisById: new Map((analysis || []).map((a) => [a.id, a])),
    currencyByCode: new Map((currencies || []).filter((c) => c.code).map((c) => [String(c.code).toUpperCase(), c])),
  };
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @returns {{ id: string, found: boolean, name?: string, code?: string, flag?: string,
 *   category?: string, badge?: string, price?: number|null, unit?: string, note?: string,
 *   sourceName?: string, changePercent?: number|null, analysis?: object|null, searchText?: string }}
 */
export function resolveHomeAsset(id, index) {
  const asset = index.byId.get(id) || index.itemMap[id] || index.itemMap[String(id).toLowerCase()] || null;
  const analysis = index.analysisById.get(id) || null;
  const code = String(asset?.code || asset?.symbol || '').toUpperCase();
  const currency = (code && index.currencyByCode.get(code)) || index.currencyByCode.get(String(id).toUpperCase()) || null;

  if (!asset && !analysis && !currency) return { id, found: false };

  const base = asset || currency || analysis;
  let price = num(asset?.price);
  let unit = asset?.unit || 'تومان';
  if (currency) {
    // Same pricing the currency list always used (some quotes are shown in dollars)
    unit = currency.unit || unit;
    price = num(unit === 'دلار' ? (currency.usd_price || currency.price) : (currency.toman_price || currency.price)) ?? price;
  }
  if (analysis && num(analysis.market) !== null) price = num(analysis.market);

  const name = analysis?.name || currency?.name || base.name || id;
  return {
    id,
    found: true,
    name,
    code: code || (currency?.code ? String(currency.code) : ''),
    flag: currency?.flag || asset?.flag || '',
    category: asset?.category || (currency ? 'currency' : analysis ? 'gold' : ''),
    badge: asset?.badge || '',
    price,
    unit,
    note: currency?.note || currency?.subPriceText || asset?.subText || '',
    subPriceText: currency?.subPriceText || '',
    sourceName: asset?.sourceName || '',
    changePercent: num(asset?.changePercent ?? asset?.cp),
    analysis,
    searchText: [name, code, asset?.symbol, ...(asset?.aliases || [])].filter(Boolean).join(' ').toLowerCase(),
  };
}
