/**
 * newsQueue.js — The channel posting queue shared by every messenger (Telegram, Rubika)
 *
 * A messenger's channel is a target: where its queue and its sent links live in `app_state`, how
 * its settings are read, which published items it takes (`accepts`: by default the international
 * articles of the chosen feeds, `acceptsWorld`) and how one article is posted. The news poll hands
 * every published item to `enqueueNews`; the messenger's minute run (`flushNews`) posts the
 * waiting ones, oldest first, a few at a time, so a burst of articles never trips a rate limit.
 * An article is posted once per target: the same link from two feeds is the same article.
 */

import { BOT_LIMITS } from "../../config/telegramBot.config.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { logger } from "../../lib/logger.js";

/**
 * @typedef {object} NewsTarget
 * @property {string} id - the messenger, for the logs
 * @property {string} queueKey - `app_state` key of the waiting articles
 * @property {string} sentKey - `app_state` key of the sent links
 * @property {number} [sendPerRun] - messages per run (BOT_LIMITS.sendPerRun by default)
 * @property {(config: object, item: object) => boolean} [accepts] - which published items it posts (acceptsWorld by default)
 * @property {(env: object) => Promise<{ enabled: boolean, channel: string, token: string, feeds: string[]|null }>} getConfig
 * @property {(config: object, item: object, opts: object) => Promise<{ ok: boolean, error?: string, retryAfter?: number }>} send
 */

