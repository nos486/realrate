/**
 * apiRoutes.js — Public price routes. Every price comes from the price book (KV "prices").
 */

import { getPriceBook } from "../services/market/priceAggregator.service.js";
import { baseRatesOf, forexCrossRatesOf, legacyPricesOf } from "../domain/priceBookViews.js";
import { getGlobalSettings } from "../repositories/settings.repository.js";
import { jsonResponse } from "../lib/helpers.js";
import { logger } from "../lib/logger.js";
import { readPriceTrends, TREND_RANGES, DEFAULT_TREND_RANGE } from "../repositories/priceHistory.repository.js";

const SPARKLINE_MAX_KEYS = 200;
// A series never changes faster than its buckets: cache at most one bucket, up to 5 minutes
const SPARKLINE_MAX_CACHE_SECONDS = 300;

/**
 * GET /api/prices
 * The price book in the shape older clients read (see priceBookViews.legacyPricesOf), with the
 * global settings.
 */
export async function handleGetPrices(env, request = null) {
  try {
    const [book, globalSettings] = await Promise.all([getPriceBook(env), getGlobalSettings(env)]);
    const prices = legacyPricesOf(book);
    const base = baseRatesOf(book);

    return jsonResponse({
      success: true,
      prices,
      market_prices: prices,
      gold_usd: base.goldUsd,
      silver_usd: base.silverUsd,
      live_usd_toman: base.usdToman,
      live_usd_item: prices.usd || null,
      forex: forexCrossRatesOf(book),
      globalSettings,
      reference_rates: prices.reference_rates,
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
 * GET /api/prices/book
 * Every price in the standard shape (domain/priceBook.js): `{ updatedAt, items: { [id]: item } }`,
 * each item in tomans under its unique id — the ids stored data, charts and the history use.
 * The global settings (announcement, target bubbles) come along, so a page needs one request.
 * Sources' sync state stays private (its errors may name an endpoint).
 */
export async function handleGetPriceBook(env, request = null) {
  const [book, globalSettings] = await Promise.all([getPriceBook(env), getGlobalSettings(env)]);
  return jsonResponse({ success: true, updatedAt: book.updatedAt, items: book.items, globalSettings }, 200, request);
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
