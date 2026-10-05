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
import { runNewsPolling } from "../services/news/news.service.js";
import { dbPurgeOldNews } from "../repositories/news.repository.js";
import { NEWS_LIMITS } from "../config/news.config.js";
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

  // The news section: new posts of the Telegram channels (news.service.js)
  ctx.waitUntil(
    runNewsPolling(env).catch(err => {
      logger.error("[CronPolling] News polling error:", { error: err.message, stack: err.stack });
    })
  );

  // Hourly work: gated on getUTCMinutes() === 0. Keyed off the trigger's own
  // scheduledTime (always set by Cloudflare) rather than the wall clock.
  const scheduledTime = Number(event?.scheduledTime);
  const scheduledDate = Number.isFinite(scheduledTime) && scheduledTime > 0 ? new Date(scheduledTime) : new Date();

  if (scheduledDate.getUTCMinutes() === 0) {
    // Each cleanup on its own: one failing never leaves a rejection unhandled or stops the others
    ctx.waitUntil(
      dbDeleteExpiredSessions(env).catch(err => {
        logger.error("[CronPolling] Expired sessions purge error:", { error: err.message });
      })
    );
    ctx.waitUntil(
      Promise.all([
        purgeExpiredState(env).catch(err => {
          logger.error("[CronPolling] Expired state purge error:", { error: err.message });
        }),
        dbPurgeOldAlertEmailSent(env).catch(err => {
          logger.error("[CronPolling] Alert email sent purge error:", { error: err.message });
        }),
        purgeOldPushRemindersJob(env, { now: scheduledDate }).catch(err => {
          logger.error("[CronPolling] Old push reminders purge error:", { error: err.message });
        }),
        dbPurgeOldNews(env, scheduledDate.getTime() - NEWS_LIMITS.retentionDays * 86400_000).catch(err => {
          logger.error("[CronPolling] Old news purge error:", { error: err.message });
        }),
      ])
    );
  }

  // Daily reminders on Tehran's clock (UTC+3:30, so not on the UTC hour the gate above uses):
  // the email digest at 08:00, the sealed pushes at 09:00
  const tehran = tehranTime(scheduledDate);
  if (tehran.minute === 0 && tehran.hour === 8) {
    ctx.waitUntil(
      runReminderEmailDigest(env, { now: scheduledDate }).catch(err => {
        logger.error("[CronPolling] Reminder email digest error:", { error: err.message, stack: err.stack });
      })
    );
  }
  if (tehran.minute === 0 && tehran.hour === 9) {
    ctx.waitUntil(
      runReminderPushDigest(env, { now: scheduledDate }).catch(err => {
        logger.error("[CronPolling] Reminder push digest error:", { error: err.message, stack: err.stack });
      })
    );
  }
}
