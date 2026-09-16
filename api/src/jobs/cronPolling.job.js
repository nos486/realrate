/**
 * cronPolling.job.js — Cloudflare Worker Scheduled Cron Job
 * Triggered automatically by Cloudflare Workers cron every minute.
 */

import { handleScheduledPriceExtraction } from "../services/market/priceAggregator.service.js";
import { bourseSymbolsSourceAdapter } from "../services/market/sources/bourseSymbols.source.adapter.js";
import { emofidFundsSourceAdapter } from "../services/market/sources/emofidFunds.source.adapter.js";
import { charismaFundsSourceAdapter } from "../services/market/sources/charismaFunds.source.adapter.js";
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
      bourseSymbolsSourceAdapter.handleScheduledSync(env).catch(err => {
        logger.error("[CronPolling] Bourse sync error:", { error: err.message, stack: err.stack });
      }),
      emofidFundsSourceAdapter.handleScheduledSync(env).catch(err => {
        logger.error("[CronPolling] Emofid funds sync error:", { error: err.message, stack: err.stack });
      }),
      charismaFundsSourceAdapter.handleScheduledSync(env).catch(err => {
        logger.error("[CronPolling] Charisma funds sync error:", { error: err.message, stack: err.stack });
      }),
    ])
  );
}
