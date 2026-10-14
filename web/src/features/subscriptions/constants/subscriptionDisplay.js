/**
 * subscriptionDisplay.js — How a subscription is shown: its category's icon, its state's badge,
 * a price in its currency and when it renews (utils/subscriptionDocument.js for the figures)
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import { categoryIcon } from '../../../shared/categories/categoryIcons.js';
import { subscriptionCategoryOf, cycleOf } from '../../../utils/subscriptionDocument.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatMoney } from '../../../utils/currencies.js';

const fa = (n, digits = 0) => Number(n).toLocaleString(intlLocale(), { maximumFractionDigits: digits });

export const subscriptionIcon = (category) => categoryIcon(subscriptionCategoryOf(category).icon);

/**
 * A state as its row card shows it (shared/ui/RowCard.jsx tones): its badge's label and tone,
 * the row's own tone, and the tone of its period (the icon, the bar, the days left)
 */
export const STATE_BADGES = {
  active: { label: t('فعال'), badge: 'positive', row: '', period: 'primary' },
  due: { label: t('نزدیک تمدید'), badge: 'warning', row: 'warning', period: 'warning' },
  expired: { label: t('تمام شده — تمدید نشده'), badge: 'negative', row: 'negative', period: 'negative' },
  ended: { label: t('پایان‌یافته'), badge: '', row: 'muted', period: '' },
  paused: { label: t('متوقف'), badge: '', row: 'muted', period: '' },
  cancelled: { label: t('لغوشده'), badge: '', row: 'muted', period: '' },
};

/** «۹٫۹۹ دلار» / «۱۵ یورو» / «۱۵۰٬۰۰۰ تومان» (utils/currencies.js) */
export const formatSubscriptionAmount = (amount, currency) => formatMoney(amount, currency);

/** «ماهانه» / «هر ۳ ماه» */
export const cycleLabel = (months) => t(cycleOf(months).label);

/** «امروز» / «فردا» / «۵ روز دیگر» / «۳ روز پیش» */
export function daysLabel(days) {
  if (days === 0) return t('امروز');
  if (days === 1) return t('فردا');
  if (days === -1) return t('دیروز');
  return days > 0 ? t('{n} روز دیگر', { n: fa(days) }) : t('{n} روز پیش', { n: fa(-days) });
}

export const shamsiDay = (iso) => (iso ? formatShamsiDisplay(`${iso}T00:00:00`) : '');

/**
 * How long is left of a subscription's period (subscriptionPeriod): «۱۲ روز تا تمدید»,
 * «تمدید فردا», «پایان امروز», «۳ روز از تمدید گذشته»
 */
export function periodDaysLabel({ daysLeft, until }) {
  const end = until === 'end';
  if (daysLeft === 0) return end ? t('پایان امروز') : t('تمدید امروز');
  if (daysLeft === 1) return end ? t('پایان فردا') : t('تمدید فردا');
  if (daysLeft > 0) return end ? t('{n} روز تا پایان', { n: fa(daysLeft) }) : t('{n} روز تا تمدید', { n: fa(daysLeft) });
  return end ? t('{n} روز از پایان گذشته', { n: fa(-daysLeft) }) : t('{n} روز از تمدید گذشته', { n: fa(-daysLeft) });
}

/** «۴۰٪ مانده» — the share of the period still ahead */
export const periodLeftLabel = ({ progress }) => t('{n}٪ مانده', { n: fa(Math.round((1 - progress) * 100)) });
