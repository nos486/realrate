/**
 * news.service.js — The news section: read the Telegram channels every minute and publish what
 * matters to the market
 *
 * Each run (from the minute cron, cronPolling.job.js):
 *   1. every channel's public page (t.me/s/<channel>) is read; a post newer than the last one seen
 *      is new (a channel read for the first time gives its latest NEWS_LIMITS.firstReadPosts)
 *   2. keywords drop what is clearly not market news (no model tokens spent on it)
 *   3. a post that repeats news already published (another channel's repost) is dropped
 *   4. the rest go to Workers AI in batches: one short prompt for several posts decides what is
 *      published and writes its headline and summary. Without the model (no `AI` binding, the
 *      day's budget spent, an error) a post is published only on a high keyword score.
 * Posts beyond the run's model budget stay for the next minute (the channel's cursor stops
 * before them).
 */

import {
  DEFAULT_NEWS_CHANNELS,
  NEWS_LIMITS,
  NEWS_AI_MODELS,
  NEWS_KEYWORD_ONLY_SCORE,
} from "../../config/news.config.js";
import {
  parseTelegramPosts,
  keywordScore,
  isNewsCandidate,
  wordSet,
  isDuplicateNews,
  buildNewsPrompt,
  newsMaxTokens,
  parseNewsVerdicts,
  fallbackNewsItem,
  normalizeChannel,
} from "../../domain/news.js";
import { dbInsertNews, dbRecentNewsTexts } from "../../repositories/news.repository.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { USER_AGENT } from "../market/sources/parsingUtils.js";
import { askWorkersAi, hasWorkersAi } from "./workersAi.js";
import { maybeUpdateNewsAnalysis } from "./newsAnalysis.service.js";
import { logger } from "../../lib/logger.js";

const CHANNELS_KEY = "news:channels";
const STATUS_KEY = "news:status";
const LOCK_KEY = "news:lock";
const cursorKey = (channel) => `news:cursor:${channel}`;
const aiDayKey = (now) => `news:ai:${new Date(now).toISOString().slice(0, 10)}`;
const FETCH_TIMEOUT_MS = 10000;
const FETCH_CONCURRENCY = 6;

/** The channels read (the admin's list, or the default one) */
export async function getNewsChannels(env) {
  const saved = await getStateStore(env)?.get(CHANNELS_KEY, "json").catch(() => null);
  if (Array.isArray(saved?.channels)) return saved.channels;
  return DEFAULT_NEWS_CHANNELS.map((username) => ({ username, enabled: true }));
}

/**
 * Save the admin's list of channels
 * @param {Array<string|{ username: string, enabled?: boolean }>} list
 * @returns {Promise<Array<{ username: string, enabled: boolean }>>}
 */
export async function saveNewsChannels(env, list) {
  const seen = new Set();
  const channels = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const username = normalizeChannel(typeof entry === "string" ? entry : entry?.username);
    if (!username || seen.has(username)) continue;
    seen.add(username);
    channels.push({ username, enabled: typeof entry === "string" ? true : entry?.enabled !== false });
  }
  if (channels.length > NEWS_LIMITS.maxChannels) channels.length = NEWS_LIMITS.maxChannels;
  await getStateStore(env)?.put(CHANNELS_KEY, JSON.stringify({ channels }));
  return channels;
}

/** The last run, by channel (admin panel) */
export async function getNewsStatus(env) {
  return (await getStateStore(env)?.get(STATUS_KEY, "json").catch(() => null)) || null;
}

