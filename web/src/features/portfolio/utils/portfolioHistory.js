/**
 * portfolioHistory.js — A portfolio's value day by day, from its first entry to today
 *
 * Each asset's ledger entries (assetLedger.js) give the quantity held on every day: manual records
 * and buys add, sells and spends take away (an undated manual record is held from the start). That
 * quantity is valued at the asset's price of that day from the price history
 * (features/market/dailyHistory.js) and, for the dollar view, divided by the dollar's rate of the day.
 *
 * The history is in the price book's unit; the ledger's unit can differ (grams vs mesghals), so a
 * day's price is scaled by (today's price in the holding's unit ÷ the history's latest price).
 * Pure: no React, no storage; everything stays in the browser.
 */

import { sortableDate } from './assetLedger.js';

const DAY_MS = 86_400_000;

const dayMs = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Every day from `from` to `to` (YYYY-MM-DD), both included */
export function daysBetween(from, to) {
  const out = [];
  for (let ms = dayMs(from); ms <= dayMs(to); ms += DAY_MS) out.push(isoOf(ms));
  return out;
}

/** The quantity an asset's entries leave held after each day: [{ day, qty }] in date order */
function quantitySteps(asset) {
  const steps = [];
  let qty = 0;
  for (const entry of asset.entries || []) {
    const sign = entry.kind === 'sell' || entry.kind === 'spend' ? -1 : 1;
    qty = Math.max(0, qty + sign * (Number(entry.qty) || 0));
    steps.push({ day: sortableDate(entry.date), qty });
  }
  return steps;
}

/**
 * @param {{ assets: object[], priceAt: (id: string, day: string) => number|null,
 *   usdAt?: (day: string) => number|null, today: string }} input - assets from buildAssetLedgers
 * @returns {{ days: string[], toman: number[], usd: (number|null)[], estimated: boolean }|null}
 *   null when no entry has a date; `estimated`: some value is a stand-in (an asset with no price
 *   history, or a day before its history began, is valued at the nearest price known)
 */
export function buildPortfolioSeries({ assets = [], priceAt, usdAt, today }) {
  const prepared = assets.map((asset) => ({ asset, steps: quantitySteps(asset) })).filter((p) => p.steps.length);
  const dated = prepared.flatMap((p) => p.steps.map((s) => s.day)).filter(Boolean).sort();
  if (!dated.length || !today || dated[0] > today) return null;

  const days = daysBetween(dated[0], today);
  const toman = new Array(days.length).fill(0);
  let estimated = false;

  for (const { asset, steps } of prepared) {
    const todayPrice = Number(asset.unitRealPrice) || 0;
    const latest = priceAt(asset.assetId, today);
    const scale = latest > 0 && todayPrice > 0 ? todayPrice / latest : 0;
    let cursor = 0;
    let qty = 0;
    // Undated entries hold from the first day
    while (cursor < steps.length && !steps[cursor].day) qty = steps[cursor++].qty;

    // The first priced day, to stand in for days before the history began
    let firstPrice = null;
    for (const day of days) {
      firstPrice = priceAt(asset.assetId, day);
      if (firstPrice > 0) break;
    }
    days.forEach((day, i) => {
      while (cursor < steps.length && steps[cursor].day <= day) qty = steps[cursor++].qty;
      if (!(qty > 0)) return;
      let price;
      const known = scale > 0 ? priceAt(asset.assetId, day) : null;
      if (known > 0) price = known * scale;
      else {
        // No history for this asset or day: the nearest price known
        price = scale > 0 && firstPrice > 0 ? firstPrice * scale : todayPrice;
        estimated = true;
      }
      toman[i] += qty * price;
    });
  }

  const usd = usdAt ? days.map((day, i) => {
    const rate = Number(usdAt(day)) || 0;
    return rate > 0 ? toman[i] / rate : null;
  }) : days.map(() => null);
  return { days, toman, usd, estimated };
}

/** The last `count` days of a series (all of it when count is 0 or more than it has) */
export function sliceSeries(series, count) {
  if (!series || !count || count >= series.days.length) return series;
  const from = series.days.length - count;
  return { ...series, days: series.days.slice(from), toman: series.toman.slice(from), usd: series.usd.slice(from) };
}
