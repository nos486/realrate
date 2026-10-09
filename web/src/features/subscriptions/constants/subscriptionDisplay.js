/**
 * subscriptionDisplay.js — How a subscription is shown: its category's icon, its state's badge,
 * a price in its currency and when it renews (utils/subscriptionDocument.js for the figures)
 */

import { categoryIcon } from '../../../shared/categories/categoryIcons.js';
import { subscriptionCategoryOf, cycleOf } from '../../../utils/subscriptionDocument.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';

const fa = (n, digits = 0) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: digits });

export const subscriptionIcon = (category) => categoryIcon(subscriptionCategoryOf(category).icon);

/** A state's badge: its label and tone (styles/subscriptions.css) */
export const STATE_BADGES = {
  active: { label: 'فعال', tone: 'is-active' },
  due: { label: 'نزدیک تمدید', tone: 'is-due' },
  expired: { label: 'تمام شده — تمدید نشده', tone: 'is-expired' },
  ended: { label: 'پایان‌یافته', tone: 'is-muted' },
  paused: { label: 'متوقف', tone: 'is-muted' },
  cancelled: { label: 'لغوشده', tone: 'is-muted' },
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
