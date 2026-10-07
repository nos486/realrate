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
 */

import { currencyOf, usdSeriesKey, roundToman, roundUsd, priceBookVersion } from "./priceBook.js";

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

export const AVERAGE_STATE_VERSION = 1;

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
  book.averagesThrough = through;
  // The book's fingerprint covers the averages (a client refetches when they move)
  book.version = priceBookVersion(book.items);
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
  book.averagesThrough = previousBook.averagesThrough;
  book.version = priceBookVersion(book.items);
  return book;
}
