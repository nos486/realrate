/**
 * knownPriceIds.js — The price book's ids, for code outside React (the vault's migration of
 * stored ids). Set by PricingContext whenever the book loads; null until then.
 */

let known = null;

/** @param {Record<string, number>|null} priceMap - the book's prices by id */
export function setKnownPriceIds(priceMap) {
  known = priceMap && Object.keys(priceMap).length > 0 ? priceMap : known;
}

/** @returns {Record<string, number>|null} */
export function getKnownPriceIds() {
  return known;
}
