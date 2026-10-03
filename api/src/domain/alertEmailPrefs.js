/**
 * alertEmailPrefs.js — Server-side email reminder preferences validation and defaults
 *
 * Each account can opt in to daily email digests for due loan installments and cheques. To preserve zero-knowledge encryption, emails only ever contain counts and item kinds
 * (no amounts, counterparties, or bank titles).
 */

export const ALLOWED_EMAIL_SOURCES = ['loan', 'cheque'];
export const ALLOWED_LEAD_DAYS = [0, 1, 3, 7];

export const DEFAULT_ALERT_EMAIL_PREFS = {
  enabled: false,
  sources: ['loan', 'cheque'],
  leadDays: [1, 0],
  sendOverdue: true,
  includeChequeDirection: false,
};

/**
 * Validate and normalize email reminder preferences.
 * @param {object} input
 * @returns {{ value?: object, error?: string }}
 */
export function validateAlertEmailPrefs(input) {
  if (!input || typeof input !== 'object') {
    return { error: 'تنظیمات یادآوری ایمیلی نامعتبر است.' };
  }

  const enabled = Boolean(input.enabled);

  let sources = DEFAULT_ALERT_EMAIL_PREFS.sources;
  if (Array.isArray(input.sources)) {
    sources = input.sources
      .map(String)
      .filter((s) => ALLOWED_EMAIL_SOURCES.includes(s));
    // Unique items
    sources = [...new Set(sources)];
  }

  let leadDays = DEFAULT_ALERT_EMAIL_PREFS.leadDays;
  if (Array.isArray(input.leadDays ?? input.lead_days)) {
    const raw = input.leadDays ?? input.lead_days;
    leadDays = raw
      .map(Number)
      .filter((d) => ALLOWED_LEAD_DAYS.includes(d));
    leadDays = [...new Set(leadDays)].sort((a, b) => b - a);
  }

  const sendOverdue = input.sendOverdue !== undefined
    ? Boolean(input.sendOverdue)
    : input.send_overdue !== undefined
    ? Boolean(input.send_overdue)
    : true;

  const includeChequeDirection = input.includeChequeDirection !== undefined
    ? Boolean(input.includeChequeDirection)
    : input.include_cheque_direction !== undefined
    ? Boolean(input.include_cheque_direction)
    : false;

  return {
    value: {
      enabled,
      sources,
      leadDays,
      sendOverdue,
      includeChequeDirection,
    },
  };
}
