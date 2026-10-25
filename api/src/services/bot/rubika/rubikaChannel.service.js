/**
 * rubikaChannel.service.js — Rubika bot feature: post the international news to the Rubika channel
 *
 * The same articles as Telegram's channel (newsChannel.service.js), through the same queue
 * (newsQueue.js) with Rubika's own `app_state` keys, so each channel posts every article once
 * and one failing never holds the other. The message is the headline in bold, a short summary and
 * the source's name linking to the original article (Rubika's formatting is metadata, not markup).
 */

import { getRubikaConfig } from "./rubikaConfig.service.js";
import { sendMessage, richText } from "./rubikaApi.js";
import { enqueueNews, flushNews, shortSummary } from "../newsQueue.js";
import { RUBIKA_LIMITS } from "../../../config/rubikaBot.config.js";

/**
 * The message of an article
 * @param {{ title: string, summary?: string, url: string, sourceTitle?: string }} item
 * @returns {{ text: string, metadata?: object }}
 */
export function formatRubikaNews({ title, summary, url, sourceTitle }) {
  const short = shortSummary(summary);
  return richText([
    { text: String(title || "").trim(), bold: true },
    short ? `\n\n${short}` : "",
    "\n\n",
    { text: `منبع: ${sourceTitle || "Source"}`, link: url },
  ]);
}

/** Rubika's channel as a queue target (newsQueue.js) */
export const RUBIKA_NEWS = {
  id: "rubika",
  queueKey: "rubika:news:queue",
  sentKey: "rubika:news:sent",
  sendPerRun: RUBIKA_LIMITS.sendPerRun,
  getConfig: getRubikaConfig,
  send: (config, item, opts) => sendMessage(config.token, config.channel, formatRubikaNews(item), opts),
};

/** Add the published international news to Rubika's queue; @returns {Promise<number>} articles added */
export const enqueueRubikaNews = (env, items, now = Date.now()) => enqueueNews(env, RUBIKA_NEWS, items, now);

/** Post Rubika's waiting articles; @returns {Promise<{ sent: number, waiting: number, error?: string }>} */
export const flushRubikaNews = (env, opts = {}) => flushNews(env, RUBIKA_NEWS, opts);
