/**
 * planLimits.js — What the free plan allows; the Pro plan (the "pro" user group) has no limits
 *
 * A user is on Pro when the admin put them in the Pro group (admins and the demo account are never
 * limited). Everything not listed here that a feature flag (config/features.js) restricts to the
 * Pro group is closed to free users altogether.
 *
 * Each limit is a count of the user's records of some vault kinds (the server sees a record's kind,
 * its date and its id, never its content):
 * - `total`: records the user may have at once (0 closes the section to new records)
 * - `monthly`: records first stored in the current Shamsi month (Tehran), all `kinds` together
 * Editing an existing record never counts; a free user keeps and can read everything they have.
 * The limits are enforced by the server (lib/planLimits.js) and shown by the web app, which shares
 * this file through a symlink.
 */

import { PRO_GROUP_KEY } from '../domain/userGroups.js';

export { PRO_GROUP_KEY };

/** @type {Record<string, { label: string, kinds: string[], total?: number, monthly?: number }>} */
export const PLAN_LIMITS = {
  entries: { label: 'هزینه و درآمد', kinds: ['expense', 'income'], monthly: 30 },
  accounts: { label: 'حساب', kinds: ['bank_account'], total: 2 },
  projects: { label: 'پروژه', kinds: ['expense_group'], total: 1 },
  loans: { label: 'وام', kinds: ['loan'], total: 2 },
  cheques: { label: 'چک', kinds: ['cheque'], total: 0 },
  subscriptions: { label: 'اشتراک', kinds: ['subscription'], total: 0 },
  transfers: { label: 'انتقال بین حساب‌ها', kinds: ['transfer'], total: 0 },
  recurring_incomes: { label: 'درآمد تکرارشونده', kinds: ['recurring_income'], total: 0 },
  holdings: { label: 'دارایی در پورتفو', kinds: ['holding'], total: 10 },
};

/** Portfolios a free user may have (a portfolio is not a vault record: handlers/portfolioRoutes.js) */
export const FREE_PORTFOLIOS = 1;

/** Bank messages the Android app may read for a free user (counted on the device) */
export const FREE_SMS_READS = { daily: 3, monthly: 30 };

/** Whether the user is on the Pro plan (or is never limited: an admin, the demo account) */
export function isProUser(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.isAdmin || user.demo || user.isDemo || String(user.kind || '').startsWith('demo_')) return true;
  return Array.isArray(user.groups) && user.groups.includes(PRO_GROUP_KEY);
}

/** The limit key that covers a vault kind, or null when the kind is free of limits */
export function planLimitKeyOfKind(kind) {
  return Object.keys(PLAN_LIMITS).find((key) => PLAN_LIMITS[key].kinds.includes(kind)) || null;
}

/**
 * The comparison shown on the Pro page: each row says what the free plan gives and what Pro gives
 * `news`: a row about the Persian-only news, left out where the language has none (`hasNews`)
 * @type {Array<{ label: string, free: string, pro: string, news?: boolean }>}
 */
export const PLAN_COMPARISON = [
  { label: 'هزینه و درآمد', free: `${PLAN_LIMITS.entries.monthly} ثبت در ماه (روی هم)`, pro: 'نامحدود' },
  { label: 'خواندن پیامک بانک (اندروید)', free: `${FREE_SMS_READS.daily} در روز، ${FREE_SMS_READS.monthly} در ماه`, pro: 'نامحدود' },
  { label: 'حساب‌ها', free: `${PLAN_LIMITS.accounts.total} حساب`, pro: 'نامحدود، چندارزی' },
  { label: 'پروژه‌ها', free: `${PLAN_LIMITS.projects.total} پروژه`, pro: 'نامحدود' },
  { label: 'وام‌ها', free: `${PLAN_LIMITS.loans.total} وام`, pro: 'نامحدود' },
  { label: 'چک‌ها', free: 'بسته', pro: 'نامحدود، با اسکن هوشمند' },
  { label: 'اشتراک‌ها', free: 'بسته', pro: 'نامحدود، با یادآوری' },
  { label: 'پورتفو', free: `${FREE_PORTFOLIOS} پورتفو با ${PLAN_LIMITS.holdings.total} دارایی`, pro: 'نامحدود' },
  { label: 'انتقال بین حساب‌ها', free: 'بسته', pro: 'باز' },
  { label: 'ورود گردش حساب از فایل بانک', free: 'بسته', pro: 'باز' },
  { label: 'اخبار و اعلان خبر مهم', free: 'بسته', pro: 'باز', news: true },
  { label: 'گزارش‌های سالانه', free: 'بسته', pro: 'باز' },
  { label: 'ویجت اندروید', free: 'بسته', pro: 'باز' },
  { label: 'صفحه‌ی نرخ و حباب', free: 'بسته', pro: 'باز' },
  { label: 'یادآوری ایمیلی سررسیدها', free: 'بسته', pro: 'باز' },
];
