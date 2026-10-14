/**
 * dates.js — Calendar-date helpers (ISO YYYY-MM-DD, in the user's own time zone)
 */

import { intlLocale, getLocaleInfo } from '../../utils/i18n.js';

/** The `Intl` locale tag of the active language on its calendar (Shamsi in both languages): digits and names follow the language */
export const calendarLocale = () => `${intlLocale()}-u-ca-${getLocaleInfo().calendar}`;

/** Today's date in the user's time zone, e.g. '2026-09-25' (not UTC, so it flips at local midnight) */
export function todayIso(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
