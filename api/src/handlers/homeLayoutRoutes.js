/**
 * homeLayoutRoutes.js — Each user's customized home page
 *
 * Endpoints:
 *   GET /api/user/home-layout   — The saved layout, or null (= default home page)
 *   PUT /api/user/home-layout   — Save a layout ({ layout }); { layout: null } resets to default
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { dbGetHomeLayout, dbSaveHomeLayout } from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { sanitizeHomeLayout } from "../domain/homeLayout.js";

const MAX_LAYOUT_BYTES = 32 * 1024;

async function requireUserId(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized("جهت شخصی‌سازی صفحه اصلی، ابتدا وارد حساب کاربری خود شوید.");
  return user.userId || user.id || user.email;
}

export async function handleGetHomeLayout(request, env) {
  const userId = await requireUserId(request, env);
  const layout = await dbGetHomeLayout(env, userId);
  return jsonResponse({ success: true, layout }, 200, request);
}

export async function handleSaveHomeLayout(request, env) {
  const userId = await requireUserId(request, env);
  const text = await request.text();
  if (text.length > MAX_LAYOUT_BYTES) throw AppError.badRequest("چیدمان صفحه اصلی بیش از حد بزرگ است.");

  let body;
  try {
    body = JSON.parse(text || "{}");
  } catch {
    throw AppError.badRequest("داده ارسالی نامعتبر است.");
  }

  let layout = null;
  if (body.layout !== null && body.layout !== undefined) {
    layout = sanitizeHomeLayout(body.layout);
    if (!layout) throw AppError.badRequest("چیدمان صفحه اصلی نامعتبر است.");
  }

  await dbSaveHomeLayout(env, userId, layout);
  return jsonResponse({ success: true, layout }, 200, request);
}
