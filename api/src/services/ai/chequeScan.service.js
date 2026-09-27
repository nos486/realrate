/**
 * chequeScan.service.js — Read an Iranian cheque from a photo with Gemini
 *
 * Privacy: the image and what is read from it are never stored (database, KV or logs); logs keep
 * the model, duration, image size and outcome only.
 */

import { CHEQUE_SCAN_MODELS, GEMINI_API_KEY_SECRET } from '../../config/ai.config.js';
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
  const startTime = Date.now();
  const imageBytes = imageBuffer ? imageBuffer.byteLength : 0;
  const request = {
    systemPrompt: CHEQUE_SCAN_SYSTEM_PROMPT,
    userText: 'اطلاعات این چک بانکی را طبق دستورالعمل در قالب JSON استخراج کن.',
    imageBase64: toBase64(imageBuffer),
    mimeType,
  };

  // The first model; the next only when Google says the previous one is busy
  let answer;
  let modelId;
  let lastError;
  for (const model of CHEQUE_SCAN_MODELS) {
    try {
      answer = await geminiDescribeImage(env[GEMINI_API_KEY_SECRET], model.id, request);
      modelId = model.id;
      break;
    } catch (err) {
      lastError = err;
      logger.error('[ChequeScan] Model inference failed:', {
        model: model.id,
        durationMs: Date.now() - startTime,
        imageBytes,
        error: err.message,
      });
      if (!(err instanceof GeminiError && err.busy)) break;
    }
  }

  if (answer === undefined) {
    const reason = debug && lastError instanceof GeminiError ? lastError.reason : '';
    if (lastError instanceof GeminiError && lastError.busy) {
      throw new AppError(
        reason ? `سرویس هوش مصنوعی گوگل شلوغ است (${reason})` : 'سرویس هوش مصنوعی گوگل الان شلوغ است؛ چند دقیقه دیگر دوباره امتحان کنید.',
        503,
        'AI_BUSY',
      );
    }
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
