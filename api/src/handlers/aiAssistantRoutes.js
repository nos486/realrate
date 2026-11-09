/**
 * aiAssistantRoutes.js — Route handler for the voice assistant that records expenses and incomes (experimental)
 *
 * POST /api/ai/voice — multipart `audio` (a few sentences), `context` (JSON
 * `{ expense: [{ value, label }], income: [{ value, label }], accounts: [{ id, name }] }`, the user's own
 * lists) and optionally `engine` (honored only for admins comparing engines); answers
 * `{ understood, items: [{ kind, amount, title, category, date, accountId }] }`. Behind the `ai_assistant`
 * feature (admins only until opened to groups) and its daily `ai_assistant` limit. Nothing is stored;
 * a failed call gives its use back.
 */

import { requireFeature, hasFeature } from '../lib/features.js';
import { consumeQuota, refundQuota } from '../lib/usageQuota.js';
import { processAiVoice } from '../services/ai/assistant.service.js';
import { cleanAiAccounts } from '../domain/aiAssistant.js';
import { cleanVoiceCategories } from '../domain/smsVoice.js';
import { readVoiceForm } from './smsVoiceRoutes.js';
import { jsonResponse } from '../lib/helpers.js';
import { AppError } from '../lib/AppError.js';

/** POST /api/ai/voice */
export async function handleAiVoiceRoute(request, env) {
  const user = await requireFeature(request, env, 'ai_assistant');
  const { formData, audio, mimeType } = await readVoiceForm(request);

  let context;
  try {
    const parsed = JSON.parse(String(formData.get('context') || '{}'));
    context = {
      expense: cleanVoiceCategories(parsed?.expense),
      income: cleanVoiceCategories(parsed?.income),
      accounts: cleanAiAccounts(parsed?.accounts),
    };
  } catch {
    throw AppError.badRequest('فهرست دسته‌ها و حساب‌ها نامعتبر است.');
  }

  const debug = await hasFeature(env, user, 'cheque_scan_debug');
  const quota = await consumeQuota(env, user, 'ai_assistant');

  let result;
  try {
    result = await processAiVoice(env, { audioBuffer: await audio.arrayBuffer(), mimeType, ...context, debug, engine: String(formData.get('engine') || '') });
  } catch (err) {
    await refundQuota(env, user, 'ai_assistant');
    throw err;
  }
  if (!result.understood) await refundQuota(env, user, 'ai_assistant');
  return jsonResponse({ success: true, ...result, quota }, 200, request);
}
