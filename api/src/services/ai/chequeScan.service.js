/**
 * chequeScan.service.js — Cloudflare Workers AI integration for Iranian Cheque Scanning
 *
 * Privacy & Security:
 * - Image binary and extracted data are NEVER stored in database, KV, or logs.
 * - Logs strictly record metadata: model ID, duration, image size, and success status.
 */

import { resolveChequeScanModel } from '../../config/ai.config.js';
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

const AI_TIMEOUT_MS = 45000;

/** One model call, failing with AI_TIMEOUT after AI_TIMEOUT_MS */
async function runWithTimeout(env, modelId, payload) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS);
  });
  try {
    return await Promise.race([env.AI.run(modelId, payload), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute cheque vision scan with Workers AI binding.
 *
 * @param {object} env
 * @param {object} params
 * @param {ArrayBuffer} params.imageBuffer
 * @param {string} params.mimeType
 * @param {string} [params.requestedModel]
 * @returns {Promise<object>}
 */
export async function processChequeScan(env, { imageBuffer, mimeType, requestedModel }) {
  const modelId = resolveChequeScanModel(requestedModel);
  const startTime = Date.now();
  const imageBytes = imageBuffer ? imageBuffer.byteLength : 0;

  if (!env.AI || typeof env.AI.run !== 'function') {
    logger.error('[ChequeScan] Workers AI binding (env.AI) is missing or invalid.');
    throw new AppError('پردازش تصویر ناموفق بود.', 502, 'AI_GATEWAY_ERROR');
  }

  // Convert image to base64 data URL
  const uint8 = new Uint8Array(imageBuffer);
  let binary = '';
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const base64 = btoa(binary);
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const payload = {
    messages: [
      {
        role: 'system',
        content: CHEQUE_SCAN_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'اطلاعات این چک بانکی را طبق دستورالعمل در قالب JSON استخراج کن.',
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 1000,
  };

  let aiResponse = null;

  try {
    // JSON mode first; a model that doesn't take it with an image gets the plain request (the
    // prompt asks for JSON, and the parser finds it in text)
    try {
      aiResponse = await runWithTimeout(env, modelId, {
        ...payload,
        response_format: { type: 'json_schema', json_schema: CHEQUE_SCAN_JSON_SCHEMA },
      });
    } catch (err) {
      if (err.message === 'AI_TIMEOUT') throw err;
      logger.warn('[ChequeScan] JSON mode refused, retrying without it:', { model: modelId, error: err.message });
      aiResponse = await runWithTimeout(env, modelId, payload);
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logger.error('[ChequeScan] Model inference failed:', {
      model: modelId,
      durationMs,
      imageBytes,
      error: err.message,
    });
    throw new AppError('پردازش تصویر ناموفق بود.', 502, 'AI_GATEWAY_ERROR');
  }

  const durationMs = Date.now() - startTime;

  // Extract raw text or object from Workers AI envelope
  let rawText = '';
  let parsedJson = null;

  if (aiResponse) {
    if (typeof aiResponse === 'string') {
      rawText = aiResponse;
      parsedJson = parseChequeScanJson(aiResponse);
    } else if (typeof aiResponse === 'object') {
      if (typeof aiResponse.response === 'string') {
        rawText = aiResponse.response;
        parsedJson = parseChequeScanJson(aiResponse.response);
      } else if (aiResponse.response && typeof aiResponse.response === 'object') {
        parsedJson = aiResponse.response;
        rawText = JSON.stringify(aiResponse.response, null, 2);
      } else if (aiResponse.choices?.[0]?.message?.content) {
        rawText = aiResponse.choices[0].message.content;
        parsedJson = parseChequeScanJson(rawText);
      } else {
        rawText = JSON.stringify(aiResponse, null, 2);
        parsedJson = aiResponse;
      }
    }
  }

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