async function fetchChannelPage(channel) {
  const res = await fetch(`https://t.me/s/${channel}`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "fa,en;q=0.8" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cf: { cacheTtl: 0 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** `fn` over the items, at most `limit` at a time */
async function mapLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * One run over every channel
 * @param {object} env - env.DB, env.AI (Workers AI; optional), env.KV not used
 * @param {{ now?: number, force?: boolean }} [opts] - force: run even while another run holds the lock (admin)
 * @returns {Promise<{ skipped?: boolean, checked: number, candidates: number, published: number, aiCalls: number }>}
 */
export async function runNewsPolling(env, { now = Date.now(), force = false, fetchPage = fetchChannelPage, readPrices } = {}) {
  const store = getStateStore(env);
  if (!store) return { skipped: true, checked: 0, candidates: 0, published: 0, aiCalls: 0 };

  // One run at a time (a run that takes longer than a minute isn't started over)
  const holders = await store.increment(LOCK_KEY, 1, { expirationTtl: 50 });
  if (holders > 1 && !force) return { skipped: true, checked: 0, candidates: 0, published: 0, aiCalls: 0 };

  try {
    const result = await pollChannels(env, store, now, fetchPage);
    // The analyst's card, when new news came in (at most every NEWS_ANALYSIS.minIntervalMinutes)
    result.analysis = await maybeUpdateNewsAnalysis(env, { now, readPrices }).catch((err) => {
      logger.warn("[News] analysis failed:", { error: err?.message });
      return { updated: false, reason: "error" };
    });
    return result;
  } finally {
    await store.delete(LOCK_KEY).catch(() => {});
  }
}

async function pollChannels(env, store, now, fetchPage) {
  const channels = (await getNewsChannels(env)).filter((c) => c.enabled !== false).map((c) => c.username);
  const cursors = await store.getMany(channels.map(cursorKey));
  const previous = (await getNewsStatus(env)) || {};
  const status = { at: now, channels: {}, published: 0, aiCalls: 0, aiError: "" };

  // 1. New posts of every channel
  const pages = await mapLimited(channels, FETCH_CONCURRENCY, async (channel) => {
    try {
      return { channel, ...parseTelegramPosts(await fetchPage(channel)) };
    } catch (err) {
      return { channel, error: err?.message || "fetch failed", posts: [] };
    }
  });

  const fresh = [];
  const titles = {};
  const nextCursor = {};
  for (const page of pages) {
    const cursor = parseInt(cursors.get(cursorKey(page.channel)) || "0", 10) || 0;
    // A post of another channel (a forward shown on this page) belongs to that channel
    const own = page.posts.filter((p) => p.channel === page.channel);
    const newer = cursor ? own.filter((p) => p.postId > cursor) : own.slice(-NEWS_LIMITS.firstReadPosts);
    titles[page.channel] = page.title || previous.channels?.[page.channel]?.title || page.channel;
    nextCursor[page.channel] = Math.max(cursor, ...own.map((p) => p.postId));
    status.channels[page.channel] = {
      title: titles[page.channel],
      ok: !page.error,
      error: page.error ? String(page.error).slice(0, 120) : "",
      lastPostId: nextCursor[page.channel],
      published: previous.channels?.[page.channel]?.published || 0,
    };
    // A page that couldn't be read keeps its cursor (its posts are read next time)
    if (page.error) nextCursor[page.channel] = cursor;
    fresh.push(...newer);
  }
  fresh.sort((a, b) => a.publishedAt - b.publishedAt || a.postId - b.postId);

  // 2. Keywords, then 3. repeats of published news (and of each other)
  const recent = (await dbRecentNewsTexts(env, now - NEWS_LIMITS.duplicateWindowHours * 3600_000))
    .map((r) => wordSet(`${r.title}\n${r.text}`));
  const candidates = [];
  for (const post of fresh) {
    post.score = keywordScore(post.text);
    if (!isNewsCandidate(post.text)) continue;
    const words = wordSet(post.text);
    if (recent.some((r) => isDuplicateNews(words, r)) || candidates.some((c) => isDuplicateNews(words, c.words))) continue;
    candidates.push({ ...post, words });
  }

  // 4. The model, within the run's and the day's budget
  const usedToday = parseInt((await store.get(aiDayKey(now))) || "0", 10) || 0;
  const callsLeft = Math.max(0, Math.min(NEWS_LIMITS.aiCallsPerRun, NEWS_LIMITS.aiCallsPerDay - usedToday));
  const hasModel = hasWorkersAi(env);
  const batches = [];
  for (let i = 0; i < candidates.length; i += NEWS_LIMITS.aiBatchSize) batches.push(candidates.slice(i, i + NEWS_LIMITS.aiBatchSize));

  const published = [];
  let deferred = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    let verdicts = null;
    if (hasModel && b < callsLeft) {
      try {
        status.aiCalls++;
        const { answer } = await askWorkersAi(env, NEWS_AI_MODELS, buildNewsPrompt(batch), { maxTokens: newsMaxTokens(batch.length) });
        verdicts = parseNewsVerdicts(answer, batch.length);
      } catch (err) {
        status.aiError = String(err?.message || err).slice(0, 160);
        logger.warn("[News] model failed:", { error: status.aiError });
      }
    } else if (hasModel && usedToday + status.aiCalls < NEWS_LIMITS.aiCallsPerDay) {
      // Over this run's budget but not the day's: the next minute takes them
      deferred = batches.slice(b).flat();
      break;
    }

    batch.forEach((post, i) => {
      const verdict = verdicts
        ? verdicts.get(i)
        : post.score >= NEWS_KEYWORD_ONLY_SCORE ? fallbackNewsItem(post.text) : null;
      if (!verdict?.keep) return;
      published.push({
        id: `${post.channel}/${post.postId}`,
        channel: post.channel,
        channelTitle: titles[post.channel] || post.channel,
        postId: post.postId,
        url: post.url,
        title: verdict.title,
        summary: verdict.summary,
        text: post.text.slice(0, NEWS_LIMITS.storedTextChars),
        category: verdict.category,
        importance: verdict.importance,
        image: post.image,
        publishedAt: post.publishedAt || now,
        ai: Boolean(verdicts),
      });
    });
  }
  if (status.aiCalls) await store.increment(aiDayKey(now), status.aiCalls, { expirationTtl: 2 * 86400 });

  // A channel's cursor stops before its first post left for the next run
  for (const post of deferred) {
    nextCursor[post.channel] = Math.min(nextCursor[post.channel], post.postId - 1);
  }

  await dbInsertNews(env, published);
  for (const item of published) {
    if (status.channels[item.channel]) status.channels[item.channel].published++;
  }
  status.published = published.length;
  status.aiCallsToday = usedToday + status.aiCalls;
  if (!status.aiError && !hasModel) status.aiError = "AI binding is not configured";

  await Promise.all([
    ...Object.entries(nextCursor).map(([channel, id]) => (id > 0 ? store.put(cursorKey(channel), String(id)) : null)),
    store.put(STATUS_KEY, JSON.stringify(status)),
  ]);

  if (published.length) logger.info("[News] published", { count: published.length, candidates: candidates.length });
  return { checked: fresh.length, candidates: candidates.length, published: published.length, aiCalls: status.aiCalls };
}
