/**
 * assetPrice.js — An asset's own price: the number a screen shows as the asset's price
 *
 * The price book keeps every price in tomans (`price`), and says what an asset is priced in on
 * its own market (`currency`, priceBook.js): a dollar-priced asset (the world ounce, oil,
 * bitcoin) has `currency: "usd"` and its dollar price `priceUsd`. Screens show that one first
 * ("$2,650.40 / اونس", "≈ 310,000,000 تومان" under it) — never the ounce as a toman price that
 * moved only because the dollar did. Totals (a portfolio's value) stay in tomans: `price`.
 */

/** Whether an asset is priced in dollars */
export const isUsdPriced = (asset) => asset?.currency === 'usd' && Number(asset?.priceUsd) > 0;

/**
 * The asset's own price
 * @param {{ price?: number, currency?: string, priceUsd?: number }} asset - a price book item / asset
 * @returns {{ value: number|null, currency: 'usd'|'toman', unit: string, toman: number|null }}
 */
export function ownPriceOf(asset) {
  const toman = Number(asset?.price) > 0 ? Number(asset.price) : null;
  if (isUsdPriced(asset)) return { value: Number(asset.priceUsd), currency: 'usd', unit: 'دلار', toman };
  return { value: toman, currency: 'toman', unit: 'تومان', toman };
}

/**
 * A price in its currency, in Persian digits: dollars with their cents (four significant digits
 * under one dollar), tomans whole from 100 up (four significant digits below, so 0.37 stays 0.37)
 * @param {number|null|undefined} value
 * @param {'usd'|'toman'} [currency]
 */
export function formatPrice(value, currency = 'toman') {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return '-';
  if (currency === 'usd') {
    return Math.abs(n) >= 1
      ? n.toLocaleString('fa-IR', { minimumFractionDigits: n >= 1000 ? 0 : 2, maximumFractionDigits: 2 })
      : n.toLocaleString('fa-IR', { maximumSignificantDigits: 4 });
  }
  if (Math.abs(n) > 0 && Math.abs(n) < 100) return n.toLocaleString('fa-IR', { maximumSignificantDigits: 4 });
  return Math.round(n).toLocaleString('fa-IR');
}

/** "≈ 310,000,000 تومان": a dollar-priced asset's toman price, for the line under its price */
export const tomanEquivalent = (asset) =>
  (isUsdPriced(asset) && Number(asset.price) > 0 ? `≈ ${formatPrice(asset.price)} تومان` : '');
