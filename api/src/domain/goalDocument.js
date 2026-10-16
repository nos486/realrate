/**
 * goalDocument.js — The user's savings goals («اهداف»): what they save for, how much, by when,
 * and how far they are
 *
 * A goal is one end-to-end encrypted vault record ("goal"):
 *
 *   { id, name, icon (GOAL_ICONS), currency (currencies.js), targetAmount (in that currency),
 *     targetDate?, notes?, deposits: [{ id, date, amount, currency, note? }],
 *     allocations: [{ id, date, portfolioId, assetId, assetName, unit, mode, value }],
 *     createdAt, updatedAt }
 *
 * - currency: what the target is in — tomans, dollars, euros… (a 300 dollar espresso machine).
 * - deposits: money set aside by hand, each in its own currency (2.5 million tomans, then 100
 *   dollars); a negative amount is a withdrawal. Worth today's rate of its currency.
 * - allocations: a share of a portfolio's asset reserved for the goal — a quantity (`mode:
 *   'amount'`: 2 grams of gold) or a percent of what the portfolio holds of it (`mode: 'percent'`).
 *   The asset stays in the portfolio, nothing is sold or spent; it counts at today's price, so the
 *   goal moves with the market. An asset's quantity goes to one goal at a time: goals are served in
 *   the order they were created and one that asks for more than is left gets what is left
 *   (resolveAllocations).
 * Progress (goalProgress) is saved = deposits + allocations, all in tomans at today's rates and then
 * in the goal's currency, against the target; with a target date it says what to set aside each
 * month, and from the deposits of the last months it estimates when the goal is reached at that
 * pace (an estimate from the user's own habit, never a price forecast). The caller works out the
 * assets' prices and the rates from the price book — in the browser; nothing here reads them.
 * Shared by the browser and the API, like the other domain modules.
 */

import { isValidIsoDate, tehranToday } from './isoDate.js';
import { normalizeCurrency, currencyRateToday, currencyOf } from './currencies.js';
import { t } from './i18n.js';

/** What a goal is for (icon names from categoryDocument.js's CATEGORY_ICON_NAMES) */
export const GOAL_ICONS = [
  { value: 'PiggyBank', label: t('پس‌انداز') },
  { value: 'Home', label: t('خانه') },
  { value: 'Car', label: t('خودرو') },
  { value: 'Plane', label: t('سفر') },
  { value: 'GraduationCap', label: t('تحصیل') },
  { value: 'Gift', label: t('هدیه و مراسم') },
  { value: 'Laptop', label: t('لپ‌تاپ و گجت') },
  { value: 'Briefcase', label: t('کسب‌وکار') },
  { value: 'Heart', label: t('سلامت') },
  { value: 'Star', label: t('سایر') },
];

export const GOAL_LIMITS = {
  nameLength: 80,
  notesLength: 300,
  noteLength: 100,
  maxAmount: 1e13,
  maxDeposits: 1000,
  maxAllocations: 100,
  assetNameLength: 80,
  unitLength: 30,
};

/** How an allocation says its share: a quantity of the asset, or a percent of what is held */
export const ALLOCATION_MODES = ['amount', 'percent'];

/** The deposits of this many days make up the pace the estimate runs on */
export const PACE_DAYS = 90;
/** An estimate further than this many years away is not shown */
const MAX_ETA_YEARS = 50;


const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const ICON_VALUES = new Set(GOAL_ICONS.map((i) => i.value));
const MODE_VALUES = new Set(ALLOCATION_MODES);
const DAY_MS = 86_400_000;
const text = (v) => String(v ?? '').trim();
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && isValidIsoDate(v);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const addDays = (iso, days) => new Date((dayNumber(iso) + days) * DAY_MS).toISOString().slice(0, 10);
/** An amount rounded to its currency's decimals (none for tomans, two otherwise) */
const roundIn = (amount, code) => {
  const k = 10 ** currencyOf(code).decimals;
  return Math.round(amount * k) / k;
};
const EPSILON = 1e-9;

/** The icon option of a goal (a safe default for a stored name that no longer exists) */
export const goalIconOf = (value) => GOAL_ICONS.find((i) => i.value === value) || GOAL_ICONS[0];

/**
 * Check and normalize a goal's input
 * @param {object} body
 * @returns {{ value?: object, error?: string }}
 */
