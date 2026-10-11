/**
 * priceAverages.js — Each item's average price over the last 30 days and the last year, kept in
 * the price book so a home card can show it without a query
 *
 * The average of a window is the mean of the item's daily closes (`price_daily`) over the window's
 * complete Tehran days, through yesterday: today's price is still moving. A day without a row (a
 * market holiday) isn't counted, so `days` says how many closes the average is of (a newer item's
 * year is shorter than 365).
 *
 * Cheap by construction: what is kept between days is each key's running sum and count per window
 * (the "averages state"). Moving a day forward reads only three days of rows — the day that
 * enters and the two that leave the windows — never the whole year (advanceAverageState). The
 * whole window is summed again only when the state is missing, more than a day behind, older than
 * AVERAGE_REBUILD_DAYS (floating sums don't drift), or dropped after past days changed (a backfill).
 *
 * In the book: `params.avg = { "30d": { value, days }, "1y": { value, days } }`, in the item's own
 * currency (a dollar-priced asset's from its `${id}@usd` closes), and for a dollar-priced asset its
 * toman averages under `params.toman.avg` (a card shown in tomans). `book.averagesThrough` is the
 * last day the averages include. Pure: no I/O; shared with the web app.
 *
 * A coin's bubble percent is averaged the same way, from the history it already has — no series
 * of its own is stored. Each day both the coin and its bubble (a spec with `bubbleOf`,
 * bubble.spec.js: the price book's own, the coin's price less its gold value — past days computed
 * the same way, bubbleHistory.service.js) closed, the coin traded at coin ÷ (coin − bubble) = coin
 * ÷ its gold value: that day's value of the derived key `${bubbleId}@ratio` (BUBBLE_RATIO_SERIES). Its running
 * sums sit beside the closes' in the same state: a full sum joins the two series' rows in the
 * window (readBubbleRatioSums), a day's move takes the ratio of the days it already reads
 * (withBubbleRatioRows). The mean ratio less one is the mean bubble percent, put on the bubble as
 * `params.avgPct = { "30d": { value, days }, "1y": … }` and on its coin as `params.targetBubblePct`
 * (the year's: what the coin's standard price is, cardMetrics.js «قیمت استاندارد») with
 * `params.targetBubbleDays`. A coin without a bubble series, or without a day of both, has none.
 */

import { currencyOf, usdSeriesKey, roundToman, roundUsd, priceBookVersion, normalizePriceId } from "./priceBook.js";
import { BUBBLE_SPECS } from "./specs/bubble.spec.js";

/** The averaging windows, by key (the key is what `params.avg` and a card metric use) */
export const AVERAGE_WINDOWS = {
  "30d": { days: 30, label: "۳۰ روز" },
  "1y": { days: 365, label: "یک سال" },
};

export const AVERAGE_WINDOW_KEYS = Object.keys(AVERAGE_WINDOWS);

/** The longest window, in days (how far back a full sum reads) */
export const AVERAGE_MAX_DAYS = Math.max(...Object.values(AVERAGE_WINDOWS).map((w) => w.days));

/** Days after which the running sums are rebuilt from the rows */
export const AVERAGE_REBUILD_DAYS = 30;

/** 2: the coins' bubble ratios joined the sums (an older state is summed again) */
export const AVERAGE_STATE_VERSION = 2;

/** The derived key of a coin's bubble ratio (never a stored series: computed from two that are) */
export const BUBBLE_RATIO_SUFFIX = "@ratio";

/** Each coin bubble's derived series: its key, the bubble's id and the coin's */
export const BUBBLE_RATIO_SERIES = Object.values(BUBBLE_SPECS)
  .filter((spec) => spec.bubbleOf)
  .map((spec) => {
    const bubbleId = normalizePriceId(spec.id);
    return { key: `${bubbleId}${BUBBLE_RATIO_SUFFIX}`, bubbleId, coinId: normalizePriceId(spec.bubbleOf) };
  });

/**
 * A day's ratio of a coin to its gold value, from the coin's close and its bubble's
 * @returns {number|null} null without both (the history keeps positive closes only), or with a
 *   bubble not below the coin
 */
export function bubbleRatio(coin, bubble) {
  const c = Number(coin);
  const b = Number(bubble);
  if (!(c > 0) || !(b > 0) || !(c - b > 0)) return null;
  return c / (c - b);
}

