/**
 * cronPolling.job.js — Cloudflare Worker Scheduled Cron Job
 * Triggered automatically by Cloudflare Workers cron every minute.
 */

import { syncAllSources } from "../services/market/sourceSync.service.js";
import { dbDeleteExpiredSessions } from "../repositories/session.repository.js";
import { purgeExpiredState } from "../repositories/stateStore.repository.js";
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

  // Once an hour is plenty for purging expired sessions (and expired counters in app_state). Keyed off the trigger's own
  // scheduledTime (always set by Cloudflare) rather than the wall clock, so the decision is
  // deterministic for a given tick.
  const scheduledTime = Number(event?.scheduledTime);
  if (Number.isFinite(scheduledTime) && scheduledTime > 0 && new Date(scheduledTime).getUTCMinutes() === 0) {
    ctx.waitUntil(dbDeleteExpiredSessions(env));
    ctx.waitUntil(purgeExpiredState(env));
  }
}
