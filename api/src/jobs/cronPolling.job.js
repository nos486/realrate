/**
 * cronPolling.job.js — Cloudflare Worker Scheduled Cron Job
 * Triggered automatically by Cloudflare Workers cron every minute.
 */

import { syncAllSources } from "../services/market/sourceSync.service.js";
import { dbDeleteExpiredSessions } from "../repositories/session.repository.js";
import { purgeExpiredState } from "../repositories/stateStore.repository.js";
import { dbPurgeOldAlertEmailSent } from "../repositories/alertEmail.repository.js";
import { runReminderEmailDigest, tehranTime } from "./reminderEmail.job.js";
import { runReminderPushDigest, purgeOldPushRemindersJob } from "./reminderPush.job.js";
import { logger } from "../lib/logger.js";

/**
 * Run scheduled polling jobs
 * @param {object} event - ScheduledEvent
 * @param {object} env - Cloudflare Worker environment bindings
 * @param {object} ctx - ExecutionContext (waitUntil)
 */
export async function runCronPolling(event, env, ctx) {
  ctx.waitUntil(
    syncAllSources(env).catch(err => {
      logger.error("[CronPolling] Source sync error:", { error: err.message, stack: err.stack });
    })
  );

  // Hourly work: gated on getUTCMinutes() === 0. Keyed off the trigger's own
  // scheduledTime (always set by Cloudflare) rather than the wall clock.
  const scheduledTime = Number(event?.scheduledTime);
  const scheduledDate = Number.isFinite(scheduledTime) && scheduledTime > 0 ? new Date(scheduledTime) : new Date();

  if (scheduledDate.getUTCMinutes() === 0) {
    ctx.waitUntil(dbDeleteExpiredSessions(env));
    ctx.waitUntil(
      Promise.all([
        purgeExpiredState(env),
        dbPurgeOldAlertEmailSent(env).catch(err => {
          logger.error("[CronPolling] Alert email sent purge error:", { error: err.message });
        }),
        purgeOldPushRemindersJob(env, { now: scheduledDate }).catch(err => {
          logger.error("[CronPolling] Old push reminders purge error:", { error: err.message });
        }),
      ])
    );

    // Daily email digest: once a day at 08:00 Asia/Tehran
    const tehran = tehranTime(scheduledDate);
    if (tehran.hour === 8) {
      ctx.waitUntil(
        runReminderEmailDigest(env, { now: scheduledDate }).catch(err => {
          logger.error("[CronPolling] Reminder email digest error:", { error: err.message, stack: err.stack });
        })
      );
    }

    // Daily sealed push notifications: once a day at 09:00 Asia/Tehran
    if (tehran.hour === 9) {
      ctx.waitUntil(
        runReminderPushDigest(env, { now: scheduledDate }).catch(err => {
          logger.error("[CronPolling] Reminder push digest error:", { error: err.message, stack: err.stack });
        })
      );
    }
  }
}
