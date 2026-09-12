/**
 * apiRoutes.js — Public API route handlers
 * /api/prices — Live raw market prices, spot rates & forex (pure data, zero server-side calculations)
 */

import { getLatestMarketRates } from "../services/priceSources.js";
import { getGlobalSettings } from "../lib/settings.js";
import { jsonResponse } from "../lib/helpers.js";
import { dbGet24hSparklines, dbGetHistoricalBenchmarks } from "../lib/db.js";

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
    const forexTypes = ['eur', 'try', 'aed', 'gbp', 'chf', 'cad', 'aud', 'cny'];
    for (const t of forexTypes) {
      if (prices[t]?.price) {
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
 * Return downsampled 24h price history for gold, coins, or USD to render lightweight charts.
 * Supports ?asset=gold_18k to only query the requested asset on-demand (zero wasted DB queries).
 * Cached in Cloudflare KV for 3 minutes for blazing-fast edge performance.
 */
export async function handleGetSparklines(env, request = null) {
  try {
    let targetAsset = null;
    if (request && request.url) {
      try {
        const url = new URL(request.url);
        targetAsset = url.searchParams.get("asset") || url.searchParams.get("priceType") || null;
      } catch (ignore) {}
    }

    const cacheKey = targetAsset ? `sparklines_24h_${targetAsset}` : "sparklines_24h";

    if (env?.REALRATE_KV) {
      try {
        const cached = await env.REALRATE_KV.get(cacheKey, "json");
        if (cached && typeof cached === "object") {
          return jsonResponse({ success: true, sparklines: cached, cached: true }, 200, request);
        }
      } catch (cacheErr) {
        console.warn("[Sparklines] KV read error:", cacheErr.message);
      }
    }

    const sparklines = await dbGet24hSparklines(env, targetAsset);

    if (env?.REALRATE_KV && sparklines) {
      env.REALRATE_KV.put(cacheKey, JSON.stringify(sparklines), { expirationTtl: 180 }).catch(() => {});
    }

    return jsonResponse({ success: true, sparklines, cached: false }, 200, request);
  } catch (err) {
    console.error("[Sparklines] Error:", err);
    return jsonResponse({ success: false, error: err.message }, 500, request);
  }
}

/**
 * Return historical price benchmarks for 24h, 7d, and 30d
 * Used to calculate portfolio profit percentage changes over these periods.
 * Cached in Cloudflare KV for 10 minutes (600s TTL).
 */
export async function handleGetHistoricalBenchmarks(env, request = null) {
  try {
    const cacheKey = "portfolio_benchmarks_24h_7d_30d";

    if (env?.REALRATE_KV) {
      try {
        const cached = await env.REALRATE_KV.get(cacheKey, "json");
        if (cached && typeof cached === "object") {
          return jsonResponse({ success: true, benchmarks: cached, cached: true }, 200, request);
        }
      } catch (cacheErr) {
        console.warn("[Benchmarks] KV read error:", cacheErr.message);
      }
    }

    const benchmarks = await dbGetHistoricalBenchmarks(env);

    if (env?.REALRATE_KV && benchmarks) {
      env.REALRATE_KV.put(cacheKey, JSON.stringify(benchmarks), { expirationTtl: 600 }).catch(() => {});
    }

    return jsonResponse({ success: true, benchmarks, cached: false }, 200, request);
  } catch (err) {
    console.error("[Benchmarks] Error:", err);
    return jsonResponse({ success: false, error: err.message }, 500, request);
  }
}

