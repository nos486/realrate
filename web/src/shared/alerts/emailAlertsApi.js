/**
 * emailAlertsApi.js — Client API and cache for server-side email reminder preferences
 *
 * Allows the client to view and update alert email preferences, trigger test digests,
 * and tracks `includeChequeDirection` so that vault writes know whether to send cheque direction.
 */

import { httpClient } from '../api/httpClient.js';

const CACHE_KEY = 'realrate_include_cheque_direction';

let cachedIncludeDirection = (() => {
  try {
    return localStorage.getItem(CACHE_KEY) === 'true';
  } catch {
    return false;
  }
})();

export function shouldIncludeChequeDirection() {
  return cachedIncludeDirection;
}

export function setCachedIncludeChequeDirection(include) {
  cachedIncludeDirection = Boolean(include);
  try {
    localStorage.setItem(CACHE_KEY, String(cachedIncludeDirection));
  } catch {}
}

export async function getEmailAlertPrefs(options) {
  const res = await httpClient.get('/api/alerts/email', options);
  if (res?.prefs?.includeChequeDirection !== undefined) {
    setCachedIncludeChequeDirection(res.prefs.includeChequeDirection);
  }
  return res;
}

export async function updateEmailAlertPrefs(prefs, options) {
  const res = await httpClient.put('/api/alerts/email', prefs, options);
  if (res?.prefs?.includeChequeDirection !== undefined) {
    setCachedIncludeChequeDirection(res.prefs.includeChequeDirection);
  }
  return res;
}

export async function sendTestEmailAlert(options) {
  return httpClient.post('/api/alerts/email/test', {}, options);
}

export {
  getEmailAlertPrefs as fetchAlertEmailPrefs,
  updateEmailAlertPrefs as saveAlertEmailPrefs,
  sendTestEmailAlert as sendTestAlertEmail,
};
