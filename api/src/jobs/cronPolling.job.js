/**
 * cronPolling.job.js — Cloudflare Worker Scheduled Cron Job
 * Triggered automatically by Cloudflare Workers cron every minute.
 */

import { handleScheduledPriceExtraction } from "../services/market/priceAggregator.service.js";
import { syncAllCatalogSources } from "../services/market/catalogFeeds.service.js";
import { logger } from "../lib/logger.js";

/**
 * Run scheduled polling jobs
 * @param {object} event - ScheduledEvent
 * @param {object} env - Cloudflare Worker environment bindings
 * @param {object} ctx - ExecutionContext (waitUntil)
 */
export async function runCronPolling(event, env, ctx) {
  ctx.waitUntil(
    Promise.all([
      handleScheduledPriceExtraction(env).catch(err => {
        logger.error("[CronPolling] Price extraction error:", { error: err.message, stack: err.stack });
      }),
      syncAllCatalogSources(env).catch(err => {
        logger.error("[CronPolling] Catalog feeds sync error:", { error: err.message, stack: err.stack });
      }),
    ])
  );
}
