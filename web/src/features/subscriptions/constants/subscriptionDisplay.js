/**
 * subscriptionDisplay.js — How a subscription is shown: its category's icon, its state's badge,
 * a price in its currency and when it renews (utils/subscriptionDocument.js for the figures)
 */

import { categoryIcon } from '../../../shared/categories/categoryIcons.js';
import { subscriptionCategoryOf, cycleOf } from '../../../utils/subscriptionDocument.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';

const fa = (n, digits = 0) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: digits });

export const subscriptionIcon = (category) => categoryIcon(subscriptionCategoryOf(category).icon);

/**
 * A state as its row card shows it (shared/ui/RowCard.jsx tones): its badge's label and tone,
 * the row's own tone, and the tone of its period (the icon, the bar, the days left)
 */
export const STATE_BADGES = {
  active: { label: 'فعال', badge: 'positive', row: '', period: 'primary' },
  due: { label: 'نزدیک تمدید', badge: 'warning', row: 'warning', period: 'warning' },
  expired: { label: 'تمام شده — تمدید نشده', badge: 'negative', row: 'negative', period: 'negative' },
  ended: { label: 'پایان‌یافته', badge: '', row: 'muted', period: '' },
  paused: { label: 'متوقف', badge: '', row: 'muted', period: '' },
  cancelled: { label: 'لغوشده', badge: '', row: 'muted', period: '' },
};

/** «۹٫۹۹ دلار» / «۱۵۰٬۰۰۰ تومان» */
export function formatSubscriptionAmount(amount, currency) {
  return currency === 'USD' ? `${fa(amount, 2)} دلار` : `${fa(amount)} تومان`;
}

/** «ماهانه» / «هر ۳ ماه» */
export const cycleLabel = (months) => cycleOf(months).label;

/** «امروز» / «فردا» / «۵ روز دیگر» / «۳ روز پیش» */
export function daysLabel(days) {
  if (days === 0) return 'امروز';
  if (days === 1) return 'فردا';
  if (days === -1) return 'دیروز';
  return days > 0 ? `${fa(days)} روز دیگر` : `${fa(-days)} روز پیش`;
}

export const shamsiDay = (iso) => (iso ? formatShamsiDisplay(`${iso}T00:00:00`) : '');

/**
 * How long is left of a subscription's period (subscriptionPeriod): «۱۲ روز تا تمدید»,
 * «تمدید فردا», «پایان امروز», «۳ روز از تمدید گذشته»
 */
export function periodDaysLabel({ daysLeft, until }) {
  const what = until === 'end' ? 'پایان' : 'تمدید';
  if (daysLeft === 0) return `${what} امروز`;
  if (daysLeft === 1) return `${what} فردا`;
  return daysLeft > 0 ? `${fa(daysLeft)} روز تا ${what}` : `${fa(-daysLeft)} روز از ${what} گذشته`;
}

/** «۴۰٪ مانده» — the share of the period still ahead */
export const periodLeftLabel = ({ progress }) => `${fa(Math.round((1 - progress) * 100))}٪ مانده`;
