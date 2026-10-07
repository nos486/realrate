/**
 * news.service.js — The news section: read the Telegram channels every minute and publish what
 * matters to the market
 *
 * Each run (from the minute cron, cronPolling.job.js):
 *   1. every channel's public page (t.me/s/<channel>) is read; a post newer than the last one seen
 *      is new (a channel read for the first time gives its latest NEWS_LIMITS.firstReadPosts)
 *   2. keywords drop what is clearly not market news (political or security words alone are not
 *      enough: an economic word is needed too), and a vulgar word drops a post (no model tokens
 *      spent on either)
 *   3. a post that repeats news already published (another channel's repost) is dropped
 *   4. the rest go to Workers AI in batches: one short prompt for several posts decides what is
 *      published and writes its headline and summary. Nothing is published without the model:
 *      no keyword-only publishing, and no other model is tried when it fails.
 * Posts the model hasn't decided yet — beyond the run's or the day's budget, or in a batch it failed
 * on (the error is logged and kept for the admin's panel) — wait in a queue (`news:pending`, at
 * most NEWS_LIMITS.pendingMax, dropped after NEWS_LIMITS.pendingMaxHours) and go first next run.
 * The channels' cursors always move on: a post is read from Telegram once, and never decided twice.
 */

import {
  DEFAULT_NEWS_CHANNELS,
  NEWS_LIMITS,
  NEWS_AI_MODEL,
} from "../../config/news.config.js";
import {
  parseTelegramPosts,
  isNewsCandidate,
  hasProfanity,
  wordSet,
  isDuplicateNews,
  buildNewsPrompt,
  newsMaxTokens,
  parseNewsVerdicts,
  fallbackNewsItem,
  normalizeChannel,
  tehranDayStart,
} from "../../domain/news.js";
import { dbInsertNews, dbRecentNewsTexts } from "../../repositories/news.repository.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { USER_AGENT } from "../market/sources/parsingUtils.js";
import { askWorkersAi, hasWorkersAi } from "./workersAi.js";
import { maybeUpdateNewsAnalysis } from "./newsAnalysis.service.js";
import { notifyImportantNews } from "./newsPush.service.js";
import { logger } from "../../lib/logger.js";

const CHANNELS_KEY = "news:channels";
const STATUS_KEY = "news:status";
const LOCK_KEY = "news:lock";
const PENDING_KEY = "news:pending";
const cursorKey = (channel) => `news:cursor:${channel}`;
/** The model calls of a Tehran day (the budget and the report share the same day) */
const aiDayKey = (now) => `news:ai:${tehranDayStart(now)}`;
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
 * @returns {Promise<{ skipped?: boolean, checked: number, candidates: number, published: number, waiting?: number, aiCalls: number }>}
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
    // The lock is the scheduled run's: an admin's forced run alongside it leaves it be
    if (holders === 1) await store.delete(LOCK_KEY).catch(() => {});
  }
}

const postKey = (p) => `${p.channel}/${p.postId}`;

/** The queue as stored: posts not older than NEWS_LIMITS.pendingMaxHours */
function readPending(raw, now) {
  let list = [];
  try {
    list = JSON.parse(raw || "[]");
  } catch {
    list = [];
  }
  const oldest = now - NEWS_LIMITS.pendingMaxHours * 3600_000;
  return (Array.isArray(list) ? list : [])
    .filter((p) => p && p.channel && Number.isInteger(p.postId) && typeof p.text === "string" && (p.publishedAt || now) >= oldest);
}

/** The queue to store: what the posts need to be decided later, at most NEWS_LIMITS.pendingMax (the oldest go first) */
function writePendingList(posts) {
  const list = posts.map(({ channel, postId, url, text, image, publishedAt, tries }) => ({ channel, postId, url, text, image, publishedAt, ...(tries ? { tries } : {}) }));
  if (list.length > NEWS_LIMITS.pendingMax) {
    logger.warn("[News] the queue is full — the oldest waiting posts are dropped", { dropped: list.length - NEWS_LIMITS.pendingMax });
  }
  return list.slice(-NEWS_LIMITS.pendingMax);
}

/** Runs kept in the report (only those that decided something or failed) */
const REPORT_RUNS = 12;
const REPORT_COUNTS = ["checked", "notMarket", "duplicates", "sent", "rejected", "published", "aiCalls"];

