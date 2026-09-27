/**
 * chequeScanRoutes.js — Route handler for AI cheque scanning
 *
 * Endpoint: POST /api/cheques/scan
 * Permissions: Admin only (protected via requireFeature('cheque_scan'))
 */

import { requireFeature } from '../lib/features.js';
import { enforceScanRateLimit, processChequeScan } from '../services/ai/chequeScan.service.js';
import { jsonResponse } from '../lib/helpers.js';
import { AppError } from '../lib/AppError.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * POST /api/cheques/scan
 * Handles image upload via multipart/form-data and delegates to Workers AI
 */
export async function handleChequeScanRoute(request, env) {
  // 1. Guard with beta feature check (throws 404 for non-admins or unauthenticated)
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
  const requestedModel = formData.get('model');

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

  // 8. Daily limit (30 scans per day in KV), counted only for a valid upload
  const userId = user.userId || user.id || user.email;
  await enforceScanRateLimit(env, userId);

  // 9. Process image with Workers AI
  const imageBuffer = await imageFile.arrayBuffer();
  const scanResult = await processChequeScan(env, {
    imageBuffer,
    mimeType: imageFile.type,
    requestedModel,
  });

  return jsonResponse(scanResult, 200, request);
}
