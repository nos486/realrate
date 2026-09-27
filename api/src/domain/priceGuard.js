/**
 * priceGuard.js — Implausible prices never reach the book (or the history, which is forever)
 *
 * A source can suddenly give a wrong number: rials instead of tomans (×10), a placeholder 0 or 1,
 * a typo in a Telegram post. Each value a source gives is compared with the value it gave last
 * time for the same item. A jump beyond the source's `maxJumpPct` is held back: the item keeps its
 * last value, and the new one waits. Only when the source keeps giving (about) the same new value
 * for `confirmTicks` syncs in a row is it accepted as a real move — a devaluation or a stock's
 * capital increase is real, a one-off glitch is not.
 *
 * Pure: no I/O. What is waiting is kept in the price book's `sources[sourceId].held`.
 */

/** Default largest change between two syncs, in percent, before a value needs confirming */
export const DEFAULT_MAX_JUMP_PCT = 25;

/** Default number of syncs in a row a jumped value must repeat to be accepted */
export const DEFAULT_CONFIRM_TICKS = 3;

/** Two values count as "the same new value" within this percentage */
const SAME_VALUE_PCT = 2;

const positive = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const changePct = (from, to) => (Math.abs(to - from) / from) * 100;

/** An item's key within its source (its own id, symbol or code) */
const keyOf = (item) => String(item?.id ?? item?.symbol ?? item?.s ?? item?.code ?? "").trim();

/** The price field an item carries (sources name it differently) */
const PRICE_FIELDS = ["price", "priceToman", "p", "priceRial", "pl"];
const priceFieldOf = (item) => PRICE_FIELDS.find((f) => positive(item?.[f])) || null;

/**
 * Check a source's new items against its previous ones
 * @param {Array<object>} previousItems - what the source gave last time (stored)
 * @param {Array<object>} nextItems - what it gives now
 * @param {{ maxJumpPct?: number, confirmTicks?: number, held?: Record<string, { value: number, ticks: number }> }} [options]
 *   `held`: values waiting from earlier syncs (book.sources[id].held)
 * @returns {{ items: Array<object>, held: Record<string, { value: number, ticks: number }>,
 *   rejected: Array<{ key: string, previous: number, value: number }> }}
 *   `items`: the new list with every held-back item at its previous value
 */
export function guardSourceItems(previousItems, nextItems, {
  maxJumpPct = DEFAULT_MAX_JUMP_PCT,
  confirmTicks = DEFAULT_CONFIRM_TICKS,
  held = {},
} = {}) {
  const previous = new Map((previousItems || []).map((item) => [keyOf(item), item]));
  const nextHeld = {};
  const rejected = [];

  const items = (nextItems || []).map((item) => {
    const key = keyOf(item);
    const field = priceFieldOf(item);
    const before = previous.get(key);
    const beforeField = priceFieldOf(before);
    // Nothing to compare with (a new item, or a different price field): taken as it is
    if (!key || !field || !before || beforeField !== field) return item;

    const value = positive(item[field]);
    const last = positive(before[field]);
    if (changePct(last, value) <= maxJumpPct) return item;

    // The same jumped value as last time: one more sync confirming it
    const waiting = held[key];
    const ticks = waiting && changePct(waiting.value, value) <= SAME_VALUE_PCT ? waiting.ticks + 1 : 1;
    if (ticks >= confirmTicks) return item;

    nextHeld[key] = { value, ticks };
    rejected.push({ key, previous: last, value });
    return before;
  });

  return { items, held: nextHeld, rejected };
}