/** An article's identity: its link without the query and the fragment */
const articleKey = (url) => String(url || "").split(/[?#]/)[0];

const isOn = (config) => Boolean(config.enabled && config.channel && config.token);

/**
 * An international article of a chosen feed (`config.feeds`: feed ids, null = every feed)
 * @param {{ feeds: string[]|null }} config
 * @param {{ source?: string, channel: string }} item
 */
export const acceptsWorld = (config, item) => item.source === "world" && (!config.feeds || config.feeds.includes(item.channel));

/**
 * A published news item as a queue entry: its Persian headline and summary, link, source name and
 * kind (`world`: an international feed's article; `telegram`: a domestic channel's post)
 */
function toQueued(item) {
  return {
    key: articleKey(item.url),
    url: item.url,
    title: item.title,
    summary: item.summary === item.title ? "" : item.summary,
    sourceTitle: item.channelTitle || item.channel,
    source: item.source === "world" ? "world" : "telegram",
    publishedAt: item.publishedAt || 0,
  };
}

/**
 * Add the published news a target takes to its queue (when it is on)
 * @param {object} env
 * @param {NewsTarget} target
 * @param {Array<{ source?: string, channel: string, channelTitle?: string, url: string, title: string, summary?: string, publishedAt?: number }>} items - news items as the pipeline publishes them (`channel` is the feed id, or a domestic post's channel)
 * @param {number} now
 * @returns {Promise<number>} articles added
 */
export async function enqueueNews(env, target, items, now = Date.now()) {
  if (!items?.length) return 0;
  const config = await target.getConfig(env);
  if (!isOn(config)) return 0;
  const store = getStateStore(env);
  if (!store) return 0;

  const accepts = target.accepts || acceptsWorld;
  const chosen = items.filter((item) => accepts(config, item));
  if (!chosen.length) return 0;
  const stored = await store.getMany([target.queueKey, target.sentKey], "json");
  const queue = Array.isArray(stored.get(target.queueKey)) ? stored.get(target.queueKey) : [];
  const sent = new Set(Array.isArray(stored.get(target.sentKey)) ? stored.get(target.sentKey) : []);
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
  await store.put(target.queueKey, JSON.stringify(next));
  return added.length;
}

/** The waiting articles as stored: an array, without the too-old ones */
const readQueue = (stored, key, oldest, now) =>
  (Array.isArray(stored.get(key)) ? stored.get(key) : []).filter((q) => (q.publishedAt || now) >= oldest);

/**
 * Post a target's waiting articles (a few per run), oldest first
 *
 * One run at a time per target: the minute's run follows the news poll, so a slow poll (the AI's
 * work, heaviest after midnight) used to start one minute's run while the last one was still
 * sending, and both read the same queue and posted the same articles. A run holds a short lock
 * (BOT_LIMITS.flushLockSec) and stops sending within BOT_LIMITS.flushBudgetMs, so it never outlives
 * the lock. Each sent article is saved at once, and an article already in the sent list is never
 * posted again (a news poll that wrote the queue back while a run was sending cannot bring it back).
 * @param {object} env
 * @param {NewsTarget} target
 * @param {{ now?: number, fetchFn?: Function }} [opts]
 * @returns {Promise<{ sent: number, waiting: number, skipped?: boolean, error?: string }>}
 */
export async function flushNews(env, target, { now = Date.now(), fetchFn } = {}) {
  const store = getStateStore(env);
  const config = await target.getConfig(env);
  if (!store || !isOn(config)) return { sent: 0, waiting: 0 };
  const oldest = now - BOT_LIMITS.queueMaxHours * 3600_000;
  const keys = [target.queueKey, target.sentKey];
  const stored = await store.getMany(keys, "json");
  const sent = Array.isArray(stored.get(target.sentKey)) ? stored.get(target.sentKey) : [];
  const sentSet = new Set(sent);
  let queue = readQueue(stored, target.queueKey, oldest, now).filter((q) => !sentSet.has(q.key));
  if (!queue.length) return { sent: 0, waiting: 0 };

  const lockKey = `${target.queueKey}:lock`;
  const holders = await store.increment(lockKey, 1, { expirationTtl: BOT_LIMITS.flushLockSec });
  if (holders > 1) return { sent: 0, waiting: queue.length, skipped: true };

  const startedAt = Date.now();
  const done = new Set(); // sent or given up on: off the queue
  const tries = new Map();
  let count = 0;
  let error = "";

  /** Write the run's changes onto the queue as it is now (the news poll may have added to it) */
  const save = async () => {
    const fresh = readQueue(await store.getMany([target.queueKey], "json"), target.queueKey, oldest, now)
      .filter((q) => !done.has(q.key) && !sentSet.has(q.key))
      .map((q) => (tries.has(q.key) ? { ...q, tries: tries.get(q.key) } : q));
    await Promise.all([
      store.put(target.queueKey, JSON.stringify(fresh)),
      count ? store.put(target.sentKey, JSON.stringify(sent.slice(-BOT_LIMITS.sentMax))) : null,
    ]);
    queue = fresh;
  };

  try {
    for (const item of queue.slice(0, target.sendPerRun || BOT_LIMITS.sendPerRun)) {
      if (Date.now() - startedAt > BOT_LIMITS.flushBudgetMs) break;
      const res = await target.send(config, item, { fetchFn });
      if (res.ok) {
        count++;
        sent.push(item.key);
        sentSet.add(item.key);
        done.add(item.key);
        // Saved at once: a run cut short never leaves a posted article waiting
        await save();
        continue;
      }
      error = res.error || "send failed";
      // Rate limited, or the channel/token is wrong: stop and try again next minute. Only a message
      // the messenger keeps refusing is given up on, so it never blocks the ones behind it.
      const tried = (item.tries || 0) + 1;
      tries.set(item.key, tried);
      if (res.retryAfter) break;
      if (tried >= BOT_LIMITS.maxTries) {
        logger.error("[Bot] a message was refused repeatedly — dropped", { target: target.id, url: item.url, error });
        done.add(item.key);
        continue;
      }
      break;
    }
    if (error) await save();
  } finally {
    await store.delete(lockKey).catch(() => {});
  }
  if (error) logger.warn("[Bot] sending to the channel failed", { target: target.id, error });
  return { sent: count, waiting: queue.length, ...(error ? { error } : {}) };
}

/** Shorten a summary to `chars`, at a word boundary */
export function shortSummary(summary, chars = BOT_LIMITS.summaryChars) {
  const body = String(summary || "").trim();
  return body.length > chars ? `${body.slice(0, chars).replace(/\s+\S*$/, "")}…` : body;
}
