/**
 * pushRoutes.js — HTTP endpoints for sealed Web Push subscriptions and reminders
 *
 * Endpoints:
 *   GET    /api/alerts/push/vapid-key          — Public VAPID key and provider status
 *   POST   /api/alerts/push/subscription       — Register/update device push subscription
 *   DELETE /api/alerts/push/subscription/:dev  — Remove device push subscription
 *   PUT    /api/alerts/push/reminders          — Upload sealed push reminders for device
 *   POST   /api/alerts/push/test               — Send test push notification (strictly rate-limited: 5/hr)
 *   GET    /api/alerts/push/news?deviceId=     — Whether this browser gets important news
 *   PUT    /api/alerts/push/news               — Turn important news on or off ({ deviceId, enabled })
 */

import { getAuthenticatedUser } from '../lib/auth.js';
import {
  dbGetPushSubscription,
  dbSavePushSubscription,
  dbDeletePushSubscription,
  dbSavePushReminders,
  dbGetNewsAlerts,
  dbSetNewsAlerts,
} from '../repositories/push.repository.js';
import { validatePushSubscriptionInput, validatePushRemindersInput, DEVICE_ID_RE } from '../domain/sealedPush.js';
import { isWebPushConfigured, sendWebPush } from '../lib/webPush.js';
import { getRateLimitState, recordRateLimitHit } from '../lib/security.js';
import { jsonResponse } from '../lib/helpers.js';
import { AppError } from '../lib/AppError.js';

const SUB_LIMIT = { limit: 30, windowSec: 60 };
const REMINDERS_LIMIT = { limit: 60, windowSec: 60 };
const TEST_LIMIT = { limit: 5, windowSec: 3600 };

async function requireUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized('جهت دسترسی به اعلان‌های مرورگر، ابتدا وارد حساب کاربری خود شوید.');
  return user;
}

const userIdOf = (user) => user.userId || user.id || user.email;

export async function handleGetVapidKey(request, env) {
  await requireUser(request, env);
  return jsonResponse({
    success: true,
    vapidPublicKey: env.VAPID_PUBLIC_KEY || '',
    configured: isWebPushConfigured(env),
  }, 200, request);
}

export async function handleSavePushSubscription(request, env) {
  const user = await requireUser(request, env);
  const userId = userIdOf(user);

  const key = `push-sub:${userId}`;
  const { limited } = await getRateLimitState(env, key, SUB_LIMIT);
  if (limited) throw new AppError('تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید.', 429, 'TOO_MANY_REQUESTS');
  await recordRateLimitHit(env, key, SUB_LIMIT);

  const body = await request.json().catch(() => ({}));
  const { value, error } = validatePushSubscriptionInput(body);
  if (error) throw AppError.badRequest(error);

  await dbSavePushSubscription(env, userId, value);
  return jsonResponse({ success: true, deviceId: value.deviceId }, 200, request);
}

export async function handleDeletePushSubscription(request, env, deviceId) {
  const user = await requireUser(request, env);
  const userId = userIdOf(user);

  if (!deviceId) throw AppError.badRequest('شناسه دستگاه الزامی است.');
  await dbDeletePushSubscription(env, userId, deviceId);
  return jsonResponse({ success: true }, 200, request);
}

export async function handlePutPushReminders(request, env) {
  const user = await requireUser(request, env);
  const userId = userIdOf(user);

  const key = `push-reminders:${userId}`;
  const { limited } = await getRateLimitState(env, key, REMINDERS_LIMIT);
  if (limited) throw new AppError('تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید.', 429, 'TOO_MANY_REQUESTS');
  await recordRateLimitHit(env, key, REMINDERS_LIMIT);

  const body = await request.json().catch(() => ({}));
  const { value, error } = validatePushRemindersInput(body);
  if (error) throw AppError.badRequest(error);

  try {
    const result = await dbSavePushReminders(env, userId, value);
    return jsonResponse(result, 200, request);
  } catch (err) {
    throw AppError.badRequest(err.message);
  }
}

export async function handleSendTestPush(request, env) {
  const user = await requireUser(request, env);
  const userId = userIdOf(user);

  if (!isWebPushConfigured(env)) {
    throw AppError.badRequest('سرویس اعلان مرورگر روی سرور تنظیم نشده است.');
  }

  const key = `push-test:${userId}`;
  const { limited } = await getRateLimitState(env, key, TEST_LIMIT);
  if (limited) throw new AppError('حداکثر ۵ اعلان آزمایشی در هر ساعت مجاز است. لطفاً بعداً تلاش کنید.', 429, 'TOO_MANY_REQUESTS');
  await recordRateLimitHit(env, key, TEST_LIMIT);

  const body = await request.json().catch(() => ({}));
  const deviceId = String(body.deviceId || '').trim();
  const sealed = String(body.sealed || '').trim();

  if (!deviceId || !sealed) {
    throw AppError.badRequest('شناسه دستگاه و بسته رمزنگاری‌شده الزامی هستند.');
  }

  const subRow = await dbGetPushSubscription(env, deviceId);
  if (!subRow || String(subRow.userId) !== String(userId)) {
    throw AppError.notFound('اشتراک اعلان این دستگاه یافت نشد.');
  }

  const res = await sendWebPush(env, {
    subscription: subRow.subscription,
    data: sealed,
  });

  if (res.expired) {
    await dbDeletePushSubscription(env, userId, deviceId);
    throw AppError.badRequest('اشتراک این دستگاه منقضی شده است. لطفاً اعلان را دوباره فعال کنید.');
  }

  if (!res.success) {
    throw new AppError(res.error || 'ارسال اعلان آزمایشی ناموفق بود.', 500);
  }

  return jsonResponse({ success: true, message: 'اعلان آزمایشی ارسال شد.' }, 200, request);
}

const validDeviceId = (id) => typeof id === 'string' && DEVICE_ID_RE.test(id);

export async function handleGetNewsAlerts(request, env) {
  const user = await requireUser(request, env);
  const deviceId = new URL(request.url).searchParams.get('deviceId') || '';
  if (!validDeviceId(deviceId)) throw AppError.badRequest('شناسه‌ی دستگاه نامعتبر است.');
  const state = await dbGetNewsAlerts(env, userIdOf(user), deviceId);
  return jsonResponse({ success: true, ...state, configured: isWebPushConfigured(env) }, 200, request);
}

export async function handleSetNewsAlerts(request, env) {
  const user = await requireUser(request, env);
  const body = await request.json().catch(() => ({}));
  if (!validDeviceId(body?.deviceId)) throw AppError.badRequest('شناسه‌ی دستگاه نامعتبر است.');
  const found = await dbSetNewsAlerts(env, userIdOf(user), body.deviceId, body.enabled !== false);
  if (!found) throw AppError.badRequest('این مرورگر هنوز برای اعلان ثبت نشده است.');
  return jsonResponse({ success: true, enabled: body.enabled !== false }, 200, request);
}

