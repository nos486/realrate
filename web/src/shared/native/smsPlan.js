/**
 * smsPlan.js — The free plan's limit on reading bank messages (config/planLimits.js FREE_SMS_READS)
 *
 * Reading happens on the phone, so the count is kept there too: messages added to the inbox per
 * Tehran day and per Shamsi month. A message past the limit is not added (it stays in the phone's
 * SMS and can be read after upgrading, from the SMS page). The limits come from the server
 * (`setSmsLimits`, GET /api/plan: the admin edits them per group; null is unlimited); Pro is never limited.
 */

import { FREE_SMS_READS } from '../../config/planLimits.js';

const KEY = 'realrate_sms_free_count';
let limits = { daily: FREE_SMS_READS.daily, monthly: FREE_SMS_READS.monthly };

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' });
const monthFormat = new Intl.DateTimeFormat('en-u-ca-persian', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'numeric' });

/** The signed-in user's limits (a count, or null for unlimited), set by the app when it knows them */
export function setSmsLimits(next) {
  limits = { daily: next?.daily ?? null, monthly: next?.monthly ?? null };
}

/** Pro: no limit at all */
export function setSmsPlanPro(value) {
  setSmsLimits(value ? { daily: null, monthly: null } : { daily: FREE_SMS_READS.daily, monthly: FREE_SMS_READS.monthly });
}

/** The limits in force: { daily, monthly }, each a count or null (unlimited) */
export function smsLimits() {
  return limits;
}

function readCount(now) {
  const day = dayFormat.format(now);
  const month = monthFormat.format(now);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    return {
      day,
      month,
      daily: saved.day === day ? saved.daily || 0 : 0,
      monthly: saved.month === month ? saved.monthly || 0 : 0,
    };
  } catch {
    return { day, month, daily: 0, monthly: 0 };
  }
}

/** What the free plan has read today and this month */
export function smsFreeUsage(now = new Date()) {
  const { daily, monthly } = readCount(now);
  return { daily, monthly };
}

/**
 * Take one read of the allowance
 * @returns {boolean} false when the free plan's limit is used up (nothing taken)
 */
export function takeSmsRead(now = new Date()) {
  if (limits.daily === null && limits.monthly === null) return true;
  const count = readCount(now);
  if ((limits.daily !== null && count.daily >= limits.daily) || (limits.monthly !== null && count.monthly >= limits.monthly)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: count.day, month: count.month, daily: count.daily + 1, monthly: count.monthly + 1 }));
  } catch {
    // Storage unavailable: not counted
  }
  return true;
}
