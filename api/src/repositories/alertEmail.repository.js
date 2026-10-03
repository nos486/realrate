/**
 * alertEmail.repository.js — Database storage for alert email preferences and sent digests
 *
 * Supports account-level email reminder settings, tracking sent notifications to prevent duplicates,
 * and batched queries for the daily reminder cron.
 */

import { ensureSchema } from './schema.repository.js';
import {
  DEFAULT_ALERT_EMAIL_PREFS,
  validateAlertEmailPrefs,
} from '../domain/alertEmailPrefs.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function parsePrefsRow(row) {
  if (!row) return { ...DEFAULT_ALERT_EMAIL_PREFS };
  let sources = DEFAULT_ALERT_EMAIL_PREFS.sources;
  try {
    if (typeof row.sources === 'string') sources = JSON.parse(row.sources);
    else if (Array.isArray(row.sources)) sources = row.sources;
  } catch {}

  let leadDays = DEFAULT_ALERT_EMAIL_PREFS.leadDays;
  try {
    const raw = row.lead_days ?? row.leadDays;
    if (typeof raw === 'string') leadDays = JSON.parse(raw);
    else if (Array.isArray(raw)) leadDays = raw;
  } catch {}

  return {
    enabled: Number(row.enabled) === 1,
    sources,
    leadDays,
    sendOverdue: Number(row.send_overdue ?? row.sendOverdue ?? 1) === 1,
    includeChequeDirection: Number(row.include_cheque_direction ?? row.includeChequeDirection ?? 0) === 1,
    updatedAt: row.updated_at || '',
  };
}

export async function dbGetAlertEmailPrefs(env, userId) {
  await ensureSchema(env);
  const row = await env.DB.prepare(`
    SELECT user_id, enabled, sources, lead_days, send_overdue, include_cheque_direction, updated_at
    FROM alert_email_prefs WHERE user_id = ?
  `).bind(userId).first();
  return parsePrefsRow(row);
}

export async function dbSaveAlertEmailPrefs(env, userId, inputPrefs) {
  await ensureSchema(env);
  const { value: prefs, error } = validateAlertEmailPrefs(inputPrefs);
  if (error) throw new Error(error);

  const now = new Date().toISOString();
  const stmts = [
    env.DB.prepare(`
      INSERT INTO alert_email_prefs (user_id, enabled, sources, lead_days, send_overdue, include_cheque_direction, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        enabled = excluded.enabled,
        sources = excluded.sources,
        lead_days = excluded.lead_days,
        send_overdue = excluded.send_overdue,
        include_cheque_direction = excluded.include_cheque_direction,
        updated_at = excluded.updated_at
    `).bind(
      userId,
      prefs.enabled ? 1 : 0,
      JSON.stringify(prefs.sources),
      JSON.stringify(prefs.leadDays),
      prefs.sendOverdue ? 1 : 0,
      prefs.includeChequeDirection ? 1 : 0,
      now
    ),
  ];

  // If cheque direction was disabled, null out existing stored cheque directions immediately
  if (!prefs.includeChequeDirection) {
    stmts.push(
      env.DB.prepare(`
        UPDATE vault_reminders SET direction = '' WHERE user_id = ? AND kind = 'cheque'
      `).bind(userId)
    );
  }

  await env.DB.batch(stmts);
  return { ...prefs, updatedAt: now };
}

/**
 * Clean up alert_email_sent rows older than retention period (default 120 days)
 */
export async function dbPurgeOldAlertEmailSent(env, maxAgeDays = 120) {
  await ensureSchema(env);
  const cutoff = new Date(Date.now() - maxAgeDays * DAY_MS).toISOString();
  await env.DB.prepare(`DELETE FROM alert_email_sent WHERE sent_at < ?`).bind(cutoff).run();
}

/**
 * Batched load of users opted-in to reminder emails with verified, active accounts
 */
export async function dbGetReminderEmailRecipients(env) {
  await ensureSchema(env);
  const { results = [] } = await env.DB.prepare(`
    SELECT p.user_id, u.email, p.enabled, p.sources, p.lead_days, p.send_overdue, p.include_cheque_direction
    FROM alert_email_prefs p
    JOIN users u ON u.id = p.user_id
    WHERE p.enabled = 1 AND u.email_verified = 1 AND u.disabled = 0 AND u.email IS NOT NULL AND u.email != ''
  `).all();

  return results.map((r) => ({
    userId: r.user_id,
    email: r.email,
    prefs: parsePrefsRow(r),
  }));
}

/**
 * Batched load of reminders for a list of user IDs
 */
export async function dbGetRemindersForUsers(env, userIds = []) {
  if (!userIds.length) return [];
  await ensureSchema(env);
  const marks = userIds.map(() => '?').join(', ');
  const { results = [] } = await env.DB.prepare(`
    SELECT user_id, kind, record_id, due_date, interval_months, remaining, direction, muted, updated_at
    FROM vault_reminders
    WHERE user_id IN (${marks}) AND muted = 0
  `).bind(...userIds).all();

  return results.map((r) => ({
    userId: r.user_id,
    kind: r.kind,
    recordId: r.record_id,
    dueDate: r.due_date,
    intervalMonths: Number(r.interval_months) || 0,
    remaining: r.remaining !== null && r.remaining !== undefined ? Number(r.remaining) : null,
    direction: r.direction || '',
    muted: Number(r.muted) === 1,
    updatedAt: r.updated_at,
  }));
}

/**
 * Batched load of recent sent digest entries for user IDs
 */
export async function dbGetSentHistoryForUsers(env, userIds = [], sinceIso = '') {
  if (!userIds.length) return [];
  await ensureSchema(env);
  const marks = userIds.map(() => '?').join(', ');
  const query = sinceIso
    ? `SELECT user_id, kind, record_id, due_date, reason FROM alert_email_sent WHERE user_id IN (${marks}) AND sent_at >= ?`
    : `SELECT user_id, kind, record_id, due_date, reason FROM alert_email_sent WHERE user_id IN (${marks})`;
  const params = sinceIso ? [...userIds, sinceIso] : userIds;
  const { results = [] } = await env.DB.prepare(query).bind(...params).all();

  return results.map((r) => ({
    userId: r.user_id,
    kind: r.kind,
    recordId: r.record_id,
    dueDate: r.due_date,
    reason: r.reason,
  }));
}

/**
 * Record sent entries in alert_email_sent
 */
export async function dbRecordAlertEmailSent(env, entries = []) {
  if (!entries.length) return;
  await ensureSchema(env);
  const now = new Date().toISOString();
  const stmts = entries.map((e) =>
    env.DB.prepare(`
      INSERT INTO alert_email_sent (user_id, kind, record_id, due_date, reason, sent_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, kind, record_id, due_date, reason) DO UPDATE SET sent_at = excluded.sent_at
    `).bind(e.userId, e.kind, e.recordId, e.dueDate, e.reason, now)
  );
  await env.DB.batch(stmts);
}
