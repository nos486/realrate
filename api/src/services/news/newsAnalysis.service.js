/**
 * newsAnalysis.service.js — The analyst's card on the news page
 *
 * The model reads the day's (Tehran) news — numbered, with the news desk's importance — and
 * writes a headline, a short analysis of it, the day's most important news with their impact, the
 * key points and what to watch (domain/news.js: buildAnalysisPrompt, parseAnalysis). No forecast
 * of any market: the day's news alone can't call one; a strong item that clearly makes a move more
 * likely is said to in the text. Temperature 0: the same input gives the same view, as far as the
 * model allows.
 *
 * Kept small: written only when news came in since the last one, at most every
 * NEWS_ANALYSIS.minIntervalMinutes and NEWS_ANALYSIS.perDay times a day; the day's first one waits
 * for NEWS_ANALYSIS.minNews items. Stored in the state store (`news:analysis`, D1: read back by
 * the next run), and its public part copied to KV (`news:analysis:public`) for the public pages
 * (the news page, the landing page): read at the nearest Cloudflare location, no database read.
 *
 * The model is NEWS_ANALYSIS.model, and only it: when it fails or its answer isn't usable, no other
 * model is tried — the last analysis stays and the failure is kept for the admin's panel
 * (`news:analysis:status`).
 */

import { NEWS_ANALYSIS } from "../../config/news.config.js";
import { buildAnalysisPrompt, parseAnalysis, tehranDayStart, hasForeignText } from "../../domain/news.js";
import { dbTopNewsSince, dbNewsStatsSince } from "../../repositories/news.repository.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { getBlobStore } from "../../repositories/kvStore.repository.js";
import { askWorkersAi, hasWorkersAi } from "./workersAi.js";
import { logger } from "../../lib/logger.js";

const ANALYSIS_KEY = "news:analysis";
const PUBLIC_KEY = "news:analysis:public";
const STATUS_KEY = "news:analysis:status";
const countKey = (dayStart) => `news:analysis:count:${dayStart}`;

/** Why an answer isn't usable: no JSON object in it ("bad-answer"), or words of another language in its text */
function unusableReason(answer) {
  let body = answer;
  if (typeof answer === "string") {
    try {
      body = JSON.parse(answer.slice(answer.indexOf("{"), answer.lastIndexOf("}") + 1));
    } catch {
      return "bad-answer";
    }
  }
  // The fields the model writes in Persian (the rest are codes and numbers)
  const texts = [body?.t, body?.s, body?.r, ...(Array.isArray(body?.k) ? body.k : [])];
  return texts.some((t) => typeof t === "string" && hasForeignText(t)) ? "foreign-text" : "bad-answer";
}

/** The last attempt to write the analysis: { at, model, ok, error? }, or null */
export async function getNewsAnalysisStatus(env) {
  return (await getStateStore(env)?.get(STATUS_KEY, "json").catch(() => null)) || null;
}

/** The latest analysis, or null */
export async function getNewsAnalysis(env) {
  return (await getStateStore(env)?.get(ANALYSIS_KEY, "json").catch(() => null)) || null;
}

/**
 * What the model reads now: the day's news (the most important, then oldest first in the prompt)
 * @returns {Promise<{ dayStart: number, stats: object, news: object[], messages: object[] }>}
 */
async function buildAnalysisInput(env, { now }) {
  const dayStart = tehranDayStart(now);
  const stats = await dbNewsStatsSince(env, dayStart);
  const news = (await dbTopNewsSince(env, dayStart, NEWS_ANALYSIS.maxNews)).sort((a, b) => a.publishedAt - b.publishedAt);
  const messages = buildAnalysisPrompt(news, { summaryChars: NEWS_ANALYSIS.summaryChars });
  return { dayStart, stats, news, messages };
}

/** What the public pages show of an analysis (not the run's bookkeeping) */
const publicView = (a) => ({
  title: a.title,
  summary: a.summary,
  drivers: a.drivers || [],
  points: a.points || [],
  risk: a.risk || "",
  at: a.at,
  newsCount: a.newsCount || 0,
});

async function saveAnalysis(env, store, analysis, { dayStart, at, newsCount, lastSavedAt, model }) {
  const saved = { ...analysis, day: dayStart, at, newsCount, lastSavedAt, model };
  await store.put(ANALYSIS_KEY, JSON.stringify(saved));
  // The public copy: a failure leaves the last one, and the next analysis writes it again
  await getBlobStore(env)?.put(PUBLIC_KEY, JSON.stringify(publicView(saved)))
    .catch((err) => logger.warn("[News] the analysis' public copy was not saved", { error: err?.message }));
}

/**
 * The latest analysis for the public pages, from KV — or, before the first copy was written, from
 * the state store
 */
export async function getPublicNewsAnalysis(env) {
  const copy = await getBlobStore(env)?.get(PUBLIC_KEY, "json").catch(() => null);
  if (copy?.title) return copy;
  const latest = await getNewsAnalysis(env);
  return latest?.title ? publicView(latest) : null;
}

/**
 * Write the analysis again when it is due
 * @param {object} env
 * @param {{ now?: number, force?: boolean }} [opts]
 *   force: now, whatever the interval (admin)
 * @returns {Promise<{ updated: boolean, reason?: string }>}
 */
export async function maybeUpdateNewsAnalysis(env, { now = Date.now(), force = false } = {}) {
  const store = getStateStore(env);
  if (!store) return { updated: false, reason: "no-store" };
  if (!hasWorkersAi(env)) return { updated: false, reason: "no-model" };

  const dayStart = tehranDayStart(now);
  const [stats, current] = await Promise.all([dbNewsStatsSince(env, dayStart), getNewsAnalysis(env)]);
  if (!stats.count) return { updated: false, reason: "no-news" };
  const sameDay = current?.day === dayStart;
  if (!force) {
    if (stats.count < NEWS_ANALYSIS.minNews) return { updated: false, reason: "too-few" };
    if (sameDay && current.lastSavedAt >= stats.lastSavedAt) return { updated: false, reason: "nothing-new" };
    if (sameDay && now - current.at < NEWS_ANALYSIS.minIntervalMinutes * 60000) return { updated: false, reason: "too-soon" };
    const used = parseInt((await store.get(countKey(dayStart))) || "0", 10) || 0;
    if (used >= NEWS_ANALYSIS.perDay) return { updated: false, reason: "budget" };
  }

  const input = await buildAnalysisInput(env, { now });
  await store.increment(countKey(dayStart), 1, { expirationTtl: 2 * 86400 });
  // The chosen model only; a failure is kept for the panel and the last analysis stays
  const model = NEWS_ANALYSIS.model.id;
  let analysis = null;
  let error = "";
  try {
    const answer = await askWorkersAi(env, NEWS_ANALYSIS.model, input.messages, {
      maxTokens: NEWS_ANALYSIS.maxTokens,
      temperature: NEWS_ANALYSIS.temperature,
    });
    analysis = parseAnalysis(answer, input.news);
    if (!analysis) error = unusableReason(answer);
  } catch (err) {
    error = String(err?.message || err).slice(0, 300);
  }
  await store.put(STATUS_KEY, JSON.stringify({ at: now, model, ok: !error, ...(error ? { error } : {}) }));
  if (error) {
    logger.error("[News] analysis failed — the last analysis stays", { model, error });
    return { updated: false, reason: "model-error", error };
  }

  await saveAnalysis(env, store, analysis, { dayStart, at: now, newsCount: input.news.length, lastSavedAt: stats.lastSavedAt, model });
  return { updated: true };
}