export function validateGoal(body = {}) {
  const name = text(body.name);
  if (!name) return { error: t('نام هدف الزامی است.') };
  if (name.length > GOAL_LIMITS.nameLength) return { error: t('نام هدف نباید بیشتر از {nameLength} کاراکتر باشد.', { nameLength: GOAL_LIMITS.nameLength }) };

  const currency = normalizeCurrency(body.currency);
  const targetAmount = roundIn(num(body.targetAmount), currency);
  if (targetAmount <= 0 || targetAmount > GOAL_LIMITS.maxAmount) return { error: t('مبلغ هدف باید عددی مثبت باشد.') };

  const targetDate = text(body.targetDate);
  if (targetDate && !isDay(targetDate)) return { error: t('تاریخ هدف نامعتبر است.') };

  const notes = text(body.notes);
  if (notes.length > GOAL_LIMITS.notesLength) return { error: t('یادداشت نباید بیشتر از {notesLength} کاراکتر باشد.', { notesLength: GOAL_LIMITS.notesLength }) };

  const rawDeposits = Array.isArray(body.deposits) ? body.deposits : [];
  if (rawDeposits.length > GOAL_LIMITS.maxDeposits) return { error: t('تعداد واریزهای یک هدف از حد مجاز بیشتر است.') };
  const seen = new Set();
  const uniqueId = (raw, fallback) => {
    let id = ID_RE.test(text(raw)) ? text(raw) : fallback;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    return id;
  };
  const deposits = [];
  for (const [i, d] of rawDeposits.entries()) {
    const depositCurrency = normalizeCurrency(d?.currency);
    const amount = roundIn(num(d?.amount), depositCurrency);
    if (!amount || Math.abs(amount) > GOAL_LIMITS.maxAmount) return { error: t('مبلغ واریز نامعتبر است.') };
    if (!isDay(text(d?.date))) return { error: t('تاریخ واریز نامعتبر است.') };
    deposits.push({ id: uniqueId(d?.id, `dep_${i}`), date: text(d.date), amount, currency: depositCurrency, note: text(d?.note).slice(0, GOAL_LIMITS.noteLength) });
  }
  deposits.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const rawAllocations = Array.isArray(body.allocations) ? body.allocations : [];
  if (rawAllocations.length > GOAL_LIMITS.maxAllocations) return { error: t('تعداد دارایی‌های اختصاص‌یافته به یک هدف از حد مجاز بیشتر است.') };
  const allocations = [];
  for (const [i, a] of rawAllocations.entries()) {
    const mode = MODE_VALUES.has(a?.mode) ? a.mode : 'amount';
    const value = num(a?.value);
    const assetId = text(a?.assetId);
    if (!ID_RE.test(text(a?.portfolioId)) || !assetId || assetId.length > GOAL_LIMITS.assetNameLength) return { error: t('دارایی اختصاص‌یافته نامعتبر است.') };
    if (value <= 0 || value > GOAL_LIMITS.maxAmount || (mode === 'percent' && value > 100)) return { error: t('مقدار یا درصد اختصاص نامعتبر است.') };
    allocations.push({
      id: uniqueId(a?.id, `alc_${i}`),
      date: isDay(text(a?.date)) ? text(a.date) : tehranToday(),
      portfolioId: text(a.portfolioId),
      assetId,
      assetName: text(a?.assetName).slice(0, GOAL_LIMITS.assetNameLength),
      unit: text(a?.unit).slice(0, GOAL_LIMITS.unitLength),
      mode,
      value: mode === 'percent' ? Math.round(value * 100) / 100 : Math.round(value * 1e6) / 1e6,
    });
  }

  return {
    value: {
      name,
      icon: ICON_VALUES.has(body.icon) ? body.icon : GOAL_ICONS[0].value,
      currency,
      targetAmount,
      targetDate,
      notes,
      deposits,
      allocations,
    },
  };
}

/** The key of one asset of one portfolio (what allocations point at) */
export const assetKey = (portfolioId, assetId) => `${portfolioId}|${assetId}`;

/**
 * Work out what each goal's allocations are worth now. Goals are served in the order they were
 * created, so an asset's quantity goes to one goal at a time: an allocation that asks for more than
 * is left gets what is left; a percent is of everything the portfolio holds of the asset.
 * @param {object[]} goals
 * @param {Map<string, { amount: number, unitPrice: number }>} assets - by assetKey: the quantity
 *   held and the price of one unit in tomans (an asset the portfolio no longer holds is missing)
 * @returns {{ byGoal: Map<string, Array<{ id: string, date: string, quantity: number, toman: number, missing: boolean }>>,
 *   leftOf: (portfolioId: string, assetId: string) => number }} leftOf: the quantity no goal has taken
 */
export function resolveAllocations(goals, assets) {
  const left = new Map([...assets].map(([key, a]) => [key, Math.max(0, num(a.amount))]));
  const byGoal = new Map();
  const ordered = [...goals].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
  for (const goal of ordered) {
    const list = [];
    for (const alloc of goal.allocations || []) {
      const key = assetKey(alloc.portfolioId, alloc.assetId);
      const held = assets.get(key);
      if (!held) {
        list.push({ id: alloc.id, date: alloc.date, quantity: 0, toman: 0, missing: true });
        continue;
      }
      const wanted = alloc.mode === 'percent' ? (Math.max(0, num(held.amount)) * num(alloc.value)) / 100 : num(alloc.value);
      const quantity = Math.max(0, Math.min(wanted, left.get(key) ?? 0));
      left.set(key, (left.get(key) ?? 0) - quantity);
      list.push({ id: alloc.id, date: alloc.date, quantity, toman: quantity * num(held.unitPrice), missing: false });
    }
    byGoal.set(goal.id, list);
  }
  return { byGoal, leftOf: (portfolioId, assetId) => Math.max(0, left.get(assetKey(portfolioId, assetId)) ?? 0) };
}

