/**
 * aiSettings.service.js — Which AI model does what, as the admin chose (admin → تنظیمات سایت)
 *
 * Stored in `app_state` (`ai:settings`) as `{ voiceEngine, newsModel, newsDailyCalls }`: the engine that hears every
 * voice feature (config/voiceEngines.js), the model of the news section and the model requests it may make a
 * day (config/aiModels.js). A missing or
 * unknown value is the default, so a removed model never breaks a feature.
 */

import { AppError } from "../../lib/AppError.js";
import { logger } from "../../lib/logger.js";
import { getStateStore } from "../../repositories/stateStore.repository.js";
import { DEFAULT_VOICE_ENGINE, voiceEngineById } from "../../config/voiceEngines.js";
import { DEFAULT_NEWS_MODEL_CHOICE, newsModelChoiceById, NEWS_DAILY_CALLS, cleanNewsDailyCalls } from "../../config/aiModels.js";

export const AI_SETTINGS_STATE_KEY = "ai:settings";

/**
 * @param {object} env
 * @returns {Promise<{ voiceEngine: string, newsModel: string, newsDailyCalls: number }>}
 */
export async function loadAiSettings(env) {
  let saved = null;
  try {
    saved = await getStateStore(env)?.get(AI_SETTINGS_STATE_KEY, "json");
  } catch (err) {
    logger.warn("Reading the AI settings failed:", { error: err.message });
  }
  return {
    voiceEngine: voiceEngineById(saved?.voiceEngine) ? saved.voiceEngine : DEFAULT_VOICE_ENGINE,
    newsModel: newsModelChoiceById(saved?.newsModel) ? saved.newsModel : DEFAULT_NEWS_MODEL_CHOICE,
    newsDailyCalls: cleanNewsDailyCalls(saved?.newsDailyCalls),
  };
}

/**
 * Save the fields given (the others stay); an unknown id is refused
 * @param {object} env
 * @param {{ voiceEngine?: string, newsModel?: string, newsDailyCalls?: number }} patch
 */
export async function saveAiSettings(env, patch) {
  const store = getStateStore(env);
  if (!store) throw new AppError("ذخیره‌ی تنظیمات ممکن نیست.", 503, "STORE_UNAVAILABLE");
  if (patch.voiceEngine !== undefined && !voiceEngineById(patch.voiceEngine)) throw AppError.badRequest("موتور صدا نامعتبر است.");
  if (patch.newsModel !== undefined && !newsModelChoiceById(patch.newsModel)) throw AppError.badRequest("مدل اخبار نامعتبر است.");
  if (patch.newsDailyCalls !== undefined) {
    const n = Number(patch.newsDailyCalls);
    if (!Number.isInteger(n) || n < NEWS_DAILY_CALLS.min || n > NEWS_DAILY_CALLS.max) {
      throw AppError.badRequest(`سهمیه‌ی روزانه‌ی مدل اخبار باید عددی صحیح بین ${NEWS_DAILY_CALLS.min} و ${NEWS_DAILY_CALLS.max} باشد.`);
    }
  }
  const next = { ...(await loadAiSettings(env)), ...patch };
  await store.put(AI_SETTINGS_STATE_KEY, JSON.stringify({ voiceEngine: next.voiceEngine, newsModel: next.newsModel, newsDailyCalls: next.newsDailyCalls }));
  return next;
}
