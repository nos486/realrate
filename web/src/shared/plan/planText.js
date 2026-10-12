/**
 * planText.js — The free plan's usage as short Persian lines («حساب: ۲ از ۲»), shared by the notes
 * on each section and the card on the home page
 */

import { PLAN_LIMITS, FREE_SMS_READS } from '../../config/planLimits.js';
import { smsFreeUsage } from '../native/smsPlan.js';

const faNum = (n) => Number(n).toLocaleString('fa-IR');

/** The sections' notes: the limits each one shows (keys of usage from GET /api/plan, or 'sms') */
export const SECTION_LIMITS = {
  expenses: ['entries'],
  incomes: ['entries'],
  projects: ['projects'],
  accounts: ['accounts'],
  loans: ['loans'],
  cheques: ['cheques'],
  subscriptions: ['subscriptions'],
  portfolio: ['portfolios', 'holdings'],
  sms: ['sms'],
};

const LABELS = { portfolios: 'پورتفو', sms: 'پیامک خوانده‌شده' };

export function describeLimit(key, usage) {
  if (key === 'sms') {
    const sms = smsFreeUsage();
    return `پیامک: ${faNum(sms.daily)} از ${faNum(FREE_SMS_READS.daily)} امروز · ${faNum(sms.monthly)} از ${faNum(FREE_SMS_READS.monthly)} این ماه`;
  }
  const label = LABELS[key] || PLAN_LIMITS[key]?.label || key;
  const u = usage[key];
  if (!u) return null;
  if (u.limit === 0) return `${label}: بسته`;
  const period = u.period === 'month' ? ' در این ماه' : '';
  return `${label}: ${faNum(Math.min(u.used, u.limit))} از ${faNum(u.limit)}${period}`;
}

