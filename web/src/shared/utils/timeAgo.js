/**
 * timeAgo.js — How long ago something happened, in Persian: «همین حالا», «۳۰ دقیقه پیش»,
 * «۲ ساعت پیش», «۱ روز پیش»
 *
 * Worked out when a screen renders (no timer: a refresh of the tab renders it again).
 */

const fa = (n) => Number(n).toLocaleString('fa-IR');

/**
 * @param {string|number|Date|null} at - an ISO time, ms or a Date
 * @param {number} [nowMs]
 * @returns {string} '' when the time is unknown
 */
export function timeAgo(at, nowMs = Date.now()) {
  const t = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at || '');
  if (!Number.isFinite(t) || t <= 0) return '';
  const minutes = Math.floor((nowMs - t) / 60000);
  if (minutes < 1) return 'همین حالا';
  if (minutes < 60) return `${fa(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${fa(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${fa(days)} روز پیش`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${fa(months)} ماه پیش`;
  return `${fa(Math.floor(days / 365))} سال پیش`;
}
