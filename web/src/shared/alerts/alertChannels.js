/**
 * alertChannels.js — Where alerts are delivered
 *
 *   - in the app: every alert, always (the alert center AlertCenter.jsx, and the banners
 *     AlertStack.jsx on the pages they concern)
 *   - email: the critical alerts of the sources the user opts in to (loan installments, cheques),
 *     once per fingerprint. NOT AVAILABLE YET — the server has no sending endpoint. When it does:
 *     set EMAIL_CHANNEL.available, give `send` the request (POST the digest built by
 *     utils/alerts.js buildEmailDigest — the server cannot read the encrypted data, so the browser
 *     sends only what the user agreed to), and show the settings that toggle `prefs`.
 *
 * deliverAlerts() runs every available channel over the store's alerts (AppAlertSources.jsx),
 * remembering what each one sent so nothing goes out twice.
 */

import { selectForEmail, alertFingerprint, buildEmailDigest, DEFAULT_EMAIL_PREFS } from '../../utils/alerts.js';

const PREFS_KEY = 'realrate_alert_email';
const SENT_KEY = 'realrate_alert_email_sent';
const MAX_SENT = 200;

const read = (key, fallback) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export function getEmailPrefs() {
  return { ...DEFAULT_EMAIL_PREFS, ...read(PREFS_KEY, {}) };
}

export function setEmailPrefs(patch) {
  write(PREFS_KEY, { ...getEmailPrefs(), ...patch });
}

export const EMAIL_CHANNEL = {
  id: 'email',
  available: false,
  /** @param {{ subject: string, text: string }} _digest */
  send: async (_digest) => {
    throw new Error('ارسال ایمیل هشدارها هنوز فعال نیست.');
  },
};

/**
 * Send what each available channel should send
 * @param {object[]} alerts the store's alerts (dismissed ones too: hiding a banner is not a
 *   reason to skip the email)
 * @param {{ channels?: object[], appUrl?: string }} [options]
 * @returns {Promise<string[]>} the fingerprints sent
 */
export async function deliverAlerts(alerts, { channels = [EMAIL_CHANNEL], appUrl = '' } = {}) {
  const email = channels.find((c) => c.id === 'email');
  if (!email?.available) return [];
  const prefs = getEmailPrefs();
  const sent = read(SENT_KEY, []);
  const due = selectForEmail(alerts, prefs, sent);
  if (!due.length) return [];
  await email.send(buildEmailDigest(due, { includeAmounts: prefs.includeAmounts, appUrl }));
  const fingerprints = due.map(alertFingerprint);
  write(SENT_KEY, [...sent, ...fingerprints].slice(-MAX_SENT));
  return fingerprints;
}
