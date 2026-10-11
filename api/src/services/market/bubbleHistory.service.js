/**
 * bubbleHistory.service.js — Coin bubbles' past days, computed from our own history
 *
 * A coin's bubble is the price book's own (its market price less its gold value, priceBook.js);
 * it once came from tgju, whose gold value differs from ours. So that a bubble's chart, its
 * averages and the coin's standard price (priceAverages.js) are of one bubble, every bubble's past
 * days are computed again from the coin's closes and the world ounce's and dollar's
 * (rebuildBubbleHistory) — once per BUBBLE_HISTORY_VERSION, from the hourly cron. From then on the
 * live sync records each day as it records any item. Its charts' snapshots and the averages'
 * running sums are dropped, so both are read again. When the past days of what a bubble is computed
 * from change (a history backfill of a coin, the ounce or the dollar), the next hour computes them
 * again (invalidateBubbleHistory). An admin can also compute everything derived again at once, with
 * a report (recomputeDerivedHistory, «محاسبه‌ی دوباره» in the admin's price history page).
 */

import { logger } from "../../lib/logger.js";
import { AppError } from "../../lib/AppError.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { rebuildBubbleHistory, readHistoryKeyStats, tehranDay } from "../../repositories/priceHistory.repository.js";
import { dropHistorySnapshots } from "../../repositories/priceHistoryStore.repository.js";
import { getPriceBookCache, setPriceBookCache } from "../../repositories/priceBookStore.repository.js";
import { resetPriceAverages, averageStateThrough } from "./priceAverages.service.js";
import { BASE_PRICE_IDS, SPEC_BY_ID, normalizePriceId, usdSeriesKey, historyKeysOf } from "../../domain/priceBook.js";
import { applyAverages, averagesOf, shiftDay } from "../../domain/priceAverages.js";
import { BUBBLE_SPECS } from "../../domain/specs/bubble.spec.js";
import { TROY_OUNCE_GRAMS } from "../../domain/specs/gold.spec.js";

/** Bumped when the way past bubbles are computed changes: the next hour computes them again */
export const BUBBLE_HISTORY_VERSION = 1;
export const BUBBLE_HISTORY_STATE_KEY = "bubble_history_version";

/** Each coin bubble with its coin and the coin's grams of pure gold */
export const bubbleSeriesOf = () => Object.values(BUBBLE_SPECS)
  .map((spec) => {
    const coinId = normalizePriceId(spec.bubbleOf);
    return { bubbleId: normalizePriceId(spec.id), coinId, gold24kWeight: Number(SPEC_BY_ID.get(coinId)?.gold24kWeight) || 0 };
  })
  .filter((b) => b.coinId && b.gold24kWeight > 0);

/**
 * Compute the bubbles' past days once per version
 * @param {object} env
 * @param {number} [now]
 * @returns {Promise<{ written: number }|null>} null when nothing was done
 */
export async function ensureBubbleHistory(env, now = Date.now()) {
  const store = getStateStore(env);
  if (!store || !env?.DB?.batch) return null;
  const done = await store.get(BUBBLE_HISTORY_STATE_KEY, "json").catch(() => null);
  if (done?.v === BUBBLE_HISTORY_VERSION) return null;
  const bubbles = bubbleSeriesOf();
  const written = await rebuildBubbleHistory(env, bubbles, {
    ounceKey: usdSeriesKey(BASE_PRICE_IDS.goldOunce),
    usdKey: BASE_PRICE_IDS.usd,
    troyOunceGrams: TROY_OUNCE_GRAMS,
    now,
  });
  if (written === null) return null;
  await dropHistorySnapshots(env, bubbles.map((b) => b.bubbleId));
  await resetPriceAverages(env);
  await store.put(BUBBLE_HISTORY_STATE_KEY, JSON.stringify({ v: BUBBLE_HISTORY_VERSION, at: new Date(now).toISOString(), written }));
  logger.info("[BubbleHistory] Computed again:", { written });
  return { written };
}

