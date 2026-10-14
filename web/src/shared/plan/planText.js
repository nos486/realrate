/**
 * planText.js — The free plan's usage as short Persian lines («حساب: ۲ از ۲»), shared by the notes
 * on each section and the card on the home page
 */

import { intlLocale, t } from '../../utils/i18n.js';
import { PLAN_LIMITS, FREE_SMS_READS } from '../../config/planLimits.js';
import { smsFreeUsage } from '../native/smsPlan.js';

const faNum = (n) => Number(n).toLocaleString(intlLocale());

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

const LABELS = { portfolios: t('پورتفو'), sms: t('پیامک خوانده‌شده') };

export function describeLimit(key, usage) {
  if (key === 'sms') {
    const sms = smsFreeUsage();
    return t('پیامک: {daily} از {dailyLimit} امروز · {monthly} از {monthlyLimit} این ماه', {
      daily: faNum(sms.daily),
      dailyLimit: faNum(FREE_SMS_READS.daily),
      monthly: faNum(sms.monthly),
      monthlyLimit: faNum(FREE_SMS_READS.monthly),
    });
  }
  const label = LABELS[key] || (PLAN_LIMITS[key]?.label ? t(PLAN_LIMITS[key].label) : key);
  const u = usage[key];
  if (!u) return null;
  if (u.limit === 0) return t('{label}: بسته', { label });
  const params = { label, used: faNum(Math.min(u.used, u.limit)), limit: faNum(u.limit) };
  return u.period === 'month' ? t('{label}: {used} از {limit} در این ماه', params) : t('{label}: {used} از {limit}', params);
}

