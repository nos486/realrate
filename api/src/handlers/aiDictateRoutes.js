/**
 * aiDictateRoutes.js — Route handler for dictation: speech turned into text for a text field
 *
 * POST /api/ai/dictate — multipart `audio` (a sentence or two) and optionally `engine` (honored only for
 * admins comparing engines); answers `{ understood, text }`. Behind the `ai_assistant` feature (admins only
 * until opened to groups) and its daily `ai_dictate` limit. The text is only transcribed, never acted on.
 * Nothing is stored; an empty or failed call gives its use back.
 */

import { requireFeature, hasFeature } from '../lib/features.js';
import { consumeQuota, refundQuota } from '../lib/usageQuota.js';
import { processDictation } from '../services/ai/dictate.service.js';
import { readVoiceForm } from './smsVoiceRoutes.js';
import { jsonResponse } from '../lib/helpers.js';

/** POST /api/ai/dictate */
export async function handleAiDictateRoute(request, env) {
  const user = await requireFeature(request, env, 'ai_assistant');
  const { formData, audio, mimeType } = await readVoiceForm(request);
  const debug = await hasFeature(env, user, 'cheque_scan_debug');
  const quota = await consumeQuota(env, user, 'ai_dictate');

  let result;
  try {
    result = await processDictation(env, { audioBuffer: await audio.arrayBuffer(), mimeType, debug, engine: String(formData.get('engine') || '') });
  } catch (err) {
    await refundQuota(env, user, 'ai_dictate');
    throw err;
  }
  if (!result.understood) await refundQuota(env, user, 'ai_dictate');
  return jsonResponse({ success: true, ...result, quota }, 200, request);
}