/** The history keys bubbles are computed from: the coins, the ounce in dollars and the dollar */
export const bubbleInputKeys = () => [
  ...new Set([...bubbleSeriesOf().map((b) => b.coinId), usdSeriesKey(BASE_PRICE_IDS.goldOunce), BASE_PRICE_IDS.usd]),
];

/**
 * Past days of these keys changed: when any is a bubble's input, compute the bubbles again on the
 * next hour
 * @param {object} env
 * @param {string[]} keys
 */
export async function invalidateBubbleHistory(env, keys) {
  const inputs = new Set(bubbleInputKeys());
  if (!(keys || []).some((k) => inputs.has(normalizePriceId(k)))) return;
  await getStateStore(env)?.delete(BUBBLE_HISTORY_STATE_KEY).catch(() => {});
}

/**
 * Compute everything derived from the history again, now — the coin bubbles' past days from their
 * coins', the ounce's and the dollar's closes, then every item's averages (and so each coin's
 * year's mean bubble, its standard price), put on the price book at once — and say what came of it
 * @param {object} env
 * @param {{ now?: number, getBook?: Function, setBook?: Function }} [options]
 * @returns {Promise<object>} the report: rows written, the inputs' history, and per bubble its
 *   days, its coin's days and the coin's mean bubble over the year
 */
export async function recomputeDerivedHistory(env, { now = Date.now(), getBook = getPriceBookCache, setBook = setPriceBookCache } = {}) {
  if (!env?.DB?.batch) throw new AppError("پایگاه‌داده در دسترس نیست", 503, "NO_DATABASE");
  const bubbles = bubbleSeriesOf();
  const ounceKey = usdSeriesKey(BASE_PRICE_IDS.goldOunce);
  const usdKey = BASE_PRICE_IDS.usd;
  const written = await rebuildBubbleHistory(env, bubbles, { ounceKey, usdKey, troyOunceGrams: TROY_OUNCE_GRAMS, now }) ?? 0;
  await getStateStore(env)?.put(BUBBLE_HISTORY_STATE_KEY, JSON.stringify({ v: BUBBLE_HISTORY_VERSION, at: new Date(now).toISOString(), written }));
  await dropHistorySnapshots(env, bubbles.map((b) => b.bubbleId));

  // The averages summed again from the whole windows, and put on the book now (not on the next hour)
  await resetPriceAverages(env);
  const book = await getBook(env);
  const through = shiftDay(tehranDay(now), -1);
  const state = book?.items ? await averageStateThrough(env, historyKeysOf(book.items), through) : null;
  if (state) {
    applyAverages(book, averagesOf(state), through);
    book.averagesTriedAt = new Date(now).toISOString();
    await setBook(env, book);
  }

  const stats = await readHistoryKeyStats(env, [ounceKey, usdKey, ...bubbles.flatMap((b) => [b.bubbleId, b.coinId])]);
  const stat = (key) => stats.get(key) || { days: 0, first: null, last: null };
  const items = book?.items || {};
  const report = {
    at: new Date(now).toISOString(),
    written,
    averagesThrough: state ? through : null,
    inputs: { ounce: { key: ounceKey, ...stat(ounceKey) }, usd: { key: usdKey, ...stat(usdKey) } },
    bubbles: bubbles.map(({ bubbleId, coinId }) => ({
      id: bubbleId,
      name: items[bubbleId]?.name || SPEC_BY_ID.get(bubbleId)?.name || bubbleId,
      history: stat(bubbleId),
      coin: { id: coinId, name: items[coinId]?.name || SPEC_BY_ID.get(coinId)?.name || coinId, ...stat(coinId) },
      targetBubblePct: items[coinId]?.params?.targetBubblePct ?? null,
      targetBubbleDays: items[coinId]?.params?.targetBubbleDays ?? null,
    })),
  };
  logger.info("[BubbleHistory] Recomputed by an admin:", { written, averagesThrough: report.averagesThrough });
  return report;
}
