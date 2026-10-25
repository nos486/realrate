/**
 * newsChannel.service.js — Bot feature: post the international news feeds' articles to the
 * Telegram channel
 *
 * The news poll (news.service.js, through messengers.js) hands every international article it
 * publishes to `enqueueFeedNews`; the bot's minute run (`flushNewsQueue`) posts the waiting ones.
 * The queue itself is shared with the other messengers (newsQueue.js); this file is Telegram's
 * target: its `app_state` keys, its settings and its message. Only what the news pipeline
 * publishes is posted: the same Persian headline and summary the site shows (translated once, by
 * the pipeline's model), with the link to the original article.
 */

import { getBotConfig } from "./botConfig.service.js";
import { sendMessage, escapeHtml } from "./telegramApi.js";
import { enqueueNews, flushNews, shortSummary } from "./newsQueue.js";

/**
 * The message of an article: headline in bold, a short summary, the source's name linking to the original article
 * @param {{ title: string, summary?: string, url: string, sourceTitle?: string }} item
 * @returns {string} Telegram HTML
 */
export function formatNewsMessage({ title, summary, url, sourceTitle }) {
  const short = shortSummary(summary);
  const parts = [`<b>${escapeHtml(title)}</b>`];
  if (short) parts.push(escapeHtml(short));
  parts.push(`<a href="${escapeHtml(url)}">منبع: ${escapeHtml(sourceTitle || "Source")}</a>`);
  return parts.join("\n\n");
}

/** Telegram's channel as a queue target (newsQueue.js) */
export const TELEGRAM_NEWS = {
  id: "telegram",
  queueKey: "bot:news:queue",
  sentKey: "bot:news:sent",
  getConfig: getBotConfig,
  send: (config, item, opts) => sendMessage(config.token, config.channel, formatNewsMessage(item), { ...opts, previewUrl: item.url }),
};

/**
 * Add the published international news to Telegram's queue
 * @param {object} env
 * @param {object[]} items - news items as the pipeline publishes them
 * @param {number} [now]
 * @returns {Promise<number>} articles added
 */
export const enqueueFeedNews = (env, items, now = Date.now()) => enqueueNews(env, TELEGRAM_NEWS, items, now);

/**
 * Post Telegram's waiting articles (at most BOT_LIMITS.sendPerRun), oldest first
 * @param {object} env
 * @param {{ now?: number, fetchFn?: Function }} [opts]
 * @returns {Promise<{ sent: number, waiting: number, error?: string }>}
 */
export const flushNewsQueue = (env, opts = {}) => flushNews(env, TELEGRAM_NEWS, opts);
