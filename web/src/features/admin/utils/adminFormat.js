/**
 * adminFormat.js — Display helpers shared by the admin panel
 */

/** Persian number with digit grouping ('—' for a missing value) */
export const faNum = (n) => (n === null || n === undefined ? '—' : Number(n || 0).toLocaleString('fa-IR'));

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shamsi date, e.g. «۱۴۰۵/۷/۴» ('-' when missing or unparseable) */
export function formatDate(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString('fa-IR') : '-';
}

/** Shamsi date and time, e.g. «۱۴۰۵/۷/۴ ۱۰:۳۰» ('-' when missing or unparseable) */
export function formatDateTime(value) {
  const d = parseDate(value);
  if (!d) return '-';
  return `${d.toLocaleDateString('fa-IR')} ${d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Display name of a user row */
export const displayName = (u) => u?.customName || u?.name || u?.email || '-';
