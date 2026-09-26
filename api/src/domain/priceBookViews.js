/**
 * priceBookViews.js — Everything else the app shows about prices, read off the price book
 *
 * The book (priceBook.js) is the only place a price is decided. The header's reference rates, the
 * calculator's live base rates and the older response shapes (/api/prices, /api/market/items,
 * kept for clients that haven't updated yet) are views of it, so they can never disagree with it.
 * Pure: no I/O. Shared with the web app.
 */

import { BASE_PRICE_IDS, normalizePriceId } from "./priceBook.js";
import { getReferenceRatesSpecs } from "../config/sources.config.js";

const positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The live rates the calculator starts from
 * @param {{ items?: Record<string, object> }|null} book
 * @returns {{ usdToman: number, goldUsd: number, silverUsd: number }}
 */
export function baseRatesOf(book) {
  const items = book?.items || {};
  return {
    usdToman: positive(items[BASE_PRICE_IDS.usd]?.price),
    goldUsd: positive(items[BASE_PRICE_IDS.goldOunce]?.params?.usd),
    silverUsd: positive(items[BASE_PRICE_IDS.silverOunce]?.params?.usd),
  };
}

/**
 * The reference rates (dollar, tether, …) the header switches between, each at its book price
 * @param {{ items?: Record<string, object> }|null} book
 * @returns {Array<{ key: string, label: string, shortLabel: string, symbol: string, pulseColor: string,
 *   price: number, datetime: string|null, sourceId: string|null }>}
 */
export function referenceRatesOf(book) {
  const items = book?.items || {};
  return getReferenceRatesSpecs()
    .map((spec) => {
      const item = items[normalizePriceId(spec.key)];
      return {
        ...spec,
        price: positive(item?.price),
        datetime: item?.updatedAt || null,
        sourceId: item?.sourceId || spec.sourceId || null,
      };
    })
    .filter((rate) => rate.price > 0);
}

/**
 * The book in the shape /api/prices used to return (`{ [id]: { price, datetime, … } }`): dollar
 * quoted items keep their dollar value there (the ounce in dollars, a currency as its rate against
 * the dollar), as older clients expect.
 * @param {{ items?: Record<string, object> }|null} book
 */
export function legacyPricesOf(book) {
  const out = { last_updated: book?.updatedAt || null };
  for (const item of Object.values(book?.items || {})) {
    if (item.sourceId === null && item.params?.derived) continue;
    const p = item.params || {};
    out[item.id] = {
      price: p.usd ?? p.usdCross ?? item.price,
      ...(p.usdCross !== undefined ? { usdCrossRate: p.usdCross } : {}),
      priceToman: item.price,
      datetime: item.updatedAt,
      // The source's name, as latest_rates had it
      label: p.sourceName || item.name,
      sourceId: item.sourceId,
      isPrimary: true,
      showOnHomePage: !p.hideOnHome,
    };
  }
  if (out.usd) out.usd_toman = out.usd;
  out.reference_rates = referenceRatesOf(book);
  return out;
}

/**
 * Currency rates against the dollar ({ EUR: 1.08, … }), as /api/prices used to return them
 * @param {{ items?: Record<string, object> }|null} book
 */
export function forexCrossRatesOf(book) {
  const out = {};
  for (const item of Object.values(book?.items || {})) {
    if (item.params?.usdCross !== undefined) out[item.id.toUpperCase()] = item.params.usdCross;
  }
  return out;
}
