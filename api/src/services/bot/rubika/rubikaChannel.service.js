/**
 * rubikaChannel.service.js — Rubika bot feature: post the news to the Rubika channel
 *
 * The international articles of the chosen feeds, as Telegram's channel (newsChannel.service.js),
 * and — when the admin turned it on — the domestic news too: the posts the news section publishes
 * from its channels, with the same Persian headline and summary the site shows. Through the same
 * queue (newsQueue.js) with Rubika's own `app_state` keys, so each channel posts every item once
 * and one failing never holds the other. The message is the headline in bold, a short summary and
 * the source: an international article's source links to the original; a domestic post's source
 * is its channel's name, never a link (the app links out to no Telegram channel). Rubika's
 * formatting is metadata, not markup.
 */

import { getRubikaConfig } from "./rubikaConfig.service.js";
import { sendMessage, richText } from "./rubikaApi.js";
import { enqueueNews, flushNews, shortSummary, acceptsWorld } from "../newsQueue.js";
import { RUBIKA_LIMITS } from "../../../config/rubikaBot.config.js";

/**
 * The message of an article
 * @param {{ title: string, summary?: string, url: string, sourceTitle?: string, source?: string }} item
 *   source: "telegram" for a domestic post (no link), else an international article
 * @returns {{ text: string, metadata?: object }}
 */
export function formatRubikaNews({ title, summary, url, sourceTitle, source }) {
  const short = shortSummary(summary);
  const domestic = source === "telegram";
  return richText([
    { text: String(title || "").trim(), bold: true },
    short ? `\n\n${short}` : "",
    "\n\n",
    domestic ? `منبع: ${sourceTitle || "—"}` : { text: `منبع: ${sourceTitle || "Source"}`, link: url },
  ]);
}

/**
 * Whether Rubika posts a published item: an international article of a chosen feed, or — with
 * `domestic` on — a domestic post of a chosen channel
 * @param {{ feeds: string[]|null, domestic: boolean, domesticChannels: string[]|null }} config
 * @param {{ source?: string, channel: string }} item
 */
export function rubikaAccepts(config, item) {
  if (item.source === "world") return acceptsWorld(config, item);
  if (item.source !== "telegram" || !config.domestic) return false;
  return !config.domesticChannels || config.domesticChannels.includes(String(item.channel || "").toLowerCase());
}

/** Rubika's channel as a queue target (newsQueue.js) */
export const RUBIKA_NEWS = {
  id: "rubika",
  queueKey: "rubika:news:queue",
  sentKey: "rubika:news:sent",
  sendPerRun: RUBIKA_LIMITS.sendPerRun,
  getConfig: getRubikaConfig,
  accepts: rubikaAccepts,
  send: (config, item, opts) => sendMessage(config.token, config.channel, formatRubikaNews(item), opts),
};

/** Add the published news Rubika takes to its queue; @returns {Promise<number>} articles added */
export const enqueueRubikaNews = (env, items, now = Date.now()) => enqueueNews(env, RUBIKA_NEWS, items, now);

/** Post Rubika's waiting articles; @returns {Promise<{ sent: number, waiting: number, error?: string }>} */
export const flushRubikaNews = (env, opts = {}) => flushNews(env, RUBIKA_NEWS, opts);
