/**
 * chequeScanRoutes.js — Route handlers for AI cheque scanning
 *
 * POST /api/cheques/scan        — scan one image (a daily use of the `cheque_scan` limit)
 * GET  /api/cheques/scan/quota  — today's use of that limit
 * Behind the `cheque_scan` feature; the `cheque_scan_debug` feature (admins) adds the model's raw
 * answer and a failure's reason.
 */

import { requireFeature } from '../lib/features.js';
import { isFeatureEnabled } from '../config/features.js';
import { consumeQuota, getQuota, refundQuota } from '../lib/usageQuota.js';
import { assertChequeScanReady, processChequeScan } from '../services/ai/chequeScan.service.js';
import { jsonResponse } from '../lib/helpers.js';
import { AppError } from '../lib/AppError.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * POST /api/cheques/scan
 * Handles image upload via multipart/form-data and reads it with Gemini
 */
export async function handleChequeScanRoute(request, env) {
  // 1. Guard with the feature check (404 when it isn't enabled for this user)
  const user = await requireFeature(request, env, 'cheque_scan');

  // 3. Validate Content-Type
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    throw AppError.badRequest('درخواست باید شامل فرم چندبخشی (multipart/form-data) باشد.');
  }

  // 4. Parse multipart form data
  let formData;
  try {
    formData = await request.formData();
  } catch (err) {
    throw AppError.badRequest('خطا در پردازش فرم چندبخشی ارسالی.');
  }

  const imageFile = formData.get('image');

  // 5. Validate image presence
  if (!imageFile || typeof imageFile === 'string' || !imageFile.size) {
    throw AppError.badRequest('ارسال فایل تصویر چک الزامی است.');
  }

  // 6. Validate file size (max 2 MB)
  if (imageFile.size > MAX_IMAGE_BYTES) {
    throw new AppError(
      'حجم تصویر بیش از حد مجاز (حداکثر ۲ مگابایت) است.',
      413,
      'PAYLOAD_TOO_LARGE'
    );
  }

  // 7. Validate MIME type
  if (!ALLOWED_MIME_TYPES.has(imageFile.type)) {
    throw new AppError(
      'فرمت فایل نامعتبر است. فقط فرمت‌های JPEG، PNG و WebP مجاز هستند.',
      400,
      'INVALID_FILE_TYPE'
    );
  }

  // 8. Today's use of the limit, taken only for a valid upload the scan can serve
  const debug = isFeatureEnabled('cheque_scan_debug', user);
  assertChequeScanReady(env, { isAdmin: debug });
  const quota = await consumeQuota(env, user, 'cheque_scan');

  // 9. Read the cheque; a failed call gives the use back
  let scanResult;
  try {
    scanResult = await processChequeScan(env, {
      imageBuffer: await imageFile.arrayBuffer(),
      mimeType: imageFile.type,
      debug,
    });
  } catch (err) {
    await refundQuota(env, user, 'cheque_scan');
    throw err;
  }

  return jsonResponse({ ...scanResult, quota }, 200, request);
}

/** GET /api/cheques/scan/quota — today's scans: limit (null: none), used, remaining */
export async function handleChequeScanQuotaRoute(request, env) {
  const user = await requireFeature(request, env, 'cheque_scan');
  return jsonResponse({ success: true, quota: await getQuota(env, user, 'cheque_scan') }, 200, request);
}
