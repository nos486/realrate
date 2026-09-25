/**
 * chequeDisplay.js — How cheque statuses and directions look in the UI
 */

import { ArrowDownLeft, ArrowUpRight, Clock, Landmark, CheckCircle2, XCircle, Repeat, Ban } from 'lucide-react';
import { getChequeStatus, getChequeDirection } from '../../../utils/chequeDocument.js';

/** Status → icon and tone (tone maps to a CSS modifier on the status badge) */
const STATUS_LOOK = {
  pending: { Icon: Clock, tone: 'warning' },
  deposited: { Icon: Landmark, tone: 'info' },
  cleared: { Icon: CheckCircle2, tone: 'good' },
  bounced: { Icon: XCircle, tone: 'danger' },
  transferred: { Icon: Repeat, tone: 'neutral' },
  cancelled: { Icon: Ban, tone: 'neutral' },
};

export function getStatusDisplay(status) {
  const def = getChequeStatus(status);
  return { ...def, ...(STATUS_LOOK[def.value] || STATUS_LOOK.pending) };
}

export function getDirectionDisplay(direction) {
  const def = getChequeDirection(direction);
  return {
    ...def,
    Icon: def.value === 'issued' ? ArrowUpRight : ArrowDownLeft,
    tone: def.value === 'issued' ? 'payable' : 'receivable',
    counterpartyLabel: def.value === 'issued' ? 'در وجه' : 'صادرکننده',
  };
}

/** e.g. "۳ روز دیگر", "امروز", "۲ روز گذشته" */
export function describeDueDays(days) {
  if (days === 0) return 'امروز';
  const n = Math.abs(days).toLocaleString('fa-IR');
  return days > 0 ? `${n} روز دیگر` : `${n} روز گذشته`;
}
