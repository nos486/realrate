/**
 * format.js — Amounts of an expense in its currency's digits (utils/currencies.js): tomans as
 * whole numbers, a foreign currency with up to two decimals
 */

import { formatCurrencyNumber } from '../../../utils/currencies.js';

export function formatAmount(value, currency = 'IRT') {
  return formatCurrencyNumber(value, currency);
}
