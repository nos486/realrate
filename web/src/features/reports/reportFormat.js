/**
 * reportFormat.js — How the reports page writes its figures, masked when values are hidden
 * (usePrivacyMode): tomans in full or compact, dollars, percentages
 */

import { formatCompactAmount } from '../../shared/utils/formatters.js';
import { formatUsd } from '../../shared/ui/DollarValue.jsx';
import { formatAmountMasked } from '../../shared/flow/flowFormat.js';

export const MASK = '****';

/** A signed percentage: «۲۵٪», «−۳٫۵٪» */
export const formatPct = (v) => `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('fa-IR', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 })}٪`;

/** The page's formatters for the privacy mode */
export function reportFormatters(hideValues) {
  return {
    money: (v) => formatAmountMasked(v, hideValues),
    compact: (v) => (hideValues ? MASK : `${v < 0 ? '−' : ''}${formatCompactAmount(Math.abs(v))}`),
    usd: (v) => (hideValues ? MASK : `${v < 0 ? '−' : ''}$${formatUsd(Math.abs(v))}`),
    // A share tells the amounts' ratio, so it is hidden with them
    pct: (v) => (v === null || v === undefined ? '—' : hideValues ? MASK : formatPct(v)),
  };
}
