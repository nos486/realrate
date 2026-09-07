/**
 * adminRoutes.js — Protected admin API route handlers
 * All routes require admin role verified via session
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { dbGetUsers, dbGetUserById, dbGetPortfolioHoldings } from "../lib/db.js";
import { getAdminStats } from "../lib/analytics.js";
import { saveGlobalSettings } from "../lib/settings.js";
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
  return jsonResponse({ success: true, total: users.length, users }, 200, request);
}

/**
 * GET /api/admin/users/portfolio?userId=...
 * Fetch any user's portfolio holdings for admin inspection
 */
export async function handleAdminGetUserPortfolio(request, env) {
  const adminUser = await getAuthenticatedUser(request, env);
  if (!adminUser || adminUser.role !== "admin") return forbiddenResponse(request);

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");
  if (!targetUserId) {
    return errorResponse("شناسه کاربر ارسال نشده است.", 400, request);
  }

  const targetUser = await dbGetUserById(env, targetUserId);
  if (!targetUser) {
    return errorResponse("کاربر مورد نظر یافت نشد.", 404, request);
  }

  const holdings = await dbGetPortfolioHoldings(env, targetUser.id);

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
      default_usd_toman:  parseFloat(body.default_usd_toman) || 62000,
      default_gold_usd:   parseFloat(body.default_gold_usd)  || 2450,
      bubble_pct_full:    parseFloat(body.bubble_pct_full)   >= 0 ? parseFloat(body.bubble_pct_full)   : 15,
      bubble_pct_half:    parseFloat(body.bubble_pct_half)   >= 0 ? parseFloat(body.bubble_pct_half)   : 20,
      bubble_pct_quarter: parseFloat(body.bubble_pct_quarter) >= 0 ? parseFloat(body.bubble_pct_quarter) : 25,
      announcement:       (body.announcement || "").trim(),
    };

    await saveGlobalSettings(env, newSettings);

    return jsonResponse({ success: true, message: "تنظیمات عمومی با موفقیت ذخیره شد.", settings: newSettings }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}
