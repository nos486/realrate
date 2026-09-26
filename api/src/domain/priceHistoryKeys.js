/**
 * priceHistoryKeys.js — Which key each app price is kept under in the price history
 *
 * The history is read by asset id (the same ids the home page and the market catalog use), so
 * prices are recorded under those ids, lower-cased:
 * - market rates by their rate key: usd, gold_18k, full_coin, ons_gold, ...
 * - currencies (other than USD) by their code, as a toman value (USD rate × cross rate) — the
 *   number their cards show, not the raw cross rate
 * - catalog items (bourse symbols, funds) by their catalog id: `${sourceId}__${symbol}`
 */

import { FOREX_SPECS } from "./specs/forex.spec.js";

/** The catalog id of an item: `${sourceId}__${symbol}` (a symbol may already carry the prefix) */
export function catalogAssetId(sourceId, symbol) {
  const sym = String(symbol ?? "").trim();
  if (!sourceId) return sym;
  return sym.startsWith(`${sourceId}__`) ? sym : `${sourceId}__${sym}`;
}

/** A catalog item's symbol, the same way the catalog reads it */
export function catalogItemSymbol(item) {
  return String(item?.id || item?.symbol || item?.s || item?.code || "").trim();
}

/**
 * Catalog items as history points
 * @param {string} sourceId
 * @param {Array<{ id?: string, symbol?: string, price: number }>} items
 * @returns {Array<{ id: string, price: number }>}
 */
export function catalogHistoryPoints(sourceId, items) {
  const points = [];
  for (const item of Array.isArray(items) ? items : []) {
    const symbol = catalogItemSymbol(item);
    if (symbol) points.push({ id: catalogAssetId(sourceId, symbol), price: item.price });
  }
  return points;
}

const positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The compiled market rates (latest_rates) as history points
 * @param {Record<string, { price: number }|string>} latestRates
 * @returns {Array<{ id: string, price: number }>}
 */
export function marketRateHistoryPoints(latestRates) {
  const rates = latestRates && typeof latestRates === "object" ? latestRates : {};
  const byKey = new Map();
  for (const [key, entry] of Object.entries(rates)) {
    const price = positive(entry?.price);
    if (price) byKey.set(key.toLowerCase(), price);
  }

  // Currencies: toman value from the USD rate, replacing the raw cross rate
  const usdToman = positive(rates.usd_toman?.price) || positive(rates.usd?.price);
  for (const spec of FOREX_SPECS) {
    const key = spec.code.toLowerCase();
    if (key === "usd") continue;
    const cross = positive(rates[key]?.price) || positive(rates[spec.code]?.price);
    if (!cross) continue;
    if (usdToman) byKey.set(key, Math.round(usdToman * cross));
    else byKey.delete(key);
  }

  return [...byKey].map(([id, price]) => ({ id, price }));
}
