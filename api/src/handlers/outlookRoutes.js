/**
 * outlookRoutes.js — The dollar outlook experiment (admin only; nothing is public)
 *
 * Endpoints:
 *   GET    /api/admin/outlook       — The recorded scenarios, scored against the real closes, and totals
 *   POST   /api/admin/outlook/run   — Write today's scenario now
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { getDollarOutlooks, maybeRecordDollarOutlook } from "../services/outlook/dollarOutlook.service.js";

async function requireAdmin(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
}

export async function handleAdminGetOutlook(request, env) {
  await requireAdmin(request, env);
  return jsonResponse({ success: true, aiConfigured: typeof env.AI?.run === "function", ...(await getDollarOutlooks(env)) }, 200, request);
}

export async function handleAdminRunOutlook(request, env) {
  await requireAdmin(request, env);
  const result = await maybeRecordDollarOutlook(env, { force: true });
  return jsonResponse({ success: true, result, ...(await getDollarOutlooks(env)) }, 200, request);
}
