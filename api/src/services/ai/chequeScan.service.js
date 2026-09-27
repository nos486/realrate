/**
 * chequeScan.service.js — Read an Iranian cheque from a photo with a vision model (visionProviders.js)
 *
 * Privacy & Security:
 * - Image binary and extracted data are NEVER stored in database, KV, or logs.
 * - Logs strictly record metadata: model ID, duration, image size, and success status.
 */

import {
  AI_PROVIDER_SECRETS,
  CHEQUE_SCAN_MODELS,
  isChequeScanModelAvailable,
  resolveChequeScanModel,
} from '../../config/ai.config.js';
import { runVisionModel, toBase64, VisionProviderError } from './visionProviders.js';
import { CHEQUE_SCAN_SYSTEM_PROMPT, CHEQUE_SCAN_JSON_SCHEMA } from './chequeScanPrompt.js';
import { normalizeChequeScan, parseChequeScanJson } from '../../domain/chequeScan.js';
import { AppError } from '../../lib/AppError.js';
import { logger } from '../../lib/logger.js';
import { getKv } from '../../repositories/kvCache.repository.js';

const SCAN_RATE_LIMIT_DAILY = 30;
const RATE_LIMIT_EXPIRATION_TTL = 2 * 24 * 3600; // 2 days in seconds

/**
 * Checks and increments the daily KV rate limit counter for AI cheque scans.
 * Key format: ai_scan:<userId>:<YYYY-MM-DD>
 *
 * @param {object} env
 * @param {string} userId
 */
export async function enforceScanRateLimit(env, userId) {
  const kv = getKv(env);
  if (!kv || !userId) return;

  const today = new Date().toISOString().slice(0, 10);
  const key = `ai_scan:${userId}:${today}`;

  try {
    const rawVal = await kv.get(key);
    const count = parseInt(rawVal || '0', 10);

    if (count >= SCAN_RATE_LIMIT_DAILY) {
      throw new AppError(
        'سقف اسکن روزانه چک (۳۰ بار در روز) تکمیل شده است. لطفاً فردا دوباره تلاش کنید.',
        429,
        'RATE_LIMIT_EXCEEDED'
      );
    }

    await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_EXPIRATION_TTL });
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn('[ChequeScan] KV rate limit check error:', { error: err.message });
  }
}

/** The models the scan offers, and whether this Worker can call each */
export function listChequeScanModels(env) {
  return CHEQUE_SCAN_MODELS.map(({ id, label, provider }) => ({
    id,
    label,
    provider,
    available: isChequeScanModelAvailable({ provider }, env),
    ...(provider === 'workers-ai' ? {} : { secret: AI_PROVIDER_SECRETS[provider] }),
  }));
}

/** Refuse (400 MODEL_NOT_CONFIGURED) a model whose binding or API key this Worker lacks */
export function assertChequeScanModelReady(model, env) {
  if (isChequeScanModelAvailable(model, env)) return;
  const what = model.provider === 'workers-ai'
    ? 'اتصال Workers AI (binding «AI»)'
    : `کلید ${AI_PROVIDER_SECRETS[model.provider]}`;
  throw new AppError(`${what} برای مدل «${model.label}» تنظیم نشده است.`, 400, 'MODEL_NOT_CONFIGURED');
}

/**
 * Scan one cheque image with the requested vision model.
 *
 * @param {object} env
 * @param {object} params
 * @param {ArrayBuffer} params.imageBuffer
 * @param {string} params.mimeType
 * @param {string} [params.requestedModel]
 * @returns {Promise<object>}
 */
export async function processChequeScan(env, { imageBuffer, mimeType, requestedModel }) {
  const model = resolveChequeScanModel(requestedModel, env);
  const modelId = model.id;
  const startTime = Date.now();
  const imageBytes = imageBuffer ? imageBuffer.byteLength : 0;

  assertChequeScanModelReady(model, env);

  let aiResponse = null;
  try {
    aiResponse = await runVisionModel(env, model, {
      systemPrompt: CHEQUE_SCAN_SYSTEM_PROMPT,
      userText: 'اطلاعات این چک بانکی را طبق دستورالعمل در قالب JSON استخراج کن.',
      imageBase64: toBase64(imageBuffer),
      mimeType,
      jsonSchema: CHEQUE_SCAN_JSON_SCHEMA,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const reason = err instanceof VisionProviderError ? err.reason : '';
    logger.error('[ChequeScan] Model inference failed:', {
      model: modelId,
      durationMs,
      imageBytes,
      error: err.message,
    });
    // Admin-only beta: the provider's reason helps tell a bad key or region from a bad model
    const message = reason ? `پردازش تصویر ناموفق بود (${model.label}: ${reason})` : 'پردازش تصویر ناموفق بود.';
    throw new AppError(message, 502, 'AI_GATEWAY_ERROR');
  }

  const durationMs = Date.now() - startTime;

  // The provider returns text (or, from Workers AI, an already-parsed object)
  const rawText = typeof aiResponse === 'string' ? aiResponse : JSON.stringify(aiResponse ?? null, null, 2);
  const parsedJson = typeof aiResponse === 'string' ? parseChequeScanJson(aiResponse) : aiResponse;

  const normalized = normalizeChequeScan(parsedJson || rawText);

  // Structured logging compliant with privacy rules (NO image, NO financial payload logged)
  logger.info('[ChequeScan] Scan completed', {
    model: modelId,
    durationMs,
    imageBytes,
    success: normalized.success,
  });

  return {
    success: normalized.success,
    notACheque: normalized.notACheque,
    fields: normalized.fields,
    confidence: normalized.confidence,
    warnings: normalized.warnings,
    raw: rawText,
    model: modelId,
    durationMs,
  };
}
