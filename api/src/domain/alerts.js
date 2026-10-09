/**
 * alerts.js — One shape for every alert and notification in RealRate (shared with the web app)
 *
 * Anything that wants the user's attention — an overdue loan installment, a cheque coming due, a
 * portfolio drifting from its targets, a new app version — is an alert:
 *
 *   {
 *     id:       stable id of what it is about ("loan:overdue", "portfolio:drift:pf_1")
 *     source:   ALERT_SOURCES key (who raised it; also what the user can mute or email)
 *     severity: 'critical' | 'warning' | 'info'
 *     title:    one line («۲ قسط معوق»)
 *     message?: more text
 *     items?:   [{ key, title, detail?, amount? }]  what it is made of (installments, cheques)
 *     amount?:  total in tomans (the sum of the items when not given)
 *     dueDate?: YYYY-MM-DD — the earliest date it concerns
 *     action?:  { label, path }  where to deal with it
 *     scope?:   narrows it to a page (a portfolio's id)
 *   }
 *
 * The alerts are raised in the browser: the data they come from is end-to-end encrypted, the
 * server cannot read it. Delivery is by channel (shared/alerts/alertChannels.js in the web app):
 * in the app (the alert center and the banners) for every alert, and — for what the user opts in
 * to — by email: selectForEmail() picks the critical alerts of the chosen sources not already
 * sent, and buildEmailDigest() writes the email (amounts only when the user allows it), so the
 * server would only ever see what the user agreed to send.
 */

export const ALERT_SEVERITIES = ['critical', 'warning', 'info'];
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

/** Who raises alerts; `email` marks the ones that may be emailed (money that is due) */
export const ALERT_SOURCES = {
  loan: { label: 'اقساط وام', email: true },
  cheque: { label: 'چک‌ها', email: true },
  subscription: { label: 'اشتراک‌ها', email: true },
  budget: { label: 'بودجه', email: false },
  portfolio: { label: 'پورتفو', email: false },
  app: { label: 'برنامه', email: false },
  system: { label: 'اطلاعیه‌ها', email: false },
};

export const ALERT_LIMITS = { title: 120, message: 500, items: 50 };

const clip = (value, max) => String(value ?? '').trim().slice(0, max);

/**
 * Normalize an alert; null when it is not one (no id, unknown source, no title)
 * @param {object} input
 * @returns {object|null}
 */
export function createAlert(input) {
  if (!input || typeof input !== 'object') return null;
  const id = clip(input.id, 160);
  const source = String(input.source || '');
  const title = clip(input.title, ALERT_LIMITS.title);
  if (!id || !ALERT_SOURCES[source] || !title) return null;
  const severity = ALERT_SEVERITIES.includes(input.severity) ? input.severity : 'info';
  const items = Array.isArray(input.items)
    ? input.items.slice(0, ALERT_LIMITS.items).filter((i) => i && i.key !== undefined).map((i) => ({
        key: String(i.key),
        title: clip(i.title, ALERT_LIMITS.title),
        ...(i.detail ? { detail: clip(i.detail, ALERT_LIMITS.message) } : {}),
        ...(Number.isFinite(Number(i.amount)) && i.amount !== null && i.amount !== undefined ? { amount: Number(i.amount) } : {}),
      }))
    : [];
  const itemsTotal = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  const amount = Number.isFinite(Number(input.amount)) && input.amount !== null && input.amount !== undefined
    ? Number(input.amount)
    : (items.some((i) => i.amount !== undefined) ? itemsTotal : undefined);
  const alert = { id, source, severity, title };
  if (input.message) alert.message = clip(input.message, ALERT_LIMITS.message);
  if (items.length) alert.items = items;
  if (amount !== undefined) alert.amount = amount;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(input.dueDate || ''))) alert.dueDate = input.dueDate;
  if (input.action?.label && input.action?.path) alert.action = { label: clip(input.action.label, 40), path: String(input.action.path) };
  if (input.scope) alert.scope = String(input.scope);
  return alert;
}

/** Most severe first, then the earliest due, then by id */
export function compareAlerts(a, b) {
  return (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))
    || a.id.localeCompare(b.id);
}

/**
 * What an alert is about right now: its id and its items. Dismissing an alert hides this
 * fingerprint, so the same alert comes back when something new joins it (another overdue
 * installment), and an email is sent once per fingerprint.
 */
export function alertFingerprint(alert) {
  const items = (alert.items || []).map((i) => i.key).sort().join(',');
  return `${alert.id}|${alert.severity}|${items}`;
}

/** Counts by severity */
export function summarizeAlerts(alerts = []) {
  const counts = { critical: 0, warning: 0, info: 0, total: alerts.length };
  for (const a of alerts) counts[a.severity] += 1;
  return counts;
}

/** Email preferences (off until the user turns it on) */
export const DEFAULT_EMAIL_PREFS = {
  enabled: false,
  sources: Object.keys(ALERT_SOURCES).filter((key) => ALERT_SOURCES[key].email),
  includeAmounts: false,
};

/**
 * The alerts an email should carry: critical, from a source the user chose (and that may be
 * emailed), not sent before (`sent`: the fingerprints already emailed)
 * @param {object[]} alerts
 * @param {{ enabled?: boolean, sources?: string[] }} prefs
 * @param {Iterable<string>} [sent]
 */
export function selectForEmail(alerts = [], prefs = DEFAULT_EMAIL_PREFS, sent = []) {
  if (!prefs?.enabled) return [];
  const already = new Set(sent);
  const sources = new Set(prefs.sources || []);
  return alerts.filter((a) => a.severity === 'critical'
    && ALERT_SOURCES[a.source]?.email
    && sources.has(a.source)
    && !already.has(alertFingerprint(a)));
}

const faNum = (v) => Math.round(Number(v) || 0).toLocaleString('fa-IR');

/**
 * The email for a set of alerts: { subject, text }. Amounts only with `includeAmounts`
 * @param {object[]} alerts
 * @param {{ includeAmounts?: boolean, appUrl?: string }} [options]
 */
export function buildEmailDigest(alerts = [], { includeAmounts = false, appUrl = '' } = {}) {
  const sorted = [...alerts].sort(compareAlerts);
  const subject = sorted.length === 1
    ? `RealRate: ${sorted[0].title}`
    : `RealRate: ${faNum(sorted.length)} هشدار مهم`;
  const lines = [];
  for (const a of sorted) {
    lines.push(`• ${a.title}${includeAmounts && a.amount ? ` — ${faNum(a.amount)} تومان` : ''}`);
    for (const item of a.items || []) {
      lines.push(`   - ${item.title}${item.detail ? `، ${item.detail}` : ''}${includeAmounts && item.amount ? ` — ${faNum(item.amount)} تومان` : ''}`);
    }
    if (a.action?.path && appUrl) lines.push(`   ${appUrl.replace(/\/$/, '')}${a.action.path}`);
  }
  return { subject, text: lines.join('\n') };
}
