/**
 * newsRoutes.js — The news section
 *
 * Endpoints:
 *   GET    /api/news                     — Published news, newest first (?limit, ?page or ?before, ?category, ?important=1)
 *   GET    /api/news/today               — The analyst's card and today's most important news
 *   GET    /api/admin/news/channels      — The channels read, and the last run of each (admin)
 *   PUT    /api/admin/news/channels      — Save the channels ({ channels: [{ username, enabled }] }) (admin)
 *   POST   /api/admin/news/run           — Read the channels now (admin)
 *   POST   /api/admin/news/analysis      — Write the analyst's card now (admin)
 *   POST   /api/admin/news/:id/hidden    — Take an item down or put it back ({ hidden }) (admin)
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { dbListNews, dbSetNewsHidden, dbTopNewsSince } from "../repositories/news.repository.js";
import { getNewsAnalysis, maybeUpdateNewsAnalysis } from "../services/news/newsAnalysis.service.js";
import { tehranDayStart } from "../domain/news.js";
import { getNewsChannels, saveNewsChannels, getNewsStatus, runNewsPolling } from "../services/news/news.service.js";
import { NEWS_CATEGORIES, DEFAULT_NEWS_CHANNELS, NEWS_LIMITS } from "../config/news.config.js";

const MAX_PAGE = 50;

export async function handleGetNews(request, env) {
  const params = new URL(request.url).searchParams;
  const limit = Math.min(MAX_PAGE, Math.max(1, parseInt(params.get("limit") || "20", 10) || 20));
  const before = Math.max(0, parseInt(params.get("before") || "0", 10) || 0);
  const page = Math.min(1000, Math.max(0, parseInt(params.get("page") || "0", 10) || 0));
  const category = Object.hasOwn(NEWS_CATEGORIES, params.get("category") || "") ? params.get("category") : "";
  const importance = params.get("important") === "1" ? 2 : 0;
  const { items, hasMore, total } = await dbListNews(env, { limit, page, before, category, importance });
  // New news comes at most once a minute: a short cache spares repeated reads
  return jsonResponse({ success: true, items, hasMore, total, categories: NEWS_CATEGORIES }, 200, request, {
    "Cache-Control": "public, max-age=30",
  });
}

const TODAY_TOP = 6;

export async function handleGetNewsToday(request, env) {
  const now = Date.now();
  let top = await dbTopNewsSince(env, tehranDayStart(now), TODAY_TOP);
  // Early in the day: the last 24 hours instead
  if (top.length < 3) top = await dbTopNewsSince(env, now - 86400000, TODAY_TOP);
  const analysis = await getNewsAnalysis(env);
  return jsonResponse({ success: true, analysis, top }, 200, request, { "Cache-Control": "public, max-age=30" });
}

async function requireAdmin(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
}

export async function handleAdminGetNewsChannels(request, env) {
  await requireAdmin(request, env);
  const [channels, status] = await Promise.all([getNewsChannels(env), getNewsStatus(env)]);
  return jsonResponse({
    success: true,
    channels,
    status,
    defaults: DEFAULT_NEWS_CHANNELS,
    limits: { maxChannels: NEWS_LIMITS.maxChannels, aiCallsPerDay: NEWS_LIMITS.aiCallsPerDay },
    aiConfigured: typeof env.AI?.run === "function",
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
  return jsonResponse({ success: true, result, analysis: await getNewsAnalysis(env) }, 200, request);
}
