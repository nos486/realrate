/**
 * aiSettingsRoutes.js — Which AI model does what (admin → تنظیمات سایت)
 *
 *   GET /api/admin/ai-settings   the choice and the lists to pick from
 *   PUT /api/admin/ai-settings   { voiceEngine?, newsModel? } — save the fields given
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { AppError } from "../lib/AppError.js";
import { jsonResponse } from "../lib/helpers.js";
import { loadAiSettings, saveAiSettings } from "../services/ai/aiSettings.service.js";
import { VOICE_ENGINES } from "../config/voiceEngines.js";
import { NEWS_MODEL_CHOICES } from "../config/aiModels.js";

async function requireAdminUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
}

const view = (settings) => ({
  success: true,
  ...settings,
  voiceEngines: VOICE_ENGINES.map(({ id, label }) => ({ id, label })),
  newsModels: NEWS_MODEL_CHOICES.map(({ id, label }) => ({ id, label })),
});

export async function handleAdminGetAiSettings(request, env) {
  await requireAdminUser(request, env);
  return jsonResponse(view(await loadAiSettings(env)), 200, request);
}

export async function handleAdminSaveAiSettings(request, env) {
  await requireAdminUser(request, env);
  const body = (await request.json().catch(() => null)) || {};
  const patch = {};
  if (body.voiceEngine !== undefined) patch.voiceEngine = String(body.voiceEngine);
  if (body.newsModel !== undefined) patch.newsModel = String(body.newsModel);
  return jsonResponse({ ...view(await saveAiSettings(env, patch)), message: "مدل‌ها ذخیره شد." }, 200, request);
}