/**
 * The closes of some days with each coin's bubble ratio of those days added (the rows a day's move
 * reads hold both series of a coin)
 * @param {Array<{ item_key: string, day: string, value: number }>} rows
 */
export function withBubbleRatioRows(rows) {
  const byDay = new Map();
  for (const row of rows || []) {
    if (!byDay.has(row.day)) byDay.set(row.day, new Map());
    byDay.get(row.day).set(String(row.item_key), Number(row.value));
  }
  const derived = [];
  for (const [day, closes] of byDay) {
    for (const { key, bubbleId, coinId } of BUBBLE_RATIO_SERIES) {
      const value = bubbleRatio(closes.get(coinId), closes.get(bubbleId));
      if (value !== null) derived.push({ item_key: key, day, value });
    }
  }
  return [...(rows || []), ...derived];
}


/** A YYYY-MM-DD day moved by `n` days */
export function shiftDay(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The first day of a window that ends on `through` (inclusive) */
export const windowStart = (through, days) => shiftDay(through, -(days - 1));

/** The days a move from `through - 1` to `through` reads: the one that enters, those that leave */
export function boundaryDaysOf(through) {
  const leaving = AVERAGE_WINDOW_KEYS.map((w) => shiftDay(through, -AVERAGE_WINDOWS[w].days));
  return [...new Set([through, ...leaving])];
}

/**
 * The state from whole-window sums (one row per key: `sum_<window>`, `n_<window>`)
 * @param {Array<object>} rows
 * @param {string} through - the last day included
 */
export function averageStateFromSums(rows, through) {
  const sums = {};
  for (const w of AVERAGE_WINDOW_KEYS) sums[w] = {};
  for (const row of rows || []) {
    const key = String(row?.item_key || "");
    if (!key) continue;
    for (const w of AVERAGE_WINDOW_KEYS) {
      const n = Number(row[`n_${w}`]) || 0;
      const sum = Number(row[`sum_${w}`]) || 0;
      if (n > 0 && sum > 0) sums[w][key] = [sum, n];
    }
  }
  return { v: AVERAGE_STATE_VERSION, through, rebuiltOn: through, sums };
}

/**
 * Move the state one day forward: add the new day's closes, take out the closes that left each window
 * @param {object} state - through `through - 1`
 * @param {Array<{ item_key: string, day: string, value: number }>} rows - boundaryDaysOf(through)'s rows
 * @param {string} through - the new last day
 */
export function advanceAverageState(state, rows, through) {
  rows = withBubbleRatioRows(rows);
  const sums = {};
  for (const w of AVERAGE_WINDOW_KEYS) {
    const next = { ...(state?.sums?.[w] || {}) };
    const leaving = shiftDay(through, -AVERAGE_WINDOWS[w].days);
    for (const row of rows || []) {
      const key = String(row?.item_key || "");
      const value = Number(row?.value);
      if (!key || !(value > 0)) continue;
      const sign = row.day === through ? 1 : row.day === leaving ? -1 : 0;
      if (!sign) continue;
      const [sum, n] = next[key] || [0, 0];
      const nextN = n + sign;
      if (nextN > 0) next[key] = [sum + sign * value, nextN];
      else delete next[key];
    }
    sums[w] = next;
  }
  return { v: AVERAGE_STATE_VERSION, through, rebuiltOn: state?.rebuiltOn || through, sums };
}

/** Whether a state can be moved forward to `through` (else the windows are summed again) */
export function canAdvance(state, through) {
  if (state?.v !== AVERAGE_STATE_VERSION || !state.rebuiltOn) return false;
  if (state.through !== shiftDay(through, -1)) return false;
  return shiftDay(state.rebuiltOn, AVERAGE_REBUILD_DAYS) > through;
}

/**
 * Each key's averages: key → { [window]: { value, days } }
 * @param {object} state
 * @returns {Map<string, Record<string, { value: number, days: number }>>}
 */
export function averagesOf(state) {
  const byKey = new Map();
  for (const w of AVERAGE_WINDOW_KEYS) {
    for (const [key, [sum, n]] of Object.entries(state?.sums?.[w] || {})) {
      if (!(n > 0) || !(sum > 0)) continue;
      if (!byKey.has(key)) byKey.set(key, {});
      byKey.get(key)[w] = { value: sum / n, days: n };
    }
  }
  return byKey;
}

/** One key's averages, rounded in a currency */
const rounded = (avg, currency) => {
  if (!avg) return null;
  const out = {};
  for (const [w, { value, days }] of Object.entries(avg)) {
    const v = currency === "usd" ? roundUsd(value) : roundToman(value);
    if (v > 0) out[w] = { value: v, days };
  }
  return Object.keys(out).length ? out : null;
};

/**
 * Put the averages on the book's items (in place)
 * @param {object} book
 * @param {Map<string, object>} averages - averagesOf()
 * @param {string} through
 */
export function applyAverages(book, averages, through) {
  for (const item of Object.values(book?.items || {})) {
    const usd = currencyOf(item) === "usd";
    const own = rounded(averages.get(usd ? usdSeriesKey(item.id) : item.id), usd ? "usd" : "toman");
    const params = { ...(item.params || {}) };
    if (own) params.avg = own;
    else delete params.avg;
    if (usd && params.toman) {
      const toman = rounded(averages.get(item.id), "toman");
      params.toman = { ...params.toman };
      if (toman) params.toman.avg = toman;
      else delete params.toman.avg;
    }
    item.params = params;
  }
  applyBubbleTargets(book, averages);
  book.averagesThrough = through;
  // The book's fingerprint covers the averages (a client refetches when they move)
  book.version = priceBookVersion(book.items);
  return book;
}

const roundPct = (value) => Math.round(value * 100) / 100;

/**
 * The coins' mean bubble percents from their ratio averages: on the bubble (`params.avgPct`) and,
 * the year's, on its coin (`params.targetBubblePct`, `params.targetBubbleDays`) — in place
 * @param {object} book
 * @param {Map<string, object>} averages - averagesOf()
 */
export function applyBubbleTargets(book, averages) {
  const items = book?.items || {};
  for (const { key, bubbleId, coinId } of BUBBLE_RATIO_SERIES) {
    const pct = {};
    for (const [w, { value, days }] of Object.entries(averages.get(key) || {})) {
      if (value > 0) pct[w] = { value: roundPct((value - 1) * 100), days };
    }
    const bubble = items[bubbleId];
    if (bubble) {
      const params = { ...(bubble.params || {}) };
      if (Object.keys(pct).length) params.avgPct = pct;
      else delete params.avgPct;
      bubble.params = params;
    }
    const coin = items[coinId];
    if (coin) {
      const params = { ...(coin.params || {}) };
      if (pct["1y"]) {
        params.targetBubblePct = pct["1y"].value;
        params.targetBubbleDays = pct["1y"].days;
      } else {
        delete params.targetBubblePct;
        delete params.targetBubbleDays;
      }
      coin.params = params;
    }
  }
  return book;
}

/**
 * Keep the previous book's averages on a new book (the averages change once a day; every other
 * tick only carries them)
 */
export function carryAverages(book, previousBook) {
  if (!previousBook?.averagesThrough) return book;
  for (const item of Object.values(book?.items || {})) {
    const prev = previousBook.items?.[item.id]?.params;
    // An item whose currency changed doesn't keep averages measured in the other one
    if (!prev?.avg || (prev.dayCurrency || "toman") !== (item.params?.dayCurrency || "toman")) continue;
    item.params = { ...(item.params || {}), avg: prev.avg };
    if (prev.toman?.avg && item.params.toman) item.params.toman = { ...item.params.toman, avg: prev.toman.avg };
  }
  // The coins' bubble averages move with the rest (once a day)
  for (const { bubbleId, coinId } of BUBBLE_RATIO_SERIES) {
    const bubble = book.items?.[bubbleId];
    const prevBubble = previousBook.items?.[bubbleId]?.params;
    if (bubble && prevBubble?.avgPct) bubble.params = { ...(bubble.params || {}), avgPct: prevBubble.avgPct };
    const coin = book.items?.[coinId];
    const prevCoin = previousBook.items?.[coinId]?.params;
    // Only a target the averages put on (with its days): never an older book's fixed percent
    if (coin && prevCoin?.targetBubbleDays > 0 && prevCoin.targetBubblePct !== undefined) {
      coin.params = { ...(coin.params || {}), targetBubblePct: prevCoin.targetBubblePct, targetBubbleDays: prevCoin.targetBubbleDays };
    }
  }
  book.averagesThrough = previousBook.averagesThrough;
  book.version = priceBookVersion(book.items);
  return book;
}
