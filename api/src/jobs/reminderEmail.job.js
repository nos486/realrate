/**
 * reminderEmail.job.js — Daily reminder email digest cron job
 *
 * Runs once a day at 08:00 Asia/Tehran. Loads opted-in users with verified emails,
 * inspects upcoming and overdue reminders using occurrencesBetween in batched queries,
 * builds one plaintext digest per user, and sends it via sendEmail.
 */

import {
  dbGetReminderEmailRecipients,
  dbGetRemindersForUsers,
  dbGetSentHistoryForUsers,
  dbRecordAlertEmailSent,
} from '../repositories/alertEmail.repository.js';
import { occurrencesBetween } from '../domain/reminders.js';
import { sendEmail, reminderDigestEmail, isEmailConfigured } from '../lib/email.js';
import { logger } from '../lib/logger.js';

const toFa = (n) => Number(n || 0).toLocaleString('fa-IR');

export function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yStr = dt.getUTCFullYear();
  const mStr = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dStr = String(dt.getUTCDate()).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

export function tehranTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    day: `${map.year}-${map.month}-${map.day}`,
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
  };
}

function formatGroupLines(groupKey, items) {
  // Group by kind + direction
  const counts = new Map();
  for (const item of items) {
    const key = `${item.kind}|${item.direction || ''}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const lines = [];
  for (const [key, count] of counts.entries()) {
    const [kind, direction] = key.split('|');
    const cnt = toFa(count);

    if (groupKey === 'overdue') {
      if (kind === 'loan') {
        lines.push(`${cnt} قسط وام سررسیدش گذشته است`);
      } else if (kind === 'cheque') {
        if (direction === 'issued') lines.push(`${cnt} چک صادره سررسیدش گذشته است`);
        else if (direction === 'received') lines.push(`${cnt} چک دریافتی سررسیدش گذشته است`);
        else lines.push(`${cnt} چک سررسیدش گذشته است`);
      } else if (kind === 'recurring_income') {
        lines.push(`${cnt} درآمد ثابت واریز نشده است`);
      }
    } else if (groupKey === 'due') {
      if (kind === 'loan') {
        lines.push(`${cnt} قسط وام امروز سررسید است`);
      } else if (kind === 'cheque') {
        if (direction === 'issued') lines.push(`${cnt} چک صادره امروز سررسید است — موجودی حسابتان را بررسی کنید`);
        else if (direction === 'received') lines.push(`${cnt} چک دریافتی امروز سررسید است — برای وصول آماده کنید`);
        else lines.push(`${cnt} چک امروز سررسید است`);
      } else if (kind === 'recurring_income') {
        lines.push(count === 1 ? 'حقوق/درآمد ثابت امروز باید واریز شود' : `${cnt} درآمد ثابت امروز باید واریز شود`);
      }
    } else if (groupKey.startsWith('lead:')) {
      const d = parseInt(groupKey.split(':')[1], 10);
      if (d === 1) {
        if (kind === 'loan') lines.push(`${cnt} قسط وام فردا سررسید می‌شود`);
        else if (kind === 'cheque') {
          if (direction === 'issued') lines.push(`${cnt} چک صادره فردا سررسید می‌شود`);
          else if (direction === 'received') lines.push(`${cnt} چک دریافتی فردا سررسید می‌شود`);
          else lines.push(`${cnt} چک فردا سررسید می‌شود`);
        } else if (kind === 'recurring_income') {
          lines.push(`${cnt} درآمد ثابت فردا باید واریز شود`);
        }
      } else {
        const dFa = toFa(d);
        if (kind === 'loan') lines.push(`${cnt} قسط وام در ${dFa} روز آینده سررسید می‌شود`);
        else if (kind === 'cheque') {
          if (direction === 'issued') lines.push(`${cnt} چک صادره در ${dFa} روز آینده سررسید می‌شود`);
          else if (direction === 'received') lines.push(`${cnt} چک دریافتی در ${dFa} روز آینده سررسید می‌شود`);
          else lines.push(`${cnt} چک در ${dFa} روز آینده سررسید می‌شود`);
        } else if (kind === 'recurring_income') {
          lines.push(`${cnt} درآمد ثابت در ${dFa} روز آینده واریز می‌شود`);
        }
      }
    }
  }
  return lines;
}

/**
 * Execute the reminder email digest run.
 * @param {object} env
 * @param {{ now?: Date, appUrl?: string }} [options]
 * @returns {Promise<{ recipientsCount: number, sentCount: number }>}
 */
export async function runReminderEmailDigest(env, options = {}) {
  const opts = typeof options === 'string' ? { now: new Date(options) } : (options || {});
  const now = opts.now || new Date();
  const appUrl = opts.appUrl || '';

  if (!isEmailConfigured(env)) {
    logger.info('[ReminderEmail] Email provider not configured, skipping digest cron');
    return { recipientsCount: 0, sentCount: 0, emailsSent: 0 };
  }

  const { day: today } = tehranTime(now);
  const recipients = await dbGetReminderEmailRecipients(env);
  if (!recipients.length) return { recipientsCount: 0, sentCount: 0, emailsSent: 0 };

  const userIds = recipients.map((r) => r.userId);
  const [allReminders, allSent] = await Promise.all([
    dbGetRemindersForUsers(env, userIds),
    dbGetSentHistoryForUsers(env, userIds),
  ]);

  // Group reminders by user
  const remindersByUser = new Map();
  for (const r of allReminders) {
    if (!remindersByUser.has(r.userId)) remindersByUser.set(r.userId, []);
    remindersByUser.get(r.userId).push(r);
  }

  // Sent set: userId|kind|recordId|dueDate|reason
  const sentSet = new Set(
    allSent.map((s) => `${s.userId}|${s.kind}|${s.recordId}|${s.dueDate}|${s.reason}`)
  );

  let sentCount = 0;

  for (const recipient of recipients) {
    try {
      const { userId, email, prefs } = recipient;
      const userReminders = remindersByUser.get(userId) || [];
      if (!userReminders.length) continue;

      const allowedSources = new Set(prefs.sources || []);
      const leadDays = prefs.leadDays || [1, 0];
      const maxLead = Math.max(...leadDays, 0);
      const maxLeadDate = addDaysIso(today, maxLead);

      const toSendGroups = {
        overdue: [],
        due: [],
      };
      for (const d of leadDays) {
        if (d > 0) toSendGroups[`lead:${d}`] = [];
      }

      const pendingSentRecords = [];

      for (const rem of userReminders) {
        if (!allowedSources.has(rem.kind)) continue;

        // Check cheque direction filtering
        const dir = prefs.includeChequeDirection ? rem.direction : '';
        const remItem = { ...rem, direction: dir };

        // 1. Overdue: due_date < today
        if (prefs.sendOverdue && rem.dueDate < today) {
          const sentKey = `${userId}|${rem.kind}|${rem.recordId}|${rem.dueDate}|overdue`;
          if (!sentSet.has(sentKey)) {
            toSendGroups.overdue.push(remItem);
            pendingSentRecords.push({
              userId,
              kind: rem.kind,
              recordId: rem.recordId,
              dueDate: rem.dueDate,
              reason: 'overdue',
            });
          }
        }

        // 2. Due today & lead days: occurrences in [today, maxLeadDate]
        const occurrences = occurrencesBetween(rem, today, maxLeadDate);
        for (const occ of occurrences) {
          if (occ === today && leadDays.includes(0)) {
            const sentKey = `${userId}|${rem.kind}|${rem.recordId}|${occ}|due`;
            if (!sentSet.has(sentKey)) {
              toSendGroups.due.push(remItem);
              pendingSentRecords.push({
                userId,
                kind: rem.kind,
                recordId: rem.recordId,
                dueDate: occ,
                reason: 'due',
              });
            }
          }

          for (const d of leadDays) {
            if (d > 0 && occ === addDaysIso(today, d)) {
              const sentKey = `${userId}|${rem.kind}|${rem.recordId}|${occ}|lead`;
              if (!sentSet.has(sentKey)) {
                toSendGroups[`lead:${d}`].push(remItem);
                pendingSentRecords.push({
                  userId,
                  kind: rem.kind,
                  recordId: rem.recordId,
                  dueDate: occ,
                  reason: 'lead',
                });
              }
            }
          }
        }
      }

      // Collect all lines
      const allLines = [];
      if (toSendGroups.overdue.length) allLines.push(...formatGroupLines('overdue', toSendGroups.overdue));
      if (toSendGroups.due.length) allLines.push(...formatGroupLines('due', toSendGroups.due));
      for (const d of leadDays) {
        if (d > 0 && toSendGroups[`lead:${d}`]?.length) {
          allLines.push(...formatGroupLines(`lead:${d}`, toSendGroups[`lead:${d}`]));
        }
      }

      if (!allLines.length) continue;

      const baseAppUrl = (appUrl || 'https://realrate.ir').replace(/\/$/, '');
      const digest = reminderDigestEmail({
        subject: `RealRate: ${toFa(allLines.length)} یادآوری سررسید`,
        items: allLines,
        appUrl: baseAppUrl,
        settingsUrl: `${baseAppUrl}/settings`,
      });

      await sendEmail(env, {
        to: email,
        subject: digest.subject,
        html: digest.html,
        text: digest.text,
      });

      await dbRecordAlertEmailSent(env, pendingSentRecords);
      // Update local sentSet so no duplicate can happen
      for (const r of pendingSentRecords) {
        sentSet.add(`${r.userId}|${r.kind}|${r.recordId}|${r.dueDate}|${r.reason}`);
      }
      sentCount++;
    } catch (err) {
      logger.error('[ReminderEmail] failed to send digest for user:', { userId: recipient.userId, error: err.message });
    }
  }

  return { recipientsCount: recipients.length, sentCount, emailsSent: sentCount };
}
