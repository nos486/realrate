/**
 * newsRoutes.js — The news section
 *
 * Endpoints:
 *   GET    /api/news                     — Published news, newest first (?limit, ?page or ?before, ?category, ?important=1)
 *   GET    /api/news/today               — The analyst's card, today's most important news and today's counts by category
 *   GET    /api/admin/news/channels      — The channels read, and the last run of each (admin)
 *   PUT    /api/admin/news/channels      — Save the channels ({ channels: [{ username, enabled }] }) (admin)
 *   POST   /api/admin/news/run           — Read the channels now (admin)
 *   POST   /api/admin/news/analysis      — Write the analyst's card now (admin)
 *   POST   /api/admin/news/analysis/lab  — The model lab: build today's input once ({ lab, models, current }) (admin)
 *   POST   /api/admin/news/analysis/lab/run — Run the lab's input on one model ({ labId, model }) (admin)
 *   PUT    /api/admin/news/analysis/model   — Choose the analysis's model ({ model, publishLabId? }) (admin)
 *   POST   /api/admin/news/:id/hidden    — Take an item down or put it back ({ hidden }) (admin)
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { dbListNews, dbSetNewsHidden, dbTopNewsSince, dbNewsCountsSince } from "../repositories/news.repository.js";
import {
  getNewsAnalysis,
  maybeUpdateNewsAnalysis,
  getNewsAnalysisModel,
  getNewsAnalysisStatus,
  createNewsAnalysisLab,
  runNewsAnalysisLabModel,
  chooseNewsAnalysisModel,
} from "../services/news/newsAnalysis.service.js";
import { tehranDayStart } from "../domain/news.js";
import { getNewsChannels, saveNewsChannels, getNewsStatus, runNewsPolling } from "../services/news/news.service.js";
import { NEWS_CATEGORIES, DEFAULT_NEWS_CHANNELS, NEWS_LIMITS, newsAnalysisModel } from "../config/news.config.js";

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
  const dayStart = tehranDayStart(now);
  let [top, stats, analysis] = await Promise.all([
    dbTopNewsSince(env, dayStart, TODAY_TOP),
    dbNewsCountsSince(env, dayStart),
    getNewsAnalysis(env),
  ]);
  // Early in the day: the last 24 hours instead
  if (top.length < 3) top = await dbTopNewsSince(env, now - 86400000, TODAY_TOP);
  return jsonResponse({ success: true, analysis, top, stats }, 200, request, { "Cache-Control": "public, max-age=30" });
}

async function requireAdmin(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
}

export async function handleAdminGetNewsChannels(request, env) {
  await requireAdmin(request, env);
  const [channels, status, analysisStatus, analysisModel] = await Promise.all([
    getNewsChannels(env),
    getNewsStatus(env),
    getNewsAnalysisStatus(env),
    getNewsAnalysisModel(env),
  ]);
  return jsonResponse({
    success: true,
    channels,
    status,
    defaults: DEFAULT_NEWS_CHANNELS,
    limits: { maxChannels: NEWS_LIMITS.maxChannels, aiCallsPerDay: NEWS_LIMITS.aiCallsPerDay },
    aiConfigured: typeof env.AI?.run === "function",
    analysisModel: newsAnalysisModel(analysisModel),
    analysisStatus,
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

export async function handleAdminNewsAnalysisLab(request, env) {
  await requireAdmin(request, env);
  return jsonResponse({ success: true, ...(await createNewsAnalysisLab(env)) }, 200, request);
}

export async function handleAdminRunNewsAnalysisLabModel(request, env) {
  await requireAdmin(request, env);
  const body = await request.json().catch(() => null);
  if (typeof body?.labId !== "string" || typeof body?.model !== "string") throw AppError.badRequest("ورودی نامعتبر است.");
  return jsonResponse({ success: true, result: await runNewsAnalysisLabModel(env, body.labId, body.model) }, 200, request);
}

export async function handleAdminChooseNewsAnalysisModel(request, env) {
  await requireAdmin(request, env);
  const body = await request.json().catch(() => null);
  if (!newsAnalysisModel(body?.model)) throw AppError.badRequest("این مدل در فهرست نیست.");
  const result = await chooseNewsAnalysisModel(env, body.model, { publishLabId: typeof body.publishLabId === "string" ? body.publishLabId : "" });
  return jsonResponse({ success: true, ...result, analysis: await getNewsAnalysis(env) }, 200, request);
}
