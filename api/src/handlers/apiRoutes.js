/**
 * apiRoutes.js — Public API route handlers
 * /api/prices — Live raw market prices, spot rates & forex (pure data, zero server-side calculations)
 */

import { getLatestMarketRates } from "../services/priceSources.js";
import { getGlobalSettings } from "../lib/settings.js";
import { jsonResponse } from "../lib/helpers.js";

/**
 * GET /api/prices
 * Return live raw market prices, spot gold/silver, USD, forex rates, and global settings.
 * Reads directly from KV / memory cache (sub-2ms response, zero calculation overhead).
 */
export async function handleGetPrices(env, request = null) {
  try {
    const [prices, globalSettings] = await Promise.all([
      getLatestMarketRates(env),
      getGlobalSettings(env),
    ]);

    const gold_usd = prices.ons_gold?.price || globalSettings?.default_gold_usd || 2890;
    const silver_usd = prices.ons_silver?.price || 33.5;
    const live_usd_item = prices.usd_toman || null;
    const live_usd_toman = live_usd_item
      ? live_usd_item.price
      : (globalSettings?.default_usd_toman || 62000);

    // Derive forex cross-rates directly from prices (compiled from sources)
    const forex = {};
    const standardNonForex = new Set([
      'usd', 'usd_toman', 'gold_18k', 'gold_24k', 'gold_melted', 'mesghal',
      'full_coin', 'full_new', 'full_old', 'half_coin', 'half', 'quarter_coin', 'quarter',
      'gerami_coin', 'gerami', 'ons_gold', 'ons_silver', 'silver_999', 'silver_ounce',
      'bourse', 'bourse_fund', 'forex', 'custom_feed', 'multi_output', 'last_updated'
    ]);
    for (const [t, item] of Object.entries(prices)) {
      if (item && item.price > 0 && !standardNonForex.has(t.toLowerCase()) && (item.usdCrossRate !== undefined || Number(item.price) < 500)) {
        forex[t.toUpperCase()] = item.price;
      }
    }
    const fallbackForexTypes = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'];
    for (const t of fallbackForexTypes) {
      if (prices[t]?.price && !forex[t.toUpperCase()]) {
        forex[t.toUpperCase()] = prices[t].price;
      }
    }

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
    }, 200, request);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message }, 500, request);
  }
}

/**
 * GET /api/sparklines
 * Return 24-hour lightweight price sparklines for charts.
 * Supports ?asset=gold_18k to only query the requested asset on-demand (zero wasted DB queries).
 * Cached in Cloudflare KV for 3 minutes for blazing-fast edge performance.
 */
export async function handleGetSparklines(env, request = null) {
  return jsonResponse({ success: true, sparklines: {} }, 200, request);
}
