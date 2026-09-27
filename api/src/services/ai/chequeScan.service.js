/**
 * chequeScan.service.js — Read an Iranian cheque from a photo with Gemini
 *
 * Privacy: the image and what is read from it are never stored (database, KV or logs); logs keep
 * the model, duration, image size and outcome only.
 */

import { CHEQUE_SCAN_MODEL, GEMINI_API_KEY_SECRET } from '../../config/ai.config.js';
import { geminiDescribeImage, toBase64, GeminiError } from './gemini.js';
import { CHEQUE_SCAN_SYSTEM_PROMPT } from './chequeScanPrompt.js';
import { normalizeChequeScan, parseChequeScanJson } from '../../domain/chequeScan.js';
import { AppError } from '../../lib/AppError.js';
import { logger } from '../../lib/logger.js';

/** Refuse (503 SCAN_NOT_CONFIGURED) when the Gemini key isn't set; admins are told which secret */
export function assertChequeScanReady(env, { isAdmin = false } = {}) {
  if (env?.[GEMINI_API_KEY_SECRET]) return;
  throw new AppError(
    isAdmin ? `کلید ${GEMINI_API_KEY_SECRET} برای اسکن چک تنظیم نشده است.` : 'اسکن چک فعلاً در دسترس نیست.',
    503,
    'SCAN_NOT_CONFIGURED',
  );
}

/**
 * Scan one cheque image.
 *
 * @param {object} env
 * @param {object} params
 * @param {ArrayBuffer} params.imageBuffer
 * @param {string} params.mimeType
 * @param {boolean} [params.debug] - include the model's raw answer and a failure's reason (admins)
 * @returns {Promise<object>}
 */
export async function processChequeScan(env, { imageBuffer, mimeType, debug = false }) {
  assertChequeScanReady(env, { isAdmin: debug });
  const modelId = CHEQUE_SCAN_MODEL.id;
  const startTime = Date.now();
  const imageBytes = imageBuffer ? imageBuffer.byteLength : 0;

  let answer;
  try {
    answer = await geminiDescribeImage(env[GEMINI_API_KEY_SECRET], modelId, {
      systemPrompt: CHEQUE_SCAN_SYSTEM_PROMPT,
      userText: 'اطلاعات این چک بانکی را طبق دستورالعمل در قالب JSON استخراج کن.',
      imageBase64: toBase64(imageBuffer),
      mimeType,
    });
  } catch (err) {
    logger.error('[ChequeScan] Model inference failed:', {
      model: modelId,
      durationMs: Date.now() - startTime,
      imageBytes,
      error: err.message,
    });
    const reason = debug && err instanceof GeminiError ? err.reason : '';
    throw new AppError(reason ? `پردازش تصویر ناموفق بود (${reason})` : 'پردازش تصویر ناموفق بود.', 502, 'AI_GATEWAY_ERROR');
  }

  const durationMs = Date.now() - startTime;
  const normalized = normalizeChequeScan(parseChequeScanJson(answer));

  logger.info('[ChequeScan] Scan completed', { model: modelId, durationMs, imageBytes, success: normalized.success });

  return {
    success: normalized.success,
    notACheque: normalized.notACheque,
    fields: normalized.fields,
    confidence: normalized.confidence,
    warnings: normalized.warnings,
    model: modelId,
    durationMs,
    ...(debug ? { raw: answer } : {}),
  };
}
