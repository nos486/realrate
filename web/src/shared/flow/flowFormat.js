/** Amounts on the incomes / expenses pages: whole tomans, or a mask in privacy mode */
import { intlLocale } from '../../utils/i18n.js';

export const MASK = '****';
export const formatAmountMasked = (value, hidden = false) =>
  hidden ? MASK : Math.round(Number(value) || 0).toLocaleString(intlLocale());
