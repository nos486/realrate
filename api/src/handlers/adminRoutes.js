/**
 * adminRoutes.js — Protected admin API route handlers
 * All routes require admin role verified via session
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { dbGetUsers } from "../lib/db.js";
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
