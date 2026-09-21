/**
 * cronPolling.job.js — Cloudflare Worker Scheduled Cron Job
 * Triggered automatically by Cloudflare Workers cron every minute.
 */

import { syncAllSources } from "../services/market/sourceSync.service.js";
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
}
