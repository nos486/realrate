/**
 * newsAnalysis.service.js — The analyst's card on the news page
 *
 * The model reads the day's (Tehran) news — headlines and summaries, most important first — and
 * today's main prices, and writes its view: a headline, a short analysis, where the dollar, gold,
 * coins, the stock index and oil may go and why, the key points and the main risk.
 *
 * Kept small: written only when news came in since the last one, at most every
 * NEWS_ANALYSIS.minIntervalMinutes and NEWS_ANALYSIS.perDay times a day; the day's first one waits
 * for NEWS_ANALYSIS.minNews items. Stored in app_state (`news:analysis`).
 */

import { NEWS_ANALYSIS } from "../../config/news.config.js";
import { buildAnalysisPrompt, parseAnalysis, tehranDayStart } from "../../domain/news.js";
import { dbTopNewsSince, dbNewsStatsSince } from "../../repositories/news.repository.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { getPriceBook } from "../market/priceAggregator.service.js";
import { askWorkersAi, hasWorkersAi } from "./workersAi.js";

const ANALYSIS_KEY = "news:analysis";
const countKey = (dayStart) => `news:analysis:count:${dayStart}`;

/** Today's main prices from the price book (name, price, unit, the last session's change) */
async function readBookPrices(env) {
  const book = await getPriceBook(env).catch(() => null);
  return NEWS_ANALYSIS.priceIds
    .map((id) => book?.items?.[id])
    .filter(Boolean)
    .map((item) => {
      const change = Number(item.params?.changePercent);
      return { name: item.name || item.id, price: Number(item.price), unit: item.unit || "", changePercent: Number.isFinite(change) ? change : null };
    });
}

/** The latest analysis, or null */
export async function getNewsAnalysis(env) {
  return (await getStateStore(env)?.get(ANALYSIS_KEY, "json").catch(() => null)) || null;
}

/**
 * Write the analysis again when it is due
 * @param {object} env
 * @param {{ now?: number, force?: boolean, readPrices?: (env: object) => Promise<object[]> }} [opts]
 *   force: now, whatever the interval (admin)
 * @returns {Promise<{ updated: boolean, reason?: string }>}
 */
export async function maybeUpdateNewsAnalysis(env, { now = Date.now(), force = false, readPrices = readBookPrices } = {}) {
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

  const news = (await dbTopNewsSince(env, dayStart, NEWS_ANALYSIS.maxNews)).sort((a, b) => a.publishedAt - b.publishedAt);
  const prices = await readPrices(env).catch(() => []);
  await store.increment(countKey(dayStart), 1, { expirationTtl: 2 * 86400 });
  // The first model whose answer is usable (parseAnalysis: JSON, all in Persian)
  let analysis;
  let model;
  try {
    ({ value: analysis, model } = await askWorkersAi(
      env,
      NEWS_ANALYSIS.models,
      buildAnalysisPrompt(news, prices, NEWS_ANALYSIS),
      { maxTokens: NEWS_ANALYSIS.maxTokens, temperature: 0.3, accept: parseAnalysis },
    ));
  } catch (err) {
    if (/unusable answer/.test(err?.message || "")) return { updated: false, reason: "bad-answer" };
    throw err;
  }

  await store.put(ANALYSIS_KEY, JSON.stringify({
    ...analysis,
    day: dayStart,
    at: now,
    newsCount: news.length,
    lastSavedAt: stats.lastSavedAt,
    model,
  }));
  return { updated: true };
}
