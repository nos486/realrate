/**
 * subscriptionDocument.js — The user's subscriptions («اشتراک‌ها»): what each costs, how often it
 * renews, and where it stands today
 *
 * A subscription is one end-to-end encrypted vault record ("subscription"):
 *
 *   { id, name, category, amount, currency (currencies.js), cycleMonths: 1|3|6|12, startDate,
 *     endDate?, autoRenew, renewOn?, status: 'active'|'paused'|'cancelled', cancelledOn?,
 *     accountId?, url?, notes?, remindersMuted, lastPaidOn?, createdAt, updatedAt }
 *
 * - startDate: the first payment day; renewals fall every `cycleMonths` after it, on its Shamsi
 *   day of the month (clamped to shorter months), as loans' installments do (loanCalculator.js).
 * - autoRenew: the service charges by itself — the next renewal is always the first one on or
 *   after today. Without it the user renews by hand: `renewOn` is the day it runs out, and moves a
 *   cycle on when they record the renewal's payment (renewedAfter: from the payment day when it
 *   had already run out); past it, the subscription has run out ('expired') until renewed.
 * - endDate: the last day it runs (a prepaid plan, or one cancelled at the period's end): no
 *   renewal on or after it. Past it, the subscription has ended.
 * - A payment is an ordinary expense in the everyday section, category «اینترنت و اشتراک‌ها»
 *   (SUBSCRIPTION_EXPENSE_CATEGORY), in the subscription's currency, naming it (`subscriptionId`).
 *
 * Totals (subscriptionTotals) count what is running — active and not ended — as a monthly
 * equivalent (amount ÷ cycle months), each currency apart and in tomans at the given dollar rate.
 * The reminder index (reminders.js) gets the next renewal; the cron sends the email digest from it.
 * Shared by the browser and the API, like the other domain modules.
 */

import { computeClampedDueDate, parseDateParts } from './loanCalculator.js';
import { isValidIsoDate } from './isoDate.js';
import { CURRENCY_CODES, normalizeCurrency, currencyRateToday } from './currencies.js';

/** How often a subscription renews (months between payments) */
export const SUBSCRIPTION_CYCLES = [
  { months: 1, label: 'ماهانه', short: 'ماه' },
  { months: 3, label: 'سه‌ماهه', short: '۳ ماه' },
  { months: 6, label: 'شش‌ماهه', short: '۶ ماه' },
  { months: 12, label: 'سالانه', short: 'سال' },
];

/** What a subscription is for (icon names from categoryDocument.js's CATEGORY_ICON_NAMES) */
export const SUBSCRIPTION_CATEGORIES = [
  { value: 'video', label: 'فیلم و سریال', icon: 'Film' },
  { value: 'music', label: 'موسیقی و پادکست', icon: 'Music' },
  { value: 'software', label: 'نرم‌افزار و هوش مصنوعی', icon: 'Laptop' },
  { value: 'cloud', label: 'فضای ابری و سرور', icon: 'Zap' },
  { value: 'internet', label: 'اینترنت و سیم‌کارت', icon: 'Wifi' },
  { value: 'gaming', label: 'بازی', icon: 'Gamepad2' },
  { value: 'education', label: 'آموزش و مطالعه', icon: 'Book' },
  { value: 'fitness', label: 'ورزش و باشگاه', icon: 'Dumbbell' },
  { value: 'membership', label: 'عضویت و خدمات', icon: 'Users' },
  { value: 'other', label: 'سایر', icon: 'Tag' },
];

export const SUBSCRIPTION_STATUSES = [
  { value: 'active', label: 'فعال' },
  { value: 'paused', label: 'متوقف' },
  { value: 'cancelled', label: 'لغوشده' },
];

/** The expense category a subscription's payment is recorded in (categoryDocument.js) */
export const SUBSCRIPTION_EXPENSE_CATEGORY = 'subscriptions';

/** In-app alerts: renewals this many days ahead */
export const SUBSCRIPTION_REMINDER_DAYS = 7;

export const SUBSCRIPTION_LIMITS = {
  nameLength: 80,
  notesLength: 300,
  urlLength: 200,
  maxAmount: 1e13,
};

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CYCLE_MONTHS = new Set(SUBSCRIPTION_CYCLES.map((c) => c.months));
const CATEGORY_VALUES = new Set(SUBSCRIPTION_CATEGORIES.map((c) => c.value));
const STATUS_VALUES = new Set(SUBSCRIPTION_STATUSES.map((s) => s.value));
const text = (v) => String(v ?? '').trim();
const isDay = (v) => DATE_RE.test(String(v || '')) && isValidIsoDate(v);
const num = (v) => Number(String(v ?? '').replace(/[,\s]/g, ''));

