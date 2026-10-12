/**
 * widgetRoutes.js — The Android home-screen widgets' feed
 *
 * Endpoint:
 *   GET /api/widget?ids=usd,gold_18k   — { updatedAt, prices, news, analysis, defaultIds }; public, cached 60 s at the edge
 */

import { jsonResponse } from "../lib/helpers.js";
import { edgeCachedJson } from "../lib/edgeCache.js";
import { getPriceBook } from "../services/market/priceAggregator.service.js";
import { dbTopNewsSince } from "../repositories/news.repository.js";
import { getNewsAnalysis } from "../services/news/newsAnalysis.service.js";
import { tehranDayStart } from "../domain/news.js";
import { NEWS_CATEGORIES } from "../config/news.config.js";
import {
  WIDGET_DEFAULT_ITEMS,
  WIDGET_NEWS_LIMIT,
  parseWidgetIds,
  widgetPrices,
  widgetNewsOf,
  widgetAnalysisOf,
} from "../domain/widgetFeed.js";

/** Widgets refresh every half hour or on a tap: a minute of sharing per list of favourites is plenty */
const WIDGET_CACHE_SEC = 60;

export async function handleGetWidgetFeed(request, env) {
  const raw = new URL(request.url).searchParams.get("ids");
  const requested = parseWidgetIds(raw);
  const ids = requested.length ? requested : WIDGET_DEFAULT_ITEMS;
  const body = await edgeCachedJson(`https://widget.cache/feed?ids=${encodeURIComponent(ids.join(","))}`, WIDGET_CACHE_SEC, async () => {
    const now = Date.now();
    const [book, today, analysis] = await Promise.all([
      getPriceBook(env),
      dbTopNewsSince(env, tehranDayStart(now), WIDGET_NEWS_LIMIT),
      getNewsAnalysis(env),
    ]);
    // Early in the day: the last 24 hours instead (as the news page's "today")
    const top = today.length >= 3 ? today : await dbTopNewsSince(env, now - 86400000, WIDGET_NEWS_LIMIT);
    return {
      updatedAt: book.updatedAt || now,
      prices: widgetPrices(book.items, parseWidgetIds(ids.join(","), book.items)),
      news: top.map((n) => widgetNewsOf(n, NEWS_CATEGORIES)),
      analysis: widgetAnalysisOf(analysis),
    };
  });
  return jsonResponse({ success: true, ...body, defaultIds: WIDGET_DEFAULT_ITEMS }, 200, request, {
    "Cache-Control": `public, max-age=${WIDGET_CACHE_SEC}`,
  });
}
