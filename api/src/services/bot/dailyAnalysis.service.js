/**
 * dailyAnalysis.service.js — Bot feature: the day's AI analysis («تحلیل روز») posted to the
 * channels every night
 *
 * The news page's analysis (newsAnalysis.service.js) is rewritten through the day; at the first
 * run after ANALYSIS_POST_HOUR_TEHRAN (00:00) the last one of the day that just ended is posted to
 * each messenger's channel whose admin turned it on (`dailyAnalysis`). The day it was posted is
 * kept in `app_state` per messenger, so a retry or a second isolate never posts it twice; it is
 * marked before sending, so a failing channel is not retried every minute (the error goes to the
 * panel's status). The message is built once as segments (bold, plain text, a link) and written
 * in each messenger's format. The day's news are headlines only, never links (a domestic item's
 * link would be a Telegram channel's).
 */

import { getStateStore } from "../../repositories/stateStore.repository.js";
import { getNewsAnalysis } from "../news/newsAnalysis.service.js";
import { tehranDayStart } from "../../domain/news.js";
import { SITE_ORIGIN } from "../../lib/siteOrigin.js";
import { getBotConfig } from "./botConfig.service.js";
import { sendMessage, escapeHtml } from "./telegramApi.js";
import { ANALYSIS_POST_HOUR_TEHRAN, ANALYSIS_POST_WINDOW_HOURS } from "../../config/telegramBot.config.js";

const DAY_MS = 86400000;
const TTL_SEC = 3 * 86400;
const IMPACT = { 1: "اثر کم", 2: "اثر متوسط", 3: "اثر زیاد" };

const shamsiDate = (ms) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone: "Asia/Tehran", day: "numeric", month: "long", year: "numeric" }).format(ms);

/**
 * The analysis as message segments (rubikaApi.js `richText`'s shape)
 * @param {{ title: string, summary: string, drivers?: object[], points?: string[], risk?: string, day: number }} analysis
 * @returns {Array<string|{ text: string, bold?: boolean, link?: string }>}
 */
export function analysisSegments(analysis) {
  const segments = [
    { text: `📊 تحلیل روز با هوش مصنوعی — ${shamsiDate(analysis.day)}`, bold: true },
    "\n\n",
    { text: analysis.title, bold: true },
    `\n\n${analysis.summary}`,
  ];
  if (analysis.drivers?.length) {
    segments.push("\n\n", { text: "مهم‌ترین خبرهای روز", bold: true });
    for (const d of analysis.drivers) segments.push(`\n• ${d.title}${IMPACT[d.impact] ? ` (${IMPACT[d.impact]})` : ""}`);
  }
  if (analysis.points?.length) {
    segments.push("\n\n", { text: "نکته‌های کلیدی", bold: true });
    for (const p of analysis.points) segments.push(`\n• ${p}`);
  }
  if (analysis.risk) segments.push("\n\n", { text: "زیر نظر بگیرید: ", bold: true }, analysis.risk);
  segments.push(
    "\n\nاین تحلیل را هوش مصنوعی از خبرهای روز نوشته است و توصیه‌ی خرید یا فروش نیست.\n",
    { text: "realrate.geekio.org", link: SITE_ORIGIN },
  );
  return segments;
}

/** Segments as Telegram HTML */
export function segmentsToHtml(segments) {
  return segments.map((segment) => {
    const piece = typeof segment === "string" ? { text: segment } : segment;
    let html = escapeHtml(piece.text ?? "");
    if (piece.bold) html = `<b>${html}</b>`;
    if (piece.link) html = `<a href="${escapeHtml(piece.link)}">${html}</a>`;
    return html;
  }).join("");
}

/**
 * Post the analysis of the day that just ended, once, for any messenger
 * @param {object} env
 * @param {{ on: boolean, dayKey: string, send: (segments: Array) => Promise<{ ok: boolean, error?: string }> }} target
 *   on: the admin wants it; dayKey: the `app_state` key of the day last posted
 * @param {number} [now]
 * @returns {Promise<{ sent: number, error?: string }>}
 */
export async function postDailyAnalysisOnce(env, { on, dayKey, send }, now = Date.now()) {
  const store = getStateStore(env);
  if (!on || !store) return { sent: 0 };
  const sinceStart = now - tehranDayStart(now) - ANALYSIS_POST_HOUR_TEHRAN * 3600000;
  if (sinceStart < 0 || sinceStart >= ANALYSIS_POST_WINDOW_HOURS * 3600000) return { sent: 0 };
  const day = tehranDayStart(now) - DAY_MS;
  if (Number(await store.get(dayKey)) === day) return { sent: 0 };
  const analysis = await getNewsAnalysis(env);
  // No analysis of that day (no news, or the model failed all day): nothing to post
  if (!analysis?.title || analysis.day !== day) return { sent: 0 };
  await store.put(dayKey, String(day), { expirationTtl: TTL_SEC });
  const res = await send(analysisSegments(analysis));
  return res?.ok === false ? { sent: 0, error: res.error || "send failed" } : { sent: 1 };
}

/** Telegram's channel (bot.service.js) */
export async function postTelegramDailyAnalysis(env, { now = Date.now(), fetchFn } = {}) {
  const config = await getBotConfig(env);
  return postDailyAnalysisOnce(env, {
    on: config.dailyAnalysis,
    dayKey: "bot:analysis:day",
    send: (segments) => sendMessage(config.token, config.channel, segmentsToHtml(segments), { fetchFn }),
  }, now);
}