export const cycleOf = (months) => SUBSCRIPTION_CYCLES.find((c) => c.months === months) || SUBSCRIPTION_CYCLES[0];
export const subscriptionCategoryOf = (value) =>
  SUBSCRIPTION_CATEGORIES.find((c) => c.value === value) || SUBSCRIPTION_CATEGORIES[SUBSCRIPTION_CATEGORIES.length - 1];

/**
 * Validate & normalize a subscription
 * @param {object} body
 * @returns {{ value?: object, error?: string }}
 */
export function validateSubscription(body = {}) {
  const name = text(body.name);
  if (!name) return { error: 'نام اشتراک الزامی است.' };
  if (name.length > SUBSCRIPTION_LIMITS.nameLength) return { error: `نام اشتراک نباید بیشتر از ${SUBSCRIPTION_LIMITS.nameLength} کاراکتر باشد.` };

  const amount = Math.round(num(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > SUBSCRIPTION_LIMITS.maxAmount) return { error: 'هزینه‌ی اشتراک باید عددی مثبت باشد.' };
  const currency = normalizeCurrency(body.currency);

  const cycleMonths = Number(body.cycleMonths);
  if (!CYCLE_MONTHS.has(cycleMonths)) return { error: 'دوره‌ی تمدید نامعتبر است.' };

  const startDate = text(body.startDate);
  if (!isDay(startDate)) return { error: 'تاریخ شروع اشتراک نامعتبر است.' };
  const endDate = text(body.endDate);
  if (endDate && !isDay(endDate)) return { error: 'تاریخ پایان اشتراک نامعتبر است.' };
  if (endDate && endDate <= startDate) return { error: 'تاریخ پایان باید بعد از شروع باشد.' };

  const autoRenew = body.autoRenew !== false;
  // Renewed by hand: the day it runs out (the first renewal after the start, unless given)
  const renewOn = autoRenew ? '' : (isDay(text(body.renewOn)) ? text(body.renewOn) : renewalAt(startDate, cycleMonths, 1));

  const status = STATUS_VALUES.has(body.status) ? body.status : 'active';
  const cancelledOn = status === 'cancelled' && isDay(text(body.cancelledOn)) ? text(body.cancelledOn) : '';

  const url = text(body.url);
  if (url && (url.length > SUBSCRIPTION_LIMITS.urlLength || !/^https?:\/\/\S+$/i.test(url))) return { error: 'نشانی سایت باید با http:// یا https:// شروع شود.' };
  const notes = text(body.notes);
  if (notes.length > SUBSCRIPTION_LIMITS.notesLength) return { error: `یادداشت نباید بیشتر از ${SUBSCRIPTION_LIMITS.notesLength} کاراکتر باشد.` };

  return {
    value: {
      name,
      category: CATEGORY_VALUES.has(body.category) ? body.category : 'other',
      amount,
      currency,
      cycleMonths,
      startDate,
      endDate,
      autoRenew,
      renewOn,
      status,
      cancelledOn,
      accountId: ID_RE.test(text(body.accountId)) ? text(body.accountId) : '',
      url,
      notes,
      remindersMuted: Boolean(body.remindersMuted),
      lastPaidOn: isDay(text(body.lastPaidOn)) ? text(body.lastPaidOn) : '',
    },
  };
}

/** The `k`-th renewal after `startDate` (k = 0 is the start), on its Shamsi day of the month */
export function renewalAt(startDate, cycleMonths, k) {
  return k === 0 ? startDate : computeClampedDueDate(parseDateParts(startDate), k, cycleMonths);
}

/** Its renewals in [from, to] (inclusive), before its end date */
export function renewalsBetween(sub, from, to) {
  const out = [];
  for (let k = 0; k < 2400; k++) {
    const day = renewalAt(sub.startDate, sub.cycleMonths, k);
    if (day > to || (sub.endDate && day >= sub.endDate)) break;
    if (day >= from) out.push(day);
  }
  return out;
}

/** The first renewal on or after `date` (before its end), or '' when there is none */
export function renewalOnOrAfter(sub, date) {
  for (let k = 0; k < 2400; k++) {
    const day = renewalAt(sub.startDate, sub.cycleMonths, k);
    if (sub.endDate && day >= sub.endDate) return '';
    if (day >= date) return day;
  }
  return '';
}

/**
 * After a renewal's payment: a subscription renewed by hand runs one more cycle — from the day it
 * ran out when paid by then, or from the payment day when paid after it had run out (a new period
 * starts then)
 * @returns {{ renewOn: string, lastPaidOn: string }} the fields to save
 */
export function renewedAfter(sub, paidOn) {
  if (sub.autoRenew) return { renewOn: '', lastPaidOn: paidOn };
  const runsOut = sub.renewOn || renewalAt(sub.startDate, sub.cycleMonths, 1);
  const from = paidOn > runsOut ? paidOn : runsOut;
  return { renewOn: renewalAt(from, sub.cycleMonths, 1), lastPaidOn: paidOn };
}

/**
 * The payments a subscription should have recorded as expenses by `today` and hasn't — every
 * subscription has its spending in the expenses (web/src/shared/vault/spendingRecords.js):
 *  - none recorded yet (no `lastPaidOn`): the one that pays its current period — the last renewal
 *    on or before today for one that renews by itself, the start of its validity for one renewed
 *    by hand (a new subscription's first payment; never a backlog of older ones)
 *  - one that renews by itself: then every renewal after the last one recorded, through today
 *  - one renewed by hand: later payments are the user's («ثبت پرداخت»)
 * Nothing for a paused or cancelled one, before its start, or on or after its end.
 * @returns {string[]} the payment days, oldest first
 */
export function duePayments(sub, today) {
  if (!sub || sub.status !== 'active' || !sub.startDate || sub.startDate > today) return [];
  const inRun = (day) => day <= today && (!sub.endDate || day < sub.endDate);
  if (!sub.lastPaidOn) {
    if (!sub.autoRenew) {
      const runsOut = sub.renewOn || renewalAt(sub.startDate, sub.cycleMonths, 1);
      const before = computeClampedDueDate(parseDateParts(runsOut), -1, sub.cycleMonths);
      const from = before < sub.startDate ? sub.startDate : before;
      return inRun(from) ? [from] : [];
    }
    let current = '';
    for (let k = 0; k < 2400; k++) {
      const day = renewalAt(sub.startDate, sub.cycleMonths, k);
      if (!inRun(day)) break;
      current = day;
    }
    return current ? [current] : [];
  }
  if (!sub.autoRenew) return [];
  const out = [];
  for (let k = 0; k < 2400; k++) {
    const day = renewalAt(sub.startDate, sub.cycleMonths, k);
    if (!inRun(day)) break;
    if (day > sub.lastPaidOn) out.push(day);
  }
  return out;
}

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * Where a subscription stands on `today`
 * @returns {{ state: 'active'|'due'|'expired'|'ended'|'paused'|'cancelled', nextRenewal: string,
 *   daysLeft: number|null, running: boolean, monthly: number, endsSoon: boolean }}
 *   running: counted in the totals; monthly: its monthly equivalent in its own currency
 */
export function subscriptionView(sub, today) {
  const monthly = sub.amount / sub.cycleMonths;
  const base = { monthly, endsSoon: false };
  if (sub.status === 'cancelled') return { ...base, state: 'cancelled', nextRenewal: '', daysLeft: null, running: false };
  if (sub.endDate && sub.endDate <= today) return { ...base, state: 'ended', nextRenewal: '', daysLeft: null, running: false };
  if (sub.status === 'paused') return { ...base, state: 'paused', nextRenewal: '', daysLeft: null, running: false };

  const nextRenewal = sub.autoRenew ? renewalOnOrAfter(sub, today) : (sub.renewOn || '');
  const endsSoon = Boolean(sub.endDate) && daysBetween(today, sub.endDate) <= SUBSCRIPTION_REMINDER_DAYS;
  if (!nextRenewal) return { ...base, state: 'active', nextRenewal: '', daysLeft: null, running: true, endsSoon };
  const daysLeft = daysBetween(today, nextRenewal);
  const state = daysLeft < 0 ? 'expired' : daysLeft <= SUBSCRIPTION_REMINDER_DAYS ? 'due' : 'active';
  return { ...base, state, nextRenewal, daysLeft, running: state !== 'expired', endsSoon };
}

/**
 * The period a subscription is in on `today` — from its last renewal (or the day a hand renewal
 * was paid) to its next renewal, or to its end date when it ends first — and how far through it
 * today is, for the card's progress bar. Paused, cancelled and ended ones have none.
 * @returns {{ from: string, to: string, until: 'renewal'|'end', daysLeft: number,
 *   totalDays: number, progress: number }|null} progress: 0…1 of the period gone by
 */
export function subscriptionPeriod(sub, today) {
  const view = subscriptionView(sub, today);
  if (!view.running && view.state !== 'expired') return null;
  let to = view.nextRenewal;
  let until = 'renewal';
  if (sub.endDate && (!to || sub.endDate < to)) {
    to = sub.endDate;
    until = 'end';
  }
  if (!to) return null;

  // Its last renewal on or before today; a hand renewal's period starts a cycle before it runs out
  let from = '';
  if (sub.autoRenew) {
    for (let k = 0; k < 2400; k++) {
      const day = renewalAt(sub.startDate, sub.cycleMonths, k);
      if (day > today || day >= to) break;
      from = day;
    }
  } else {
    from = computeClampedDueDate(parseDateParts(sub.renewOn || to), -1, sub.cycleMonths);
    if (from < sub.startDate) from = sub.startDate;
  }
  if (!from || from > today) from = '';

  const daysLeft = daysBetween(today, to);
  const totalDays = from ? Math.max(daysBetween(from, to), 1) : Math.max(daysLeft, 1);
  const gone = from ? daysBetween(from, today) / totalDays : 0;
  return { from, to, until, daysLeft, totalDays, progress: Math.min(Math.max(gone, 0), 1) };
}

/**
 * The totals of what is running: a monthly equivalent per currency and in tomans, a year of it,
 * and what renews in [monthFrom, monthTo] (a Shamsi month). Foreign amounts are in tomans at
 * today's rate (the rates bag, currencies.js).
 * @param {object[]} subs
 * @param {{ today: string, usdToman?: number, rateToday?: Function, monthFrom?: string, monthTo?: string }} options
 * @returns {{ count: number, monthly: Totals, yearly: Totals, month: Totals & { count: number },
 *   byCategory: { category: string, toman: number, count: number }[] }}
 *   Totals: `toman`, and the amount in each currency by its code (IRT, USD, EUR, ...)
 */
export function subscriptionTotals(subs = [], { today, monthFrom = '', monthTo = '', ...rates } = {}) {
  const toToman = (amount, currency) => amount * currencyRateToday(currency, rates);
  const empty = () => ({ ...Object.fromEntries(CURRENCY_CODES.map((c) => [c, 0])), toman: 0 });
  const monthly = empty();
  const month = { count: 0, ...empty() };
  const byCategory = new Map();
  let count = 0;
  for (const sub of subs) {
    const view = subscriptionView(sub, today);
    if (!view.running) continue;
    count++;
    const currency = normalizeCurrency(sub.currency);
    monthly[currency] += view.monthly;
    monthly.toman += toToman(view.monthly, currency);
    const cat = byCategory.get(sub.category) || { category: sub.category, toman: 0, count: 0 };
    cat.toman += toToman(view.monthly, currency);
    cat.count++;
    byCategory.set(sub.category, cat);
    if (monthFrom && monthTo) {
      const renewals = sub.autoRenew
        ? renewalsBetween(sub, monthFrom, monthTo)
        : (sub.renewOn >= monthFrom && sub.renewOn <= monthTo ? [sub.renewOn] : []);
      month.count += renewals.length;
      month[currency] += renewals.length * sub.amount;
      month.toman += renewals.length * toToman(sub.amount, currency);
    }
  }
  const year = (v) => v * 12;
  return {
    count,
    monthly,
    yearly: Object.fromEntries(Object.entries(monthly).map(([k, v]) => [k, year(v)])),
    month,
    byCategory: [...byCategory.values()].sort((a, b) => b.toman - a.toman),
  };
}

/** Soonest renewal first; those without one (paused, ended, cancelled) after, by name */
export function compareSubscriptions(today) {
  const rank = { expired: 0, due: 1, active: 2, paused: 3, ended: 4, cancelled: 5 };
  return (a, b) => {
    const va = subscriptionView(a, today);
    const vb = subscriptionView(b, today);
    return (rank[va.state] - rank[vb.state])
      || String(va.nextRenewal || '9999').localeCompare(String(vb.nextRenewal || '9999'))
      || String(a.name).localeCompare(String(b.name), 'fa');
  };
}
