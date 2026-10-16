/**
 * newsChannel.service.js — Bot feature: post the international news feeds' articles to the
 * Telegram channel
 *
 * The news poll (news.service.js) hands every international article it publishes to `enqueueFeedNews`; the bot's
 * minute run (`flushNewsQueue`) posts the waiting ones, oldest first, a few at a time, so a burst
 * of articles never trips Telegram's rate limit. An article is posted once: the queue and the list
 * of sent links are kept in `app_state`, and the same link from two feeds is the same article.
 * Only what the news pipeline publishes is posted: the same Persian headline and summary the
 * site shows (translated once, by the pipeline's model), with the link to the original article.
 * An article the pipeline did not publish (not market news, a repeat) is not posted.
 */

import { BOT_LIMITS } from "../../config/telegramBot.config.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { getBotConfig } from "./botConfig.service.js";
import { sendMessage, escapeHtml } from "./telegramApi.js";
import { logger } from "../../lib/logger.js";

const QUEUE_KEY = "bot:news:queue";
const SENT_KEY = "bot:news:sent";

/** An article's identity: its link without the query and the fragment */
const articleKey = (url) => String(url || "").split(/[?#]/)[0];

/**
 * The message of an article: headline in bold, a short summary, the source's name linking to the original article
 * @param {{ title: string, summary?: string, url: string, sourceTitle?: string }} item
 * @returns {string} Telegram HTML
 */
export function formatNewsMessage({ title, summary, url, sourceTitle }) {
  const body = String(summary || "").trim();
  const short = body.length > BOT_LIMITS.summaryChars ? `${body.slice(0, BOT_LIMITS.summaryChars).replace(/\s+\S*$/, "")}…` : body;
  const parts = [`<b>${escapeHtml(title)}</b>`];
  if (short) parts.push(escapeHtml(short));
  parts.push(`<a href="${escapeHtml(url)}">منبع: ${escapeHtml(sourceTitle || "Source")}</a>`);
  return parts.join("\n\n");
}

/** A published news item as a queue entry: its Persian headline and summary, link and source name */
function toQueued(item) {
  return { key: articleKey(item.url), url: item.url, title: item.title, summary: item.summary === item.title ? "" : item.summary, sourceTitle: item.channelTitle || item.channel, publishedAt: item.publishedAt || 0 };
}

/**
 * Add the published international news to the queue (when the bot is on and the item's feed is chosen)
 * @param {object} env
 * @param {Array<{ source?: string, channel: string, channelTitle?: string, url: string, title: string, summary?: string, publishedAt?: number }>} items - news items as the pipeline publishes them (`channel` is the feed id)
 * @param {number} now
 * @returns {Promise<number>} articles added
 */
export async function enqueueFeedNews(env, items, now = Date.now()) {
  const posts = (items || []).filter((n) => n.source === "world");
  if (!posts.length) return 0;
  const config = await getBotConfig(env);
  if (!config.enabled || !config.channel || !config.token) return 0;
  const store = getStateStore(env);
  if (!store) return 0;

  const chosen = config.feeds ? posts.filter((p) => config.feeds.includes(p.channel)) : posts;
  if (!chosen.length) return 0;
  const stored = await store.getMany([QUEUE_KEY, SENT_KEY], "json");
  const queue = Array.isArray(stored.get(QUEUE_KEY)) ? stored.get(QUEUE_KEY) : [];
  const sent = new Set(Array.isArray(stored.get(SENT_KEY)) ? stored.get(SENT_KEY) : []);
  const known = new Set([...queue.map((q) => q.key), ...sent]);

  const added = [];
  for (const post of chosen) {
    const item = toQueued(post);
    if (!item.title || !item.key || known.has(item.key)) continue;
    known.add(item.key);
    added.push(item);
  }
  if (!added.length) return 0;
  const oldest = now - BOT_LIMITS.queueMaxHours * 3600_000;
  const next = [...queue, ...added]
    .filter((q) => (q.publishedAt || now) >= oldest)
    .sort((a, b) => a.publishedAt - b.publishedAt)
    .slice(-BOT_LIMITS.queueMax);
  await store.put(QUEUE_KEY, JSON.stringify(next));
  return added.length;
}

/**
 * Post the waiting articles (at most BOT_LIMITS.sendPerRun), oldest first
 * @param {object} env
 * @param {{ now?: number, fetchFn?: Function }} [opts]
 * @returns {Promise<{ sent: number, waiting: number, error?: string }>}
 */
export async function flushNewsQueue(env, { now = Date.now(), fetchFn } = {}) {
  const store = getStateStore(env);
  const config = await getBotConfig(env);
  if (!store || !config.enabled || !config.channel || !config.token) return { sent: 0, waiting: 0 };
  const stored = await store.getMany([QUEUE_KEY, SENT_KEY], "json");
  const oldest = now - BOT_LIMITS.queueMaxHours * 3600_000;
  let queue = (Array.isArray(stored.get(QUEUE_KEY)) ? stored.get(QUEUE_KEY) : []).filter((q) => (q.publishedAt || now) >= oldest);
  if (!queue.length) return { sent: 0, waiting: 0 };
  const sent = Array.isArray(stored.get(SENT_KEY)) ? stored.get(SENT_KEY) : [];

  const ready = queue.slice(0, BOT_LIMITS.sendPerRun);
  let count = 0;
  let error = "";
  for (const item of ready) {
    const res = await sendMessage(config.token, config.channel, formatNewsMessage(item), { fetchFn, previewUrl: item.url });
    if (res.ok) {
      count++;
      sent.push(item.key);
      queue = queue.filter((q) => q.key !== item.key);
      continue;
    }
    error = res.error || "send failed";
    // Rate limited, or the channel/token is wrong: stop and try again next minute. Only a message
    // Telegram keeps refusing is given up on, so it never blocks the ones behind it.
    queue = queue.map((q) => (q.key === item.key ? { ...q, tries: (q.tries || 0) + 1 } : q));
    if (res.retryAfter) break;
    if ((queue.find((q) => q.key === item.key)?.tries || 0) >= BOT_LIMITS.maxTries) {
      logger.error("[Bot] a message was refused repeatedly — dropped", { url: item.url, error });
      queue = queue.filter((q) => q.key !== item.key);
      continue;
    }
    break;
  }
  await Promise.all([
    store.put(QUEUE_KEY, JSON.stringify(queue)),
    count ? store.put(SENT_KEY, JSON.stringify(sent.slice(-BOT_LIMITS.sentMax))) : null,
  ]);
  if (error) logger.warn("[Bot] sending to the channel failed", { error });
  return { sent: count, waiting: queue.length, ...(error ? { error } : {}) };
}