/**
 * The admin's report, carried in the status (no extra read or write): this run, today's totals
 * (Tehran day) and the last runs that did something
 * @param {object} previous - the previous status
 * @param {{ at: number, checked: number, notMarket: number, duplicates: number, sent: number,
 *   rejected: number, published: number, waiting: number, aiCalls: number, error: string }} run
 * @returns {{ run: object, today: object, runs: object[] }}
 */
export function newsReport(previous, run) {
  const day = tehranDayStart(run.at);
  const today = previous?.today?.day === day ? { ...previous.today } : { day, ...Object.fromEntries(REPORT_COUNTS.map((k) => [k, 0])) };
  for (const k of REPORT_COUNTS) today[k] = (Number(today[k]) || 0) + (Number(run[k]) || 0);
  if (run.error) today.errors = (Number(today.errors) || 0) + 1;
  // A run kept only for what it did (posts merely waiting in the queue add nothing new)
  const busy = run.checked || run.error;
  const runs = [...(busy ? [run] : []), ...(Array.isArray(previous?.runs) ? previous.runs : [])].slice(0, REPORT_RUNS);
  return { run, today, runs };
}

async function pollChannels(env, store, now, fetchPage) {
  const channels = (await getNewsChannels(env)).filter((c) => c.enabled !== false).map((c) => c.username);
  const cursors = await store.getMany([...channels.map(cursorKey), PENDING_KEY]);
  // Candidates left undecided by earlier runs (newest-first cap; stale ones dropped)
  const pending = readPending(cursors.get(PENDING_KEY), now);
  const previous = (await getNewsStatus(env)) || {};
  const status = { at: now, channels: {}, published: 0, aiCalls: 0, aiError: "", aiModel: NEWS_AI_MODEL.label };

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

  // 2. Keywords: not market news, or vulgar, is never sent to the model (the waiting ones are
  // already past them)
  const pendingIds = new Set(pending.map(postKey));
  const screened = [...pending];
  let notMarket = 0;
  for (const post of fresh) {
    if (pendingIds.has(postKey(post))) continue;
    if (hasProfanity(post.text) || !isNewsCandidate(post.text)) notMarket++;
    else screened.push(post);
  }

  // 3. Repeats of published news (and of each other); recent news is read only when there is a
  // post to compare with it — most runs have none
  const recent = screened.length
    ? (await dbRecentNewsTexts(env, now - NEWS_LIMITS.duplicateWindowHours * 3600_000)).map((r) => wordSet(`${r.title}\n${r.text}`))
    : [];
  const candidates = [];
  let duplicates = 0;
  for (const post of screened) {
    const words = wordSet(post.text);
    if (recent.some((r) => isDuplicateNews(words, r)) || candidates.some((c) => isDuplicateNews(words, c.words))) {
      duplicates++;
      continue;
    }
    candidates.push({ ...post, words });
  }

  // 4. The model, within the run's and the day's budget
  const usedToday = parseInt((await store.get(aiDayKey(now))) || "0", 10) || 0;
  const callsLeft = Math.max(0, Math.min(NEWS_LIMITS.aiCallsPerRun, NEWS_LIMITS.aiCallsPerDay - usedToday));
  const hasModel = hasWorkersAi(env);
  // Posts whose request already failed: set aside after NEWS_LIMITS.aiMaxTries, else tried alone
  // and last, so a post the model can't take never holds the others back
  const gaveUp = candidates.filter((p) => (p.tries || 0) >= NEWS_LIMITS.aiMaxTries);
  if (gaveUp.length) {
    logger.error("[News] posts the model failed on repeatedly — set aside", { posts: gaveUp.map(postKey), tries: NEWS_LIMITS.aiMaxTries });
  }
  const firstTry = candidates.filter((p) => !p.tries);
  const retried = candidates.filter((p) => p.tries > 0 && p.tries < NEWS_LIMITS.aiMaxTries);
  const batches = [];
  for (let i = 0; i < firstTry.length; i += NEWS_LIMITS.aiBatchSize) batches.push(firstTry.slice(i, i + NEWS_LIMITS.aiBatchSize));
  for (const post of retried) batches.push([post]);

  const published = [];
  const deferred = [];
  let decided = 0;
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    // No model, or over the run's or the day's budget: nothing is published without it (no
    // keyword-only publishing); they wait in the queue
    if (!hasModel || b >= callsLeft) {
      deferred.push(...batches.slice(b).flat());
      break;
    }
    let verdicts;
    try {
      status.aiCalls++;
      const answer = await askWorkersAi(env, NEWS_AI_MODEL, buildNewsPrompt(batch), { maxTokens: newsMaxTokens(batch.length) + NEWS_AI_MODEL.reasoningTokens, temperature: 0 });
      verdicts = parseNewsVerdicts(answer, batch.length);
      // An answer that says nothing about any post: the model failed
      if (verdicts.size === 0) {
        const text = typeof answer === "string" ? answer : JSON.stringify(answer ?? null);
        throw new Error(`unreadable answer (no JSON verdicts): «${text.replace(/\s+/g, " ").trim().slice(0, 100)}»`);
      }
    } catch (err) {
      // The model failed: no other model and no keyword-only publishing; these posts and the rest
      // wait for the next run, and the error is logged and shown in the admin's panel
      status.aiError = String(err?.message || err).slice(0, 240);
      logger.error("[News] model failed — nothing published, posts kept for the next run", {
        model: NEWS_AI_MODEL.id,
        posts: batches.slice(b).flat().length,
        error: status.aiError,
      });
      // The failed request's posts count a try
      deferred.push(...batch.map((p) => ({ ...p, tries: (p.tries || 0) + 1 })));
      // A post retried alone failed on its own: the next one is still asked. A first try failing
      // means the model is likely down: the rest wait as they are
      if (batch.length === 1 && batch[0].tries > 0) continue;
      deferred.push(...batches.slice(b + 1).flat());
      break;
    }

    // A post the answer left out (cut off by the output limit, skipped) waits for the next run
    const missed = batch.filter((_, i) => !verdicts.has(i));
    if (missed.length) {
      deferred.push(...missed);
      logger.warn("[News] the model's answer left posts out — kept for the next run", { posts: missed.length });
    }
    decided += batch.length - missed.length;
    batch.forEach((post, i) => {
      let verdict = verdicts.get(i);
      // The model's headline slipped into another language: the post's own words, its verdict kept
      if (verdict?.keep && verdict.foreign) {
        const own = fallbackNewsItem(post.text);
        verdict = { ...verdict, title: own.title, summary: own.summary };
      }
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
        ai: true,
      });
    });
  }
  if (status.aiCalls) await store.increment(aiDayKey(now), status.aiCalls, { expirationTtl: 2 * 86400 });

  // The undecided wait in the queue (the cursors move on regardless)
  const waiting = writePendingList(deferred);

  await dbInsertNews(env, published);
  // Important fresh news: a push to the browsers that asked for it
  if (published.length) {
    await notifyImportantNews(env, published, { now }).catch((err) => {
      logger.warn("[News] push failed:", { error: err?.message });
    });
  }
  for (const item of published) {
    if (status.channels[item.channel]) status.channels[item.channel].published++;
  }
  status.published = published.length;
  status.aiCallsToday = usedToday + status.aiCalls;
  // The day's budget used up is not a model error: a note for the panel (logged once a day)
  status.budgetUsedUp = hasModel && deferred.length > 0 && usedToday + status.aiCalls >= NEWS_LIMITS.aiCallsPerDay;
  if (status.budgetUsedUp && !previous.budgetUsedUp) {
    logger.warn("[News] the day's model budget is used up — posts wait in the queue", { waiting: waiting.length });
  }
  if (!status.aiError && !hasModel && candidates.length) {
    status.aiError = "AI binding is not configured";
    logger.error("[News] no model (AI binding) — nothing published", { candidates: candidates.length });
  }
  Object.assign(status, newsReport(previous, {
    at: now,
    // A post is counted once, when it is decided (a waiting one, the run that decides it)
    checked: notMarket + duplicates + decided,
    notMarket,
    duplicates,
    sent: decided,
    rejected: decided - published.length,
    published: published.length,
    waiting: waiting.length,
    aiCalls: status.aiCalls,
    error: status.aiError,
  }));

  await Promise.all([
    ...Object.entries(nextCursor)
      .filter(([channel, id]) => id > 0 && String(id) !== cursors.get(cursorKey(channel)))
      .map(([channel, id]) => store.put(cursorKey(channel), String(id))),
    // The queue is written only when it has or had posts
    waiting.length || pending.length ? store.put(PENDING_KEY, JSON.stringify(waiting)) : null,
    store.put(STATUS_KEY, JSON.stringify(status)),
  ]);

  if (published.length) logger.info("[News] published", { count: published.length, candidates: candidates.length });
  return { checked: status.run.checked, candidates: candidates.length, published: published.length, waiting: waiting.length, aiCalls: status.aiCalls };
}
