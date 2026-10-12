/**
 * widgetFeed.js — What the Android home-screen widgets read, without I/O
 *
 * One small answer for both widgets (GET /api/widget): the favourite items' prices and the day's
 * top news with the analyst's headline. The widgets are native code that only displays numbers, so
 * everything is decided here from the price book — tomans, the asset's own dollar price when it
 * has one (assetPrice rules), the day's change — and a device never downloads the whole book.
 * Only the model's own news (and its daily analysis) goes on the widget. Pure: shared by the Worker and its tests.
 */

import { currencyOf } from "./priceBook.js";
import { toPriceId } from "./priceIds.js";
import { metricValue } from "./cardMetrics.js";

/** Favourites a widget lists at most (the widget's price tiles: two columns, three rows) */
export const WIDGET_MAX_ITEMS = 6;

/** Favourites shown until the user picks their own (book ids) */
export const WIDGET_DEFAULT_ITEMS = ["usd", "gold_18k", "full_coin", "BTC"];

/** News rows the widget lists */
export const WIDGET_NEWS_LIMIT = 6;

/** News read to find enough AI-picked ones (the rest are keyword-only posts, never shown on the widget) */
export const WIDGET_NEWS_READ = WIDGET_NEWS_LIMIT * 3;

/** The AI-picked news (`ai`), most important first as given, at most WIDGET_NEWS_LIMIT */
export const aiNewsOf = (news) => (news || []).filter((n) => n?.ai).slice(0, WIDGET_NEWS_LIMIT);

const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

/** The ids of a `?ids=a,b,c` query: book ids, repeats and blanks dropped, at most WIDGET_MAX_ITEMS */
export function parseWidgetIds(raw, knownIds = null) {
  const ids = [];
  for (const part of String(raw || "").split(",")) {
    const id = toPriceId(safeDecode(part.trim()), knownIds);
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= WIDGET_MAX_ITEMS) break;
  }
  return ids;
}

/**
 * One favourite as the widget shows it
 * @param {object} item - a price book item
 * @returns {{ id: string, name: string, unit: string, price: number, currency: 'usd'|'toman', priceUsd: number|null, changePct: number|null }|null}
 *   null when the item has no price now
 */
export function widgetPriceOf(item) {
  if (!item || !(Number(item.price) > 0)) return null;
  const usd = currencyOf(item) === "usd" && Number(item.priceUsd) > 0;
  const change = metricValue(item, "change", { display: usd ? null : "toman" });
  return {
    id: item.id,
    name: item.name || item.id,
    unit: item.unit || "",
    price: usd ? Number(item.priceUsd) : Number(item.price),
    currency: usd ? "usd" : "toman",
    priceUsd: usd ? Number(item.priceUsd) : null,
    changePct: change ? Math.round(change.value * 100) / 100 : null,
  };
}

/**
 * The favourites' rows in the order asked; an id the book doesn't have (or without a price) is left out
 * @param {Record<string, object>} items - the book's items by id
 * @param {string[]} ids
 */
export function widgetPrices(items, ids) {
  return ids.map((id) => widgetPriceOf(items?.[id])).filter(Boolean);
}

/** One news item as the widget shows it (no text: the app has the full item) */
export function widgetNewsOf(news, categories = {}) {
  return {
    id: news.id,
    title: news.title,
    category: news.category,
    categoryLabel: categories[news.category] || "",
    importance: news.importance || 1,
    publishedAt: news.publishedAt,
  };
}

/** The analyst's card shortened to what a widget shows, or null */
export function widgetAnalysisOf(analysis) {
  if (!analysis?.title) return null;
  return { title: analysis.title, summary: String(analysis.summary || "").slice(0, 280), at: analysis.at || 0 };
}
