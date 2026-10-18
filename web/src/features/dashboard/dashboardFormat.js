/**
 * dashboardFormat.js — Number formatting shared by the dashboard's widgets
 */

import { intlLocale } from '../../utils/i18n.js';

const MASK = '••••••';

/** A whole number in the page's digits */
export const wholeText = (n) => Math.round(Number(n) || 0).toLocaleString(intlLocale());

/** An amount, or the mask while the user hides their values */
export const moneyText = (n, hidden = false) => (hidden ? MASK : wholeText(n));
