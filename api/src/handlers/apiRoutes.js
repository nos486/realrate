/**
 * apiRoutes.js — Public API route handlers
 * /api/prices — Live raw market prices, spot rates & forex (pure data, zero server-side calculations)
 */

import { getLatestMarketRates } from "../services/priceSources.js";
import { fetchForexRates } from "../services/forexRates.js";
import { jsonResponse } from "../lib/helpers.js";

/**
 * GET /api/prices
 * Return live raw market prices, spot gold/silver, USD, forex rates, and global settings.
 * Reads directly from KV / memory cache (sub-2ms response, zero calculation overhead).
 */
export async function handleGetPrices(env, analytics, globalSettings, request = null) {
  try {
    const [prices, forex] = await Promise.all([
      getLatestMarketRates(env),
      fetchForexRates(env),
    ]);

    const gold_usd = prices.ons_gold?.price || globalSettings?.default_gold_usd || 2890;
    const silver_usd = prices.ons_silver?.price || 33.5;
    const live_usd_item = prices.usd_toman || null;
    const live_usd_toman = live_usd_item
      ? live_usd_item.price
      : (globalSettings?.default_usd_toman || 62000);

    return jsonResponse({
      success: true,
      prices,
      market_prices: prices,
      gold_usd,
      silver_usd,
      live_usd_toman,
      live_usd_item,
      forex,
      globalSettings,
      analytics,
    }, 200, request);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500, request);
  }
}
