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
 * again (invalidateBubbleHistory).
 */

import { logger } from "../../lib/logger.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { rebuildBubbleHistory } from "../../repositories/priceHistory.repository.js";
import { dropHistorySnapshots } from "../../repositories/priceHistoryStore.repository.js";
import { resetPriceAverages } from "./priceAverages.service.js";
import { BASE_PRICE_IDS, SPEC_BY_ID, normalizePriceId, usdSeriesKey } from "../../domain/priceBook.js";
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
