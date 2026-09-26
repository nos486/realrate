/**
 * apiRoutes.js — Public API route handlers
 * /api/prices — Live raw market prices, spot rates & forex (pure data, zero server-side calculations)
 */

import { getLatestMarketRates } from "../services/priceSources.js";
import { getGlobalSettings } from "../repositories/settings.repository.js";
import { jsonResponse } from "../lib/helpers.js";
import { logger } from "../lib/logger.js";
import { readPriceTrends, TREND_RANGES, DEFAULT_TREND_RANGE } from "../repositories/priceHistory.repository.js";

const SPARKLINE_MAX_KEYS = 200;
// A series never changes faster than its buckets: cache at most one bucket, up to 5 minutes
const SPARKLINE_MAX_CACHE_SECONDS = 300;

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

    const gold_usd = prices.ons_gold?.price || 0;
    const silver_usd = prices.ons_silver?.price || 0;
    const live_usd_item = prices.usd_toman || null;
    const live_usd_toman = live_usd_item ? live_usd_item.price : 0;

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
      reference_rates: prices.reference_rates || [],
    }, 200, request);
  } catch (err) {
    logger.error("handleGetPrices error:", { error: err.message, stack: err.stack });
    return jsonResponse({
      success: false,
      message: err.message,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: err.message,
      },
    }, 500, request);
  }
}

/**
 * GET /api/sparklines?keys=usd,gold_18k,...&range=1d
 * Trend series of the given asset ids from the price history (Postgres): per key a fixed-size
 * list of values across the window (one per `bucketSec`, from `since`), plus its first and last
 * value and the change in percent.
 * Keys without history are left out; `available: false` means the history can't be read now.
 * Answers are cached at the edge for one bucket, at most 5 minutes (keys are sorted, so any order
 * hits the cache).
 */
export async function handleGetSparklines(env, request = null) {
  const url = new URL(request?.url || "http://localhost/api/sparklines");
  const range = Object.hasOwn(TREND_RANGES, url.searchParams.get("range")) ? url.searchParams.get("range") : DEFAULT_TREND_RANGE;
  const { bucketSec } = TREND_RANGES[range];
  const keys = [...new Set(
    (url.searchParams.get("keys") || url.searchParams.get("asset") || "")
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k && k.length <= 160),
  )].sort().slice(0, SPARKLINE_MAX_KEYS);

  if (keys.length === 0) {
    return jsonResponse({ success: true, available: true, range, bucketSec, sparklines: {} }, 200, request);
  }

  const cache = globalThis.caches?.default || null;
  const cacheKey = new Request(`https://sparklines.cache/${range}?keys=${encodeURIComponent(keys.join(","))}`);
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => null);
    if (hit) return jsonResponse(await hit.json(), 200, request);
  }

  const sparklines = await readPriceTrends(env, keys, { range });
  const body = { success: true, available: sparklines !== null, range, bucketSec, sparklines: sparklines || {} };
  if (cache && sparklines !== null) {
    const toStore = new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${Math.min(bucketSec, SPARKLINE_MAX_CACHE_SECONDS)}`,
      },
    });
    await cache.put(cacheKey, toStore).catch(() => {});
  }
  return jsonResponse(body, 200, request);
}
