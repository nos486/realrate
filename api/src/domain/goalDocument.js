/**
 * goalDocument.js — The user's savings goals («اهداف»): what they save for, how much, by when,
 * and how far they are
 *
 * A goal is one end-to-end encrypted vault record ("goal"):
 *
 *   { id, name, icon (GOAL_ICONS), targetAmount (tomans), targetDate?, portfolioId?, notes?,
 *     deposits: [{ id, date, amount, note? }], createdAt, updatedAt }
 *
 * - deposits: what the user set aside by hand; a negative amount is a withdrawal.
 * - portfolioId: a portfolio whose value today counts toward the goal as well (the caller works
 *   the value out from the price book — the browser only; nothing here reads prices).
 * Progress (goalProgress) is saved = deposits' net + the linked portfolio's value, against the
 * target; with a target date it says what to set aside each month, and from the deposits of the
 * last months it estimates when the goal is reached at that pace (an estimate from the user's
 * own habit, never a price forecast).
 * Shared by the browser and the API, like the other domain modules.
 */

import { isValidIsoDate } from './isoDate.js';
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
};

/** The deposits of this many days make up the pace the estimate runs on */
export const PACE_DAYS = 90;
/** An estimate further than this many years away is not shown */
const MAX_ETA_YEARS = 50;

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const ICON_VALUES = new Set(GOAL_ICONS.map((i) => i.value));
const DAY_MS = 86_400_000;
const text = (v) => String(v ?? '').trim();
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && isValidIsoDate(v);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const addDays = (iso, days) => new Date((dayNumber(iso) + days) * DAY_MS).toISOString().slice(0, 10);

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

  const targetAmount = Math.round(num(body.targetAmount));
  if (targetAmount <= 0 || targetAmount > GOAL_LIMITS.maxAmount) return { error: t('مبلغ هدف باید عددی مثبت باشد.') };

  const targetDate = text(body.targetDate);
  if (targetDate && !isDay(targetDate)) return { error: t('تاریخ هدف نامعتبر است.') };

  const notes = text(body.notes);
  if (notes.length > GOAL_LIMITS.notesLength) return { error: t('یادداشت نباید بیشتر از {notesLength} کاراکتر باشد.', { notesLength: GOAL_LIMITS.notesLength }) };

  const rawDeposits = Array.isArray(body.deposits) ? body.deposits : [];
  if (rawDeposits.length > GOAL_LIMITS.maxDeposits) return { error: t('تعداد واریزهای یک هدف از حد مجاز بیشتر است.') };
  const seen = new Set();
  const deposits = [];
  for (const [i, d] of rawDeposits.entries()) {
    const amount = Math.round(num(d?.amount));
    if (!amount || Math.abs(amount) > GOAL_LIMITS.maxAmount) return { error: t('مبلغ واریز نامعتبر است.') };
    if (!isDay(text(d?.date))) return { error: t('تاریخ واریز نامعتبر است.') };
    let id = ID_RE.test(text(d?.id)) ? text(d.id) : `dep_${i}`;
    while (seen.has(id)) id = `${id}_`;
    seen.add(id);
    deposits.push({ id, date: text(d.date), amount, note: text(d?.note).slice(0, GOAL_LIMITS.noteLength) });
  }
  deposits.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  return {
    value: {
      name,
      icon: ICON_VALUES.has(body.icon) ? body.icon : GOAL_ICONS[0].value,
      targetAmount,
      targetDate,
      portfolioId: ID_RE.test(text(body.portfolioId)) ? text(body.portfolioId) : '',
      notes,
      deposits,
    },
  };
}

/** The net of a goal's deposits (withdrawals subtract) */
export const depositsTotal = (goal) => (goal?.deposits || []).reduce((sum, d) => sum + num(d.amount), 0);

/**
 * Where a goal stands today
 * @param {object} goal
 * @param {{ today: string, portfolioValue?: number }} context - today: YYYY-MM-DD; portfolioValue:
 *   the linked portfolio's value in tomans (0 when the goal links none or its value is unknown)
 * @returns {{ deposited: number, linked: number, saved: number, target: number, remaining: number,
 *   pct: number, reached: boolean, daysLeft: number|null, overdue: boolean, monthlyNeeded: number|null,
 *   monthlyPace: number, eta: string|null, onTrack: boolean|null }}
 *   pct: 0–100 (capped); daysLeft: to the target date (negative once past); monthlyNeeded: what to
 *   set aside each month to meet the target date; monthlyPace: the deposits' net per month over
 *   the last PACE_DAYS; eta: when the goal is reached at that pace; onTrack: the pace meets the
 *   target date (null with no date, or when reached)
 */
export function goalProgress(goal, { today, portfolioValue = 0 } = {}) {
  const target = num(goal?.targetAmount);
  const deposited = depositsTotal(goal);
  const linked = goal?.portfolioId ? Math.max(0, num(portfolioValue)) : 0;
  const saved = deposited + linked;
  const remaining = Math.max(0, target - saved);
  const reached = target > 0 && saved >= target;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((saved / target) * 100))) : 0;

  const hasDate = isDay(goal?.targetDate) && isDay(today);
  const daysLeft = hasDate ? dayNumber(goal.targetDate) - dayNumber(today) : null;
  const overdue = !reached && daysLeft !== null && daysLeft < 0;
  // Months left count from 30-day months, at least one: the last days still ask for the remainder
  const monthlyNeeded = !reached && daysLeft !== null && daysLeft >= 0 ? Math.ceil(remaining / Math.max(1, daysLeft / 30)) : null;

  let monthlyPace = 0;
  if (isDay(today)) {
    const from = addDays(today, -PACE_DAYS);
    const recent = (goal?.deposits || []).filter((d) => d.date > from && d.date <= today).reduce((sum, d) => sum + num(d.amount), 0);
    monthlyPace = Math.round(recent / (PACE_DAYS / 30));
  }
  let eta = null;
  if (!reached && monthlyPace > 0 && isDay(today)) {
    const days = Math.ceil((remaining / monthlyPace) * 30);
    if (days <= MAX_ETA_YEARS * 365) eta = addDays(today, days);
  }
  const onTrack = reached || daysLeft === null ? null : eta !== null && eta <= goal.targetDate;

  return { deposited, linked, saved, target, remaining, pct, reached, daysLeft, overdue, monthlyNeeded, monthlyPace, eta, onTrack };
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

/** What all the goals together hold against what they aim at */
export function goalTotals(goals, progressOf) {
  let saved = 0;
  let target = 0;
  let reached = 0;
  for (const goal of goals) {
    const p = progressOf(goal);
    target += p.target;
    saved += Math.min(p.saved, p.target);
    if (p.reached) reached += 1;
  }
  return { count: goals.length, reached, saved, target, pct: target > 0 ? Math.round((saved / target) * 100) : 0 };
}
