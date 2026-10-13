/**
 * dollarOutlook.service.js — The dollar outlook experiment (admin only)
 *
 * Once a day (from DOLLAR_OUTLOOK.recordFromHour, Tehran) the model gets the dollar's last daily
 * closes and the week's most important news and writes three scenarios for the close
 * DOLLAR_OUTLOOK.horizonDays later. Each is stored in the state store (`outlook:usd:<day>`);
 * once its horizon day has a close, the admin's list scores it against that close and against a
 * flat guess. Nothing here reaches users.
 */

import { DOLLAR_OUTLOOK as CFG } from "../../config/dollarOutlook.config.js";
import { buildOutlookPrompt, parseOutlook, scoreOutlook, summarizeOutlooks } from "../../domain/dollarOutlook.js";
import { tehranClock } from "../../domain/news.js";
import { dbTopNewsSince } from "../../repositories/news.repository.js";
import { getItemHistory } from "../../repositories/priceHistoryStore.repository.js";
import { addDays, tehranDay } from "../../repositories/priceHistory.repository.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { askWorkersAi, hasWorkersAi } from "../news/workersAi.js";
import { logger } from "../../lib/logger.js";

const recordKey = (day) => `outlook:usd:${day}`;
const STATUS_KEY = "outlook:usd:status";
const DAY_MS = 86400000;

/** The dollar's newest daily closes with their days: [{ day, close }], oldest first */
function recentCloses(history, count) {
  if (!history?.values?.length) return [];
  const values = history.values;
  return values.slice(-count).map((close, i) => ({ day: addDays(history.since, values.length - Math.min(count, values.length) + i), close }));
}

/** Write today's scenario when it is due (once a day, late in the Tehran day), or now with `force` */
export async function maybeRecordDollarOutlook(env, { now = Date.now(), force = false } = {}) {
  const store = getStateStore(env);
  if (!store) return { recorded: false, reason: "no-store" };
  if (!hasWorkersAi(env)) return { recorded: false, reason: "no-model" };

  const day = tehranDay(now);
  if (!force) {
    const tehranHour = new Date(now + 3.5 * 3600000).getUTCHours();
    if (tehranHour < CFG.recordFromHour) return { recorded: false, reason: "too-early" };
    if (await store.get(recordKey(day))) return { recorded: false, reason: "done" };
  }

  const history = await getItemHistory(env, CFG.itemId, { now });
  const closes = recentCloses(history, CFG.historyDays);
  if (closes.length < 7) return { recorded: false, reason: "no-history" };
  const base = closes[closes.length - 1].close;
  const news = (await dbTopNewsSince(env, now - CFG.newsDays * DAY_MS, CFG.maxNews)).sort((a, b) => a.publishedAt - b.publishedAt);
  if (!news.length) return { recorded: false, reason: "no-news" };

  const messages = buildOutlookPrompt(closes, news, { ...CFG, tehranClock });
  let outlook = null;
  let error = "";
  try {
    const answer = await askWorkersAi(env, CFG.model, messages, { maxTokens: CFG.maxTokens, temperature: CFG.temperature });
    outlook = parseOutlook(answer, base);
    if (!outlook) error = "bad-answer";
  } catch (err) {
    error = String(err?.message || err).slice(0, 300);
  }
  await store.put(STATUS_KEY, JSON.stringify({ at: now, model: CFG.model.id, ok: !error, ...(error ? { error } : {}) }), { expirationTtl: CFG.keepDays * 86400 });
  if (error) {
    logger.warn("[Outlook] dollar outlook failed", { error });
    return { recorded: false, reason: "model-error", error };
  }

  const record = { day, at: now, base, horizon: addDays(day, CFG.horizonDays), newsCount: news.length, model: CFG.model.id, ...outlook };
  await store.put(recordKey(day), JSON.stringify(record), { expirationTtl: CFG.keepDays * 86400 });
  return { recorded: true, record };
}

/**
 * The admin's view: the newest records, each scored when its horizon day has passed, and totals
 * @returns {Promise<{ records: object[], summary: object, status: object|null, model: string, horizonDays: number, flatBandPct: number }>}
 */
export async function getDollarOutlooks(env, { now = Date.now() } = {}) {
  const store = getStateStore(env);
  const base = { model: CFG.model.label, horizonDays: CFG.horizonDays, flatBandPct: CFG.flatBandPct };
  if (!store) return { ...base, records: [], summary: { n: 0 }, status: null };
  const today = tehranDay(now);
  const days = Array.from({ length: CFG.listDays }, (_, i) => addDays(today, -i));
  const found = await store.getMany([STATUS_KEY, ...days.map(recordKey)], "json");
  const records = days.map((d) => found.get(recordKey(d))).filter(Boolean);

  const history = records.some((r) => r.horizon < today) ? await getItemHistory(env, CFG.itemId, { now }) : null;
  const closeOn = (d) => {
    if (!history || d >= today) return null;
    const i = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${history.since}T00:00:00Z`)) / DAY_MS);
    return i >= 0 ? history.values[i] ?? null : null;
  };
  const rows = records.map((r) => {
    const close = closeOn(r.horizon);
    return close ? { ...r, score: scoreOutlook(r, close, CFG.flatBandPct) } : r;
  });
  return { ...base, records: rows, summary: summarizeOutlooks(rows.filter((r) => r.score).map((r) => r.score)), status: found.get(STATUS_KEY) || null };
}
