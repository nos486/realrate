/**
 * goalDisplay.js — How a goal is shown: its icon, an amount in tomans and a day
 * (utils/goalDocument.js for the figures)
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import { categoryIcon } from '../../../shared/categories/categoryIcons.js';
import { goalIconOf } from '../../../utils/goalDocument.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatMoney } from '../../../utils/currencies.js';

const fa = (n) => Number(n).toLocaleString(intlLocale(), { maximumFractionDigits: 0 });

export const goalIcon = (value) => categoryIcon(goalIconOf(value).value);

/** «۱۵۰٬۰۰۰ تومان» */
export const formatGoalAmount = (amount) => formatMoney(Math.round(amount), 'IRT');

export const shamsiDay = (iso) => (iso ? formatShamsiDisplay(`${iso}T00:00:00`) : '');

/** «امروز» / «فردا» / «۵ روز دیگر» / «۳ روز گذشته» — the days to a goal's date */
export function goalDaysLabel(days) {
  if (days === 0) return t('امروز');
  if (days === 1) return t('فردا');
  return days > 0 ? t('{n} روز دیگر', { n: fa(days) }) : t('{n} روز از موعد گذشته', { n: fa(-days) });
}

export { fa as goalNumber };
