/**
 * reminderPush.job.js — Daily sealed Web Push reminders cron job
 *
 * Runs once a day at 09:00 Asia/Tehran. Loads due sealed push reminder payloads for today,
 * sends them to push services via RFC 8291 / RFC 8292 (Web Push with VAPID), and cleans up
 * expired subscriptions (HTTP 404/410).
 *
 * Zero-knowledge: the server forwards the opaque sealed ciphertext untouched.
 */

import {
  dbGetDuePushReminders,
  dbDeletePushReminders,
  dbDeletePushSubscription,
  dbPurgeOldPushReminders,
} from '../repositories/push.repository.js';
import { sendWebPush, isWebPushConfigured } from '../lib/webPush.js';
import { tehranTime, addDaysIso } from './reminderEmail.job.js';
import { logger } from '../lib/logger.js';

/** Pushes sent at the same time */
const PUSH_CONCURRENCY = 10;

/**
 * Sends all due Web Push reminders for today.
 * @param {object} env
 * @param {object} [options]
 * @param {Date} [options.now]
 * @returns {Promise<{ sentCount: number, errorCount: number }>}
 */
export async function runReminderPushDigest(env, options = {}) {
  if (!isWebPushConfigured(env)) {
    return { sentCount: 0, errorCount: 0, skipped: 'unconfigured' };
  }

  const now = options.now || new Date();
  const tehran = tehranTime(now);
  const today = tehran.day || tehran.date;

  const dueReminders = await dbGetDuePushReminders(env, today);
  if (!dueReminders || dueReminders.length === 0) {
    return { sentCount: 0, errorCount: 0 };
  }

  let sentCount = 0;
  let errorCount = 0;

  const sentReminders = [];
  const sendOne = async (rem) => {
    if (!rem.subscription) {
      errorCount++;
      return;
    }

    try {
      const res = await sendWebPush(env, {
        subscription: rem.subscription,
        data: rem.sealed_payload,
      });

      if (res.expired) {
        // Drop expired subscription (404 or 410 Gone)
        await dbDeletePushSubscription(env, rem.userId, rem.deviceId);
      } else if (res.success) {
        sentCount++;
        // Deleted afterwards, together, so it is not re-sent
        sentReminders.push(rem);
      } else {
        errorCount++;
      }
    } catch (err) {
      errorCount++;
      logger.warn('[ReminderPush] Failed to send push reminder:', {
        deviceId: rem.deviceId,
        error: err.message,
      });
    }
  };

  // A few pushes at a time, and one batch to delete the sent ones
  for (let i = 0; i < dueReminders.length; i += PUSH_CONCURRENCY) {
    await Promise.all(dueReminders.slice(i, i + PUSH_CONCURRENCY).map(sendOne));
  }
  await dbDeletePushReminders(env, sentReminders).catch((err) => {
    logger.warn('[ReminderPush] Failed to delete sent reminders:', { error: err.message });
  });

  return { sentCount, errorCount };
}

/**
 * Purges old sealed push reminders older than 30 days.
 * @param {object} env
 * @param {object} [options]
 */
export async function purgeOldPushRemindersJob(env, options = {}) {
  const now = options.now || new Date();
  const tehran = tehranTime(now);
  const cutoff = addDaysIso(tehran.day || tehran.date, -30);
  await dbPurgeOldPushReminders(env, cutoff);
}
