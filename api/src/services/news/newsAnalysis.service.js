/**
 * newsAnalysis.service.js — The analyst's card on the news page, and the admin's model lab
 *
 * The model reads the day's (Tehran) news — numbered, with the news desk's importance — today's
 * main prices with their 7- and 30-day trend, and its own previous outlook (the starting point:
 * a direction changes only for news published after it), and writes a headline, a short analysis,
 * a direction with a confidence and the news behind it for the dollar, gold, coins, the stock
 * index and oil, the day's most important news with their impact, the key points and the main
 * risk (domain/news.js: buildAnalysisPrompt, parseAnalysis). Temperature 0: the same input gives
 * the same view, as far as the model allows.
 *
 * Kept small: written only when news came in since the last one, at most every
 * NEWS_ANALYSIS.minIntervalMinutes and NEWS_ANALYSIS.perDay times a day; the day's first one waits
 * for NEWS_ANALYSIS.minNews items. Stored in the state store (`news:analysis`).
 *
 * The model is the admin's choice (`news:analysis:model`, one of NEWS_ANALYSIS_MODELS) and only
 * that one: when it fails or its answer isn't usable, no other model is tried — the last analysis
 * stays and the failure is kept for the admin's panel (`news:analysis:status`). The model lab builds today's input once, runs it on the
 * models the admin picks (one request per model, so each answer comes back on its own), and lets
 * the admin choose a model — and publish that model's answer.
 */

import { NEWS_ANALYSIS, NEWS_ANALYSIS_MODELS, newsAnalysisModel } from "../../config/news.config.js";
import { buildAnalysisPrompt, parseAnalysis, tehranDayStart, hasForeignText } from "../../domain/news.js";
import { dbTopNewsSince, dbNewsStatsSince } from "../../repositories/news.repository.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { getItemHistory } from "../../repositories/priceHistoryStore.repository.js";
import { getPriceBook } from "../market/priceAggregator.service.js";
import { hasWorkersAi, runWorkersAiModel } from "./workersAi.js";
import { logger } from "../../lib/logger.js";

const ANALYSIS_KEY = "news:analysis";
const STATUS_KEY = "news:analysis:status";
const MODEL_KEY = "news:analysis:model";
const LAB_KEY = "news:analysis:lab";
const LAB_TTL = 3 * 3600;
const labResultKey = (labId, model) => `news:analysis:lab:${labId}:${model}`;
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

/** The change over the last `days` days of a daily series, in percent */
function changeOver(values, days) {
  const last = Number(values[values.length - 1]);
  const before = Number(values[values.length - 1 - days]);
  return last > 0 && before > 0 ? ((last - before) / before) * 100 : null;
}

/** The 7- and 30-day trend of NEWS_ANALYSIS.trendIds (the daily history in KV: no database read) */
async function readTrends(env) {
  const book = await getPriceBook(env).catch(() => null);
  const rows = await Promise.all(NEWS_ANALYSIS.trendIds.map(async (id) => {
    const history = await getItemHistory(env, id).catch(() => null);
    const values = history?.values || [];
    if (values.length < 8) return null;
    return { name: book?.items?.[id]?.name || id, week: changeOver(values, 7), month: values.length > 30 ? changeOver(values, 30) : null };
  }));
  return rows.filter(Boolean);
}

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
  // The fields the model writes in Persian (the rest are codes: asset, direction, numbers)
  const texts = [body?.t, body?.s, body?.r, ...(Array.isArray(body?.k) ? body.k : []), ...(Array.isArray(body?.o) ? body.o.map((o) => o?.n) : [])];
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

/** The model the analysis uses: the admin's choice, else the default */
export async function getNewsAnalysisModel(env) {
  const chosen = await getStateStore(env)?.get(MODEL_KEY).catch(() => null);
  return newsAnalysisModel(chosen) ? chosen : NEWS_ANALYSIS.defaultModel;
}

/**
 * What the model reads now: the day's news (most important first, then oldest first in the
 * prompt), prices, trends and the previous outlook
 * @returns {Promise<{ dayStart: number, stats: object, news: object[], messages: object[] }>}
 */
async function buildAnalysisInput(env, { now, readPrices = readBookPrices, readTrendRows = readTrends, current }) {
  const dayStart = tehranDayStart(now);
  const stats = await dbNewsStatsSince(env, dayStart);
  const news = (await dbTopNewsSince(env, dayStart, NEWS_ANALYSIS.maxNews)).sort((a, b) => a.publishedAt - b.publishedAt);
  const [prices, trends] = await Promise.all([readPrices(env).catch(() => []), readTrendRows(env).catch(() => [])]);
  const previous = current?.outlook?.length && now - current.at < NEWS_ANALYSIS.previousMaxHours * 3600000 ? current : null;
  const messages = buildAnalysisPrompt(news, prices, { summaryChars: NEWS_ANALYSIS.summaryChars, trends, previous });
  return { dayStart, stats, news, messages };
}

const brief = (news) => news.map((n) => ({ id: n.id, title: n.title, url: n.url || "" }));

async function saveAnalysis(store, analysis, { dayStart, at, newsCount, lastSavedAt, model }) {
  await store.put(ANALYSIS_KEY, JSON.stringify({ ...analysis, day: dayStart, at, newsCount, lastSavedAt, model }));
}

/**
 * Write the analysis again when it is due
 * @param {object} env
 * @param {{ now?: number, force?: boolean, readPrices?: Function, readTrendRows?: Function }} [opts]
 *   force: now, whatever the interval (admin)
 * @returns {Promise<{ updated: boolean, reason?: string }>}
 */
