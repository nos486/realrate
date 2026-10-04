/**
 * dollarValue.js — A toman amount on a past date seen in dollars: what it was in dollars on that
 * day, and what those dollars are worth today
 *
 * The one way every record (an expense, an income, a portfolio purchase) is shown in dollars. The
 * day's rate comes from the daily price history (web features/market/dailyHistory.js `usdAt`),
 * or from a rate stored on the record when it is a fact of the trade — see docs/ARCHITECTURE.md,
 * «قیمت روز رکورد».
 */

/**
 * @param {number} toman - the amount in tomans on its day
 * @param {number} rateThen - the dollar's rate (tomans) on that day
 * @param {number} [usdToday] - today's rate
 * @returns {{ usd: number, paidToman: number, todayToman: number|null, changePct: number|null }|null}
 *   `changePct`: how much more (or less) the same dollars cost in tomans today; null without
 *   an amount or the day's rate
 */
export function dollarValueOf(toman, rateThen, usdToday = 0) {
  const amount = Number(toman) || 0;
  const rate = Number(rateThen) || 0;
  if (amount <= 0 || rate <= 0) return null;
  const usd = amount / rate;
  const todayToman = usdToday > 0 ? usd * usdToday : null;
  return { usd, paidToman: amount, todayToman, changePct: todayToman !== null ? ((todayToman - amount) / amount) * 100 : null };
}

/**
 * The dollar view of a list: the dollars, the tomans paid for those whose toman amount is known,
 * what the dollars are worth today, and the change; `missing` counts the records without a value
 * (null: no rate known for their day)
 * @param {Array<ReturnType<typeof dollarValueOf>|{ usd: number, paidToman: number|null }|null>} values
 * @param {number} [usdToday]
 * @returns {{ usd: number, paidToman: number, todayToman: number|null, changePct: number|null,
 *   counted: number, missing: number }}
 */
export function summarizeDollarValues(values = [], usdToday = 0) {
  const summary = { usd: 0, paidToman: 0, todayToman: null, changePct: null, counted: 0, missing: 0 };
  let comparableUsd = 0; // dollars whose toman amount is known
  for (const value of values) {
    if (!value) {
      summary.missing += 1;
      continue;
    }
    summary.counted += 1;
    summary.usd += value.usd;
    if (value.paidToman !== null && value.paidToman !== undefined) {
      summary.paidToman += value.paidToman;
      comparableUsd += value.usd;
    }
  }
  if (usdToday > 0 && summary.counted > 0) {
    summary.todayToman = summary.usd * usdToday;
    if (summary.paidToman > 0) summary.changePct = ((comparableUsd * usdToday - summary.paidToman) / summary.paidToman) * 100;
  }
  return summary;
}