/** What a deposit is worth now in tomans at today's rates (0 when its currency has no rate) */
const depositToman = (d, rates) => num(d.amount) * currencyRateToday(d.currency, rates);

/**
 * Where a goal stands today, in its own currency
 * @param {object} goal
 * @param {{ today: string, rates?: object, allocations?: Array<{ date: string, toman: number }> }} context -
 *   today: YYYY-MM-DD; rates: today's rates bag (currencies.js); allocations: this goal's resolved
 *   allocations (resolveAllocations)
 * @returns {{ deposited: number, allocated: number, saved: number, target: number, remaining: number,
 *   savedToman: number, targetToman: number, pct: number, reached: boolean, daysLeft: number|null,
 *   overdue: boolean, monthlyNeeded: number|null, monthlyPace: number, eta: string|null,
 *   onTrack: boolean|null, unpriced: boolean }}
 *   deposited / allocated / saved / remaining: in the goal's currency; pct: 0–100 (capped);
 *   daysLeft: to the target date (negative once past); monthlyNeeded: what to set aside each month
 *   to meet the target date; monthlyPace: the net set aside per month over the last PACE_DAYS;
 *   eta: when the goal is reached at that pace; onTrack: the pace meets the target date (null
 *   with no date, or when reached); unpriced: the goal's currency has no rate now, so nothing can
 *   be shown against its target
 */
export function goalProgress(goal, { today, rates = {}, allocations = [] } = {}) {
  const currency = normalizeCurrency(goal?.currency);
  const rate = currencyRateToday(currency, rates);
  const unpriced = rate <= 0;
  const target = num(goal?.targetAmount);
  const toGoal = (toman) => (unpriced ? 0 : toman / rate);

  const depositedToman = (goal?.deposits || []).reduce((sum, d) => sum + depositToman(d, rates), 0);
  const allocatedToman = allocations.reduce((sum, a) => sum + num(a.toman), 0);
  const savedToman = depositedToman + allocatedToman;
  const deposited = toGoal(depositedToman);
  const allocated = toGoal(allocatedToman);
  const saved = toGoal(savedToman);
  const remaining = Math.max(0, target - saved);
  const reached = !unpriced && target > 0 && saved + EPSILON >= target;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((saved / target) * 100))) : 0;
  const targetToman = target * (unpriced ? 0 : rate);

  const hasDate = isDay(goal?.targetDate) && isDay(today);
  const daysLeft = hasDate ? dayNumber(goal.targetDate) - dayNumber(today) : null;
  const overdue = !reached && daysLeft !== null && daysLeft < 0;
  // Months left count from 30-day months, at least one: the last days still ask for the remainder
  const monthlyNeeded = !reached && !unpriced && daysLeft !== null && daysLeft >= 0
    ? roundIn(remaining / Math.max(1, daysLeft / 30), currency) : null;

  let monthlyPace = 0;
  if (isDay(today) && !unpriced) {
    const from = addDays(today, -PACE_DAYS);
    const inWindow = (d) => d.date > from && d.date <= today;
    const recentToman = (goal?.deposits || []).filter(inWindow).reduce((sum, d) => sum + depositToman(d, rates), 0)
      + allocations.filter(inWindow).reduce((sum, a) => sum + num(a.toman), 0);
    monthlyPace = roundIn(toGoal(recentToman) / (PACE_DAYS / 30), currency);
  }
  let eta = null;
  if (!reached && !unpriced && monthlyPace > 0 && isDay(today)) {
    const days = Math.ceil((remaining / monthlyPace) * 30);
    if (days <= MAX_ETA_YEARS * 365) eta = addDays(today, days);
  }
  const onTrack = reached || daysLeft === null ? null : eta !== null && eta <= goal.targetDate;

  return { deposited, allocated, saved, target, remaining, savedToman, targetToman, pct, reached, daysLeft, overdue, monthlyNeeded, monthlyPace, eta, onTrack, unpriced };
}

/** Goals on the list: the nearest target date first, ones without a date after them; reached ones last */
export function compareGoals(progressOf) {
  return (a, b) => {
    const ra = progressOf(a).reached;
    const rb = progressOf(b).reached;
    if (ra !== rb) return ra ? 1 : -1;
    const da = a.targetDate || '9999-12-31';
    const db = b.targetDate || '9999-12-31';
    return da.localeCompare(db) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  };
}

/** What all the goals together hold against what they aim at, in tomans at today's rates */
export function goalTotals(goals, progressOf) {
  let saved = 0;
  let target = 0;
  let reached = 0;
  for (const goal of goals) {
    const p = progressOf(goal);
    target += p.targetToman;
    saved += Math.min(p.savedToman, p.targetToman);
    if (p.reached) reached += 1;
  }
  return { count: goals.length, reached, saved, target, pct: target > 0 ? Math.round((saved / target) * 100) : 0 };
}
