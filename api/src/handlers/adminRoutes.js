/**
 * adminRoutes.js — Protected admin API route handlers
 * All routes require admin role verified via session
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { dbGetUsers, dbGetUserById, dbGetPortfolioHoldings, dbGetUserPortfolios } from "../lib/db.js";
import { getAdminStats } from "../lib/analytics.js";
import { saveGlobalSettings } from "../lib/settings.js";
import { testUsdSource } from "../services/telegramPrices.js";
import { jsonResponse, errorResponse, forbiddenResponse } from "../lib/helpers.js";

/**
 * GET /api/admin/stats
 * Return site analytics stats — admin only
 */
export async function handleAdminStatsRoute(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  const stats = await getAdminStats(env);
  return jsonResponse(stats, 200, request);
}

/**
 * GET /api/admin/users
 * Return all registered users from D1/KV — admin only
 */
export async function handleAdminUsersRoute(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  const users = await dbGetUsers(env);
  return jsonResponse({ success: true, users }, 200, request);
}

/**
 * GET /api/admin/users/portfolio?userId=...&portfolioId=...
 * Return specific user's portfolios and holdings for inspection — admin only
 */
export async function handleAdminGetUserPortfolio(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");
  const portfolioId = url.searchParams.get("portfolioId") || null;

  if (!targetUserId) {
    return errorResponse("شناسه کاربر الزامی است.", 400, request);
  }

  const targetUser = await dbGetUserById(env, targetUserId);
  if (!targetUser) {
    return errorResponse("کاربر مورد نظر یافت نشد.", 404, request);
  }

  const portfolios = await dbGetUserPortfolios(env, targetUser.id);
  const holdings = await dbGetPortfolioHoldings(env, targetUser.id, portfolioId);

  return jsonResponse({
    success: true,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      customName: targetUser.customName || "",
      picture: targetUser.picture,
      shareSlug: targetUser.shareSlug || "",
      shareEnabled: !!targetUser.shareEnabled,
      createdAt: targetUser.createdAt,
      lastLogin: targetUser.lastLogin,
    },
    portfolios,
    portfolioId,
    holdings,
  }, 200, request);
}

/**
 * POST /api/admin/settings
 * Save global settings to D1 + KV — admin only
 */
export async function handleAdminSaveSettings(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const body = await request.json();
    const newSettings = {
      default_usd_toman:    parseFloat(body.default_usd_toman) || 62000,
      default_gold_usd:     parseFloat(body.default_gold_usd)  || 2450,
      bubble_pct_full:      parseFloat(body.bubble_pct_full)   >= 0 ? parseFloat(body.bubble_pct_full)   : 15,
      bubble_pct_half:      parseFloat(body.bubble_pct_half)   >= 0 ? parseFloat(body.bubble_pct_half)   : 20,
      bubble_pct_quarter:   parseFloat(body.bubble_pct_quarter) >= 0 ? parseFloat(body.bubble_pct_quarter) : 25,
      announcement:         (body.announcement || "").trim(),
      usd_source_type:      body.usd_source_type === "api_url" ? "api_url" : "telegram",
      usd_telegram_channel: (body.usd_telegram_channel || "tahran_sabza").trim(),
      usd_api_url:          (body.usd_api_url || "").trim(),
      usd_api_json_path:    (body.usd_api_json_path || "").trim(),
    };

    await saveGlobalSettings(env, newSettings);

    return jsonResponse({ success: true, message: "تنظیمات عمومی با موفقیت ذخیره شد.", settings: newSettings }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}

/**
 * POST /api/admin/test-usd-source
 * Test USD price source (Telegram or external API) without saving — admin only
 */
export async function handleAdminTestUsdSource(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const body = await request.json();
    const testResult = await testUsdSource(body);
    return jsonResponse(testResult, testResult.success ? 200 : 400, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}
