/**
 * rubikaBot.service.js — The Rubika bot: what it does each minute, and its webhook
 *
 * Built like the Telegram bot (bot.service.js): a list of features, each `run(env, opts)` doing
 * its part of the minute and answering `{ sent, waiting?, error? }`; one failing never stops the
 * others, and the result and the last error are kept for the admin panel.
 *
 * Rubika posts the bot's updates to our webhook address followed by the endpoint's name
 * (`/receiveUpdate`, `/receiveInlineMessage`). It sends no secret header, so the secret is in the
 * address itself: an HMAC of the token, which changes with the token and only the Worker can make.
 */

import { API_ORIGIN } from "../../../lib/siteOrigin.js";
import { logger } from "../../../lib/logger.js";
import { RUBIKA_ENDPOINTS } from "../../../config/rubikaBot.config.js";
import { webhookSecret } from "../webhook.js";
import { sendDailyReportOnce } from "../dailyReport.service.js";
import { postDailyAnalysisOnce } from "../dailyAnalysis.service.js";
import { getRubikaConfig, getRubikaStatus, saveRubikaStatus } from "./rubikaConfig.service.js";
import { flushRubikaNews } from "./rubikaChannel.service.js";
import { sendMessage, updateBotEndpoints, richText } from "./rubikaApi.js";

export const RUBIKA_WEBHOOK_PATH = "/api/bot/rubika/webhook";

/** The admin's daily report in Rubika (dailyReport.service.js decides when) */
async function sendRubikaDailyReport(env, { now = Date.now(), fetchFn } = {}) {
  const config = await getRubikaConfig(env);
  await sendDailyReportOnce(env, {
    on: config.dailyReport && Boolean(config.adminChatId),
    dayKey: "rubika:report:day",
    send: (text) => sendMessage(config.token, config.adminChatId, text, { fetchFn }),
  }, now);
  return { sent: 0 };
}

/** The day's AI analysis in the channel every night (dailyAnalysis.service.js decides when) */
async function postRubikaDailyAnalysis(env, { now = Date.now(), fetchFn } = {}) {
  const config = await getRubikaConfig(env);
  return postDailyAnalysisOnce(env, {
    on: config.dailyAnalysis,
    dayKey: "rubika:analysis:day",
    send: (segments) => sendMessage(config.token, config.channel, richText(segments), { fetchFn }),
  }, now);
}

/** The bot's features, run in this order */
export const RUBIKA_FEATURES = [
  { id: "news-channel", run: flushRubikaNews },
  { id: "daily-analysis", run: postRubikaDailyAnalysis },
  { id: "daily-report", run: sendRubikaDailyReport },
];

/**
 * One run of every feature (the cron's minute, or the admin's «ارسال الان»)
 * @param {object} env
 * @param {{ now?: number, fetchFn?: Function }} [opts]
 * @returns {Promise<{ skipped?: boolean, sent: number, waiting: number, error?: string }>}
 */
export async function runRubikaBot(env, opts = {}) {
  const config = await getRubikaConfig(env);
  if (!config.enabled || !config.channel || !config.token) return { skipped: true, sent: 0, waiting: 0 };
  let sent = 0;
  let waiting = 0;
  let error = "";
  for (const feature of RUBIKA_FEATURES) {
    try {
      const result = await feature.run(env, opts);
      sent += result.sent || 0;
      waiting += result.waiting || 0;
      if (result.error) error = result.error;
    } catch (err) {
      error = String(err?.message || err).slice(0, 240);
      logger.error("[Rubika] feature failed", { feature: feature.id, error });
    }
  }
  const now = opts.now ?? Date.now();
  if (sent || error) {
    const previous = (await getRubikaStatus(env)) || {};
    await saveRubikaStatus(env, {
      at: now,
      waiting,
      error,
      ...(sent ? { lastSentAt: now, sentTotal: (Number(previous.sentTotal) || 0) + sent } : {}),
    }).catch(() => {});
  }
  return { sent, waiting, ...(error ? { error } : {}) };
}

/** The secret part of the webhook's path for this token */
export const rubikaWebhookSecret = (token) => webhookSecret(token, "realrate-rubika-webhook");

/**
 * Point Rubika's endpoints at the Worker when the bot is on. Rubika has no way to remove them:
 * while the bot is off, the webhook ignores what it receives.
 * @param {{ enabled: boolean, token: string }} config
 * @param {{ fetchFn?: Function }} [opts]
 * @returns {Promise<{ ok: boolean, error?: string }|null>} null when there is nothing to register
 */
export async function syncRubikaWebhook(config, opts = {}) {
  if (!config.token || !config.enabled) return null;
  const url = `${API_ORIGIN}${RUBIKA_WEBHOOK_PATH}/${await rubikaWebhookSecret(config.token)}`;
  for (const type of RUBIKA_ENDPOINTS) {
    const res = await updateBotEndpoints(config.token, url, type, opts);
    if (!res.ok) return { ok: false, error: res.error };
  }
  return { ok: true };
}
