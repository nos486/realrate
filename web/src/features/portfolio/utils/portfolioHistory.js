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

/** The day an entry is held from: its own date, else the day it was recorded in the app, else '' */
function entryDay(entry) {
  const own = sortableDate(entry.date);
  if (own) return { day: own, fromCreation: false };
  const created = /^\d{4}-\d{2}-\d{2}/.test(String(entry.createdAt || '')) ? String(entry.createdAt).slice(0, 10) : '';
  return { day: created, fromCreation: Boolean(created) };
}

/**
 * The quantity an asset's entries leave held after each day: [{ day, qty }] in date order; an entry
 * with no date counts from the day it was recorded, or from the start when even that is unknown
 */
function quantitySteps(asset) {
  const events = (asset.entries || []).map((entry) => {
    const { day, fromCreation } = entryDay(entry);
    const out = entry.kind === 'sell' || entry.kind === 'spend';
    return { day, fromCreation, out, delta: (out ? -1 : 1) * (Number(entry.qty) || 0) };
  });
  // Date order; on one day what comes in before what goes out
  events.sort((a, b) => a.day.localeCompare(b.day) || Number(a.out) - Number(b.out));
  const steps = [];
  let qty = 0;
  for (const e of events) {
    qty = Math.max(0, qty + e.delta);
    steps.push({ day: e.day, qty, fromCreation: e.fromCreation });
  }
  return steps;
}

/**
 * @param {{ assets: object[], priceAt: (id: string, day: string) => number|null,
 *   usdAt?: (day: string) => number|null, today: string }} input - assets from buildAssetLedgers
 * @returns {{ days: string[], toman: number[], usd: (number|null)[], gain: number[], gainUsd: number[],
 *   estimated: boolean, datedByCreation: boolean }|null}
 *   null when no entry has a date; `datedByCreation`: an entry with no date counted from the day it was
 *   recorded; `estimated`: some value is a stand-in (an asset with no price
 *   history, or a day before its history began, is valued at the nearest price known)
 */
export function buildPortfolioSeries({ assets = [], priceAt, usdAt, today }) {
  const prepared = assets.map((asset) => ({ asset, steps: quantitySteps(asset) })).filter((p) => p.steps.length);
  const dated = prepared.flatMap((p) => p.steps.map((s) => s.day)).filter(Boolean).sort();
  if (!dated.length || !today || dated[0] > today) return null;

  const days = daysBetween(dated[0], today);
  const rates = days.map((day) => (usdAt ? Number(usdAt(day)) || 0 : 0));
  const toman = new Array(days.length).fill(0);
  // What prices alone gained on each day for what was held the day before (buying adds no gain)
  const gain = new Array(days.length).fill(0);
  const gainUsd = new Array(days.length).fill(0);
  let estimated = false;
  // Some entries have no date: they count from the day they were recorded
  const datedByCreation = prepared.some((p) => p.steps.some((s) => s.fromCreation));

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
    let prevQty = 0;
    let prevPrice = 0;
    days.forEach((day, i) => {
      while (cursor < steps.length && steps[cursor].day <= day) qty = steps[cursor++].qty;
      let price;
      const known = scale > 0 ? priceAt(asset.assetId, day) : null;
      if (known > 0) price = known * scale;
      else {
        // No history for this asset or day: the nearest price known
        price = scale > 0 && firstPrice > 0 ? firstPrice * scale : todayPrice;
        if (qty > 0) estimated = true;
      }
      if (i > 0 && prevQty > 0) {
        gain[i] += prevQty * (price - prevPrice);
        if (rates[i] > 0 && rates[i - 1] > 0) gainUsd[i] += prevQty * (price / rates[i] - prevPrice / rates[i - 1]);
      }
      if (qty > 0) toman[i] += qty * price;
      prevQty = qty;
      prevPrice = price;
    });
  }

  const usd = days.map((day, i) => (rates[i] > 0 ? toman[i] / rates[i] : null));
  return { days, toman, usd, gain, gainUsd, estimated, datedByCreation };
}

/**
 * The change over the last `span` days: the value then and now, and what prices alone gained
 * meanwhile (money put in or taken out doesn't count as gain)
 * @param {object} series - from buildPortfolioSeries
 * @param {'toman'|'usd'} unit
 * @param {number} span - days back (1: since yesterday)
 * @returns {{ gain: number, pct: number|null }|null} null when the portfolio is younger than the span
 */
export function windowChange(series, unit, span) {
  const values = series?.[unit];
  const gains = series?.[unit === 'usd' ? 'gainUsd' : 'gain'];
  if (!values || !gains) return null;
  const end = values.length - 1;
  const start = end - span;
  if (start < 0 || !Number.isFinite(values[start])) return null;
  let gain = 0;
  for (let i = start + 1; i <= end; i++) gain += gains[i];
  return { gain, pct: values[start] > 0 ? (gain / values[start]) * 100 : null };
}

/** The last `count` days of a series (all of it when count is 0 or more than it has) */
export function sliceSeries(series, count) {
  if (!series || !count || count >= series.days.length) return series;
  const from = series.days.length - count;
  return { ...series, days: series.days.slice(from), toman: series.toman.slice(from), usd: series.usd.slice(from), gain: series.gain.slice(from), gainUsd: series.gainUsd.slice(from) };
}
