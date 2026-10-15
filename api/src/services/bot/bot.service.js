/**
 * bot.service.js — The Telegram bot: what it does each minute
 *
 * The bot is a list of features. A feature has an `id` and a `run(env, opts)` that does its
 * part of the minute's work and answers `{ sent, waiting?, error? }`. Today it has one, posting
 * the international news to the channel (newsChannel.service.js); another (notifying users, say)
 * is one more entry in BOT_FEATURES. Features feed each other nothing: one failing never stops the
 * others. The result and the last error are kept for the admin panel.
 */

import { flushNewsQueue } from "./newsChannel.service.js";
import { getBotConfig, getBotStatus, saveBotStatus } from "./botConfig.service.js";
import { logger } from "../../lib/logger.js";

/** The bot's features, run in this order */
export const BOT_FEATURES = [{ id: "news-channel", run: flushNewsQueue }];

/**
 * One run of every feature (the cron's minute, or the admin's «اجرا»)
 * @param {object} env
 * @param {{ now?: number, fetchFn?: Function }} [opts]
 * @returns {Promise<{ skipped?: boolean, sent: number, waiting: number, error?: string }>}
 */
export async function runBot(env, opts = {}) {
  const config = await getBotConfig(env);
  if (!config.enabled || !config.channel || !config.token) return { skipped: true, sent: 0, waiting: 0 };
  let sent = 0;
  let waiting = 0;
  let error = "";
  let aiError = "";
  for (const feature of BOT_FEATURES) {
    try {
      const result = await feature.run(env, opts);
      sent += result.sent || 0;
      waiting += result.waiting || 0;
      if (result.error) error = result.error;
      if (result.aiError) aiError = result.aiError;
    } catch (err) {
      error = String(err?.message || err).slice(0, 240);
      logger.error("[Bot] feature failed", { feature: feature.id, error });
    }
  }
  const now = opts.now ?? Date.now();
  if (sent || error || aiError) {
    const previous = (await getBotStatus(env)) || {};
    await saveBotStatus(env, {
      at: now,
      waiting,
      error,
      aiError,
      ...(sent ? { lastSentAt: now, sentTotal: (Number(previous.sentTotal) || 0) + sent } : {}),
    }).catch(() => {});
  }
  return { sent, waiting, ...(error ? { error } : {}) };
}
