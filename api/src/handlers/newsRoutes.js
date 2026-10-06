/**
 * newsRoutes.js — The news section
 *
 * Endpoints:
 *   GET    /api/news                     — Published news, newest first (?limit, ?page or ?before, ?category, ?important=1)
 *   GET    /api/news/today               — The analyst's card, today's and the week's most important news
 *   GET    /api/admin/news/channels      — The channels read, the last runs' report, the last published news (admin)
 *   PUT    /api/admin/news/channels      — Save the channels ({ channels: [{ username, enabled }] }) (admin)
 *   POST   /api/admin/news/run           — Read the channels now (admin)
 *   POST   /api/admin/news/analysis      — Write the analyst's card now (admin)
 *   POST   /api/admin/news/:id/hidden    — Take an item down or put it back ({ hidden }) (admin)
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { edgeCachedJson } from "../lib/edgeCache.js";
import { dbListNews, dbSetNewsHidden, dbTopNewsSince } from "../repositories/news.repository.js";
import {
  getNewsAnalysis,
  maybeUpdateNewsAnalysis,
  getNewsAnalysisStatus,
} from "../services/news/newsAnalysis.service.js";
import { tehranDayStart } from "../domain/news.js";
import { getNewsChannels, saveNewsChannels, getNewsStatus, runNewsPolling } from "../services/news/news.service.js";
import { NEWS_CATEGORIES, DEFAULT_NEWS_CHANNELS, NEWS_LIMITS, NEWS_ANALYSIS, NEWS_AI_MODEL } from "../config/news.config.js";

/** The last published news shown in the admin's report */
const ADMIN_LATEST = 8;

const MAX_PAGE = 50;
/** How long the public news answers are shared at the edge (new news comes at most once a minute) */
const PUBLIC_CACHE_SEC = 30;

export async function handleGetNews(request, env) {
  const params = new URL(request.url).searchParams;
  const limit = Math.min(MAX_PAGE, Math.max(1, parseInt(params.get("limit") || "20", 10) || 20));
  const before = Math.max(0, parseInt(params.get("before") || "0", 10) || 0);
  const page = Math.min(1000, Math.max(0, parseInt(params.get("page") || "0", 10) || 0));
  const category = Object.hasOwn(NEWS_CATEGORIES, params.get("category") || "") ? params.get("category") : "";
  const importance = params.get("important") === "1" ? 2 : 0;
  // New news comes at most once a minute: every visitor of a data center shares one read per 30 s
  const query = new URLSearchParams({ limit, page, before, category, importance }).toString();
  const { items, hasMore, total } = await edgeCachedJson(`https://news.cache/list?${query}`, PUBLIC_CACHE_SEC, () =>
    dbListNews(env, { limit, page, before, category, importance }));
  return jsonResponse({ success: true, items, hasMore, total, categories: NEWS_CATEGORIES }, 200, request, {
    "Cache-Control": `public, max-age=${PUBLIC_CACHE_SEC}`,
  });
}

const TODAY_TOP = 6;
/** The week's most important news shown beside today's (the last 7 days, today's left out) */
const WEEK_TOP = 6;

export async function handleGetNewsToday(request, env) {
  const body = await edgeCachedJson("https://news.cache/today", PUBLIC_CACHE_SEC, async () => {
    const now = Date.now();
    const [today, lastWeek, analysis] = await Promise.all([
      dbTopNewsSince(env, tehranDayStart(now), TODAY_TOP),
      dbTopNewsSince(env, now - 7 * 86400000, WEEK_TOP + TODAY_TOP),
      getNewsAnalysis(env),
    ]);
    // Early in the day: the last 24 hours instead
    const top = today.length >= 3 ? today : await dbTopNewsSince(env, now - 86400000, TODAY_TOP);
    const shown = new Set(top.map((n) => n.id));
    const week = lastWeek.filter((n) => !shown.has(n.id)).slice(0, WEEK_TOP);
    return { analysis, top, week };
  });
  return jsonResponse({ success: true, ...body }, 200, request, { "Cache-Control": `public, max-age=${PUBLIC_CACHE_SEC}` });
}

async function requireAdmin(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
}

export async function handleAdminGetNewsChannels(request, env) {
  await requireAdmin(request, env);
  const [channels, status, analysisStatus, latest] = await Promise.all([
    getNewsChannels(env),
    getNewsStatus(env),
    getNewsAnalysisStatus(env),
    dbListNews(env, { limit: ADMIN_LATEST }),
  ]);
  return jsonResponse({
    success: true,
    channels,
    status,
    defaults: DEFAULT_NEWS_CHANNELS,
    limits: { maxChannels: NEWS_LIMITS.maxChannels, aiCallsPerDay: NEWS_LIMITS.aiCallsPerDay },
    aiConfigured: typeof env.AI?.run === "function",
    model: NEWS_AI_MODEL.label,
    analysisModel: NEWS_ANALYSIS.model.label,
    analysisStatus,
    latest: latest.items,
  }, 200, request);
}

export async function handleAdminSaveNewsChannels(request, env) {
  await requireAdmin(request, env);
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.channels)) throw AppError.badRequest("فهرست کانال‌ها نامعتبر است.");
  const channels = await saveNewsChannels(env, body.channels);
  return jsonResponse({ success: true, channels }, 200, request);
}

export async function handleAdminRunNews(request, env) {
  await requireAdmin(request, env);
  const result = await runNewsPolling(env, { force: true });
  return jsonResponse({ success: true, result, status: await getNewsStatus(env) }, 200, request);
}

export async function handleAdminSetNewsHidden(request, env, { id }) {
  await requireAdmin(request, env);
  const body = await request.json().catch(() => ({}));
  const found = await dbSetNewsHidden(env, id, body?.hidden !== false);
  if (!found) throw AppError.notFound("خبر پیدا نشد.");
  return jsonResponse({ success: true }, 200, request);
}

export async function handleAdminRunNewsAnalysis(request, env) {
  await requireAdmin(request, env);
  const result = await maybeUpdateNewsAnalysis(env, { force: true });
  const [analysis, analysisStatus] = await Promise.all([getNewsAnalysis(env), getNewsAnalysisStatus(env)]);
  return jsonResponse({ success: true, result, analysis, analysisStatus }, 200, request);
}