export async function maybeUpdateNewsAnalysis(env, { now = Date.now(), force = false, readPrices, readTrendRows } = {}) {
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

  const input = await buildAnalysisInput(env, { now, readPrices, readTrendRows, current });
  await store.increment(countKey(dayStart), 1, { expirationTtl: 2 * 86400 });
  // The chosen model only; a failure is kept for the panel and the last analysis stays
  const model = await getNewsAnalysisModel(env);
  let analysis = null;
  let error = "";
  try {
    const { answer } = await runWorkersAiModel(env, newsAnalysisModel(model) || model, input.messages, {
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

  await saveAnalysis(store, analysis, { dayStart, at: now, newsCount: input.news.length, lastSavedAt: stats.lastSavedAt, model });
  return { updated: true };
}

/* ── The model lab (admin) ─────────────────────────────────────────────────────────────── */

/** The catalog as the admin sees it */
const catalog = () => NEWS_ANALYSIS_MODELS.map(({ id, label, vendor, price }) => ({ id, label, vendor, price }));

/**
 * Build today's input once for the lab: what every model is given (kept for LAB_TTL)
 * @returns {Promise<{ lab: { id: string, at: number, messages: object[], newsCount: number }|null, models: object[], current: string }>}
 */
export async function createNewsAnalysisLab(env, { now = Date.now(), readPrices, readTrendRows } = {}) {
  const store = getStateStore(env);
  const current = await getNewsAnalysisModel(env);
  if (!store || !hasWorkersAi(env)) return { lab: null, reason: !store ? "no-store" : "no-model", models: catalog(), current };
  const input = await buildAnalysisInput(env, { now, readPrices, readTrendRows, current: await getNewsAnalysis(env) });
  if (!input.news.length) return { lab: null, reason: "no-news", models: catalog(), current };
  const lab = {
    id: now.toString(36),
    at: now,
    dayStart: input.dayStart,
    lastSavedAt: input.stats.lastSavedAt,
    messages: input.messages,
    news: brief(input.news),
  };
  await store.put(LAB_KEY, JSON.stringify(lab), { expirationTtl: LAB_TTL });
  return { lab: { id: lab.id, at: lab.at, messages: lab.messages, newsCount: lab.news.length }, models: catalog(), current };
}

async function readLab(store, labId) {
  const lab = await store.get(LAB_KEY, "json").catch(() => null);
  return lab?.id === labId ? lab : null;
}

/** A request's cost in USD from its token usage and the model's list price */
function costOf(usage, price) {
  const input = Number(usage?.prompt_tokens ?? usage?.input_tokens) || 0;
  const output = Number(usage?.completion_tokens ?? usage?.output_tokens) || 0;
  if (!price || (!input && !output)) return null;
  return (input * price[0] + output * price[1]) / 1e6;
}

/**
 * Run the lab's input on one model (one model per request: each answer comes back on its own)
 * @returns {Promise<{ model: string, ok: boolean, durationMs: number, usage: object|null, cost: number|null,
 *   analysis: object|null, raw: string, error?: string }>}
 */
export async function runNewsAnalysisLabModel(env, labId, modelId) {
  const store = getStateStore(env);
  const model = newsAnalysisModel(modelId);
  if (!model) return { model: modelId, ok: false, error: "unknown-model" };
  const lab = store && (await readLab(store, labId));
  if (!lab) return { model: modelId, ok: false, error: "lab-expired" };

  const started = Date.now();
  let result;
  try {
    const { answer, usage } = await runWorkersAiModel(env, model, lab.messages, {
      maxTokens: NEWS_ANALYSIS.maxTokens,
      temperature: NEWS_ANALYSIS.temperature,
    });
    const raw = typeof answer === "string" ? answer : JSON.stringify(answer);
    const analysis = parseAnalysis(answer, lab.news);
    let error;
    if (!analysis) error = unusableReason(raw);
    result = { model: modelId, ok: Boolean(analysis), durationMs: Date.now() - started, usage, cost: costOf(usage, model.price), analysis, raw: raw.slice(0, 8000), ...(error ? { error } : {}) };
  } catch (err) {
    result = { model: modelId, ok: false, durationMs: Date.now() - started, usage: null, cost: null, analysis: null, raw: "", error: String(err?.message || err).slice(0, 300) };
  }
  if (result.ok) await store.put(labResultKey(labId, modelId), JSON.stringify(result.analysis), { expirationTtl: LAB_TTL });
  return result;
}

/**
 * Choose the analysis's model; with `publishLabId`, that model's answer in the lab becomes the
 * analysis now
 * @returns {Promise<{ model: string, published: boolean }>}
 */
export async function chooseNewsAnalysisModel(env, modelId, { publishLabId = "", now = Date.now() } = {}) {
  const store = getStateStore(env);
  if (!store) throw new Error("no-store");
  if (!newsAnalysisModel(modelId)) throw new Error("unknown-model");
  await store.put(MODEL_KEY, modelId);
  if (!publishLabId) return { model: modelId, published: false };
  const [lab, analysis] = await Promise.all([
    readLab(store, publishLabId),
    store.get(labResultKey(publishLabId, modelId), "json").catch(() => null),
  ]);
  if (!lab || !analysis) return { model: modelId, published: false };
  await saveAnalysis(store, analysis, { dayStart: lab.dayStart, at: now, newsCount: lab.news.length, lastSavedAt: lab.lastSavedAt, model: modelId });
  return { model: modelId, published: true };
}
