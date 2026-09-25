/**
 * isoDate.js — Validation of calendar dates exchanged as ISO strings (YYYY-MM-DD, Gregorian)
 *
 * The year range rejects Shamsi dates sent in the ISO shape by mistake (e.g. 1404-07-01), which
 * would otherwise be stored as a date six centuries ago.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MIN_YEAR = 1900;
export const MAX_YEAR = 2200;

/** A real Gregorian calendar date within MIN_YEAR..MAX_YEAR */
export function isValidIsoDate(value) {
  const match = ISO_DATE_RE.exec(String(value ?? ''));
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
