/**
 * timeAgo.js — How long ago something happened, in Persian: «همین حالا», «۳۰ دقیقه پیش»,
 * «۲ ساعت پیش», «۱ روز پیش»
 *
 * Worked out when a screen renders (no timer: a refresh of the tab renders it again).
 */

import { intlLocale, t } from '../../utils/i18n.js';

const fa = (n) => Number(n).toLocaleString(intlLocale());

/**
 * @param {string|number|Date|null} at - an ISO time, ms or a Date
 * @param {number} [nowMs]
 * @returns {string} '' when the time is unknown
 */
export function timeAgo(at, nowMs = Date.now()) {
  const ts = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at || '');
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const minutes = Math.floor((nowMs - ts) / 60000);
  if (minutes < 1) return t('همین حالا');
  if (minutes < 60) return t('{n} دقیقه پیش', { n: fa(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('{n} ساعت پیش', { n: fa(hours) });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('{n} روز پیش', { n: fa(days) });
  const months = Math.floor(days / 30);
  if (months < 12) return t('{n} ماه پیش', { n: fa(months) });
  return t('{n} سال پیش', { n: fa(Math.floor(days / 365)) });
}
