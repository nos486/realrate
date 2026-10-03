/**
 * alertEmailRoutes.js — HTTP endpoints for reminder email preferences and test digests
 *
 * Endpoints:
 *   GET  /api/alerts/email       — Account email reminder settings + provider status
 *   PUT  /api/alerts/email       — Save preferences (rate-limited)
 *   POST /api/alerts/email/test  — Send test digest to verified email (strictly rate-limited: 3/hr)
 */

import { getAuthenticatedUser } from '../lib/auth.js';
import { dbGetAlertEmailPrefs, dbSaveAlertEmailPrefs } from '../repositories/alertEmail.repository.js';
import { dbGetUserAuthById } from '../repositories/account.repository.js';
import { validateAlertEmailPrefs } from '../domain/alertEmailPrefs.js';
import { isEmailConfigured, sendEmail, reminderDigestEmail } from '../lib/email.js';
import { getRateLimitState, recordRateLimitHit } from '../lib/security.js';
import { jsonResponse } from '../lib/helpers.js';
import { AppError } from '../lib/AppError.js';

const PUT_LIMIT = { limit: 30, windowSec: 60 };
const TEST_LIMIT = { limit: 3, windowSec: 3600 };

async function requireUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized('جهت دسترسی به تنظیمات یادآوری، ابتدا وارد حساب کاربری خود شوید.');
  return user;
}

const userIdOf = (user) => user.userId || user.id || user.email;

/** The session holds no verification state; the account row does (the digest cron reads the same column) */
async function isEmailVerified(env, userId) {
  const account = await dbGetUserAuthById(env, userId);
  return Boolean(account?.emailVerified && !account.disabled);
}

export async function handleGetAlertEmailPrefs(request, env) {
  const user = await requireUser(request, env);
  const userId = userIdOf(user);
  const [prefs, emailVerified] = await Promise.all([dbGetAlertEmailPrefs(env, userId), isEmailVerified(env, userId)]);

  return jsonResponse({
    success: true,
    prefs,
    emailConfigured: isEmailConfigured(env),
    email: user.email || '',
    emailVerified,
  }, 200, request);
}

export async function handlePutAlertEmailPrefs(request, env) {
  const user = await requireUser(request, env);
  const userId = userIdOf(user);

  const key = `alert-email-put:${userId}`;
  const { limited } = await getRateLimitState(env, key, PUT_LIMIT);
  if (limited) throw new AppError('تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً تلاش کنید.', 429, 'TOO_MANY_REQUESTS');
  await recordRateLimitHit(env, key, PUT_LIMIT);

  const body = await request.json().catch(() => ({}));
  const { value, error } = validateAlertEmailPrefs(body);
  if (error) throw AppError.badRequest(error);

  const saved = await dbSaveAlertEmailPrefs(env, userId, value);
  return jsonResponse({ success: true, prefs: saved }, 200, request);
}

export async function handleSendTestEmailAlert(request, env) {
  const user = await requireUser(request, env);
  const userId = userIdOf(user);

  if (!isEmailConfigured(env)) {
    throw new AppError('ارسال ایمیل روی سرور تنظیم نشده است.', 503, 'EMAIL_NOT_CONFIGURED');
  }

  const isVerified = await isEmailVerified(env, userId);
  if (!isVerified || !user.email) {
    throw AppError.badRequest('برای ارسال ایمیل آزمایشی، ابتدا ایمیل حساب خود را تأیید کنید.', 'EMAIL_NOT_VERIFIED');
  }

  const key = `alert-email-test:${userId}`;
  const { limited } = await getRateLimitState(env, key, TEST_LIMIT);
  if (limited) {
    throw new AppError('سقف ارسال ایمیل آزمایشی (۳ بار در ساعت) پر شده است. لطفاً بعداً دوباره تلاش کنید.', 429, 'TOO_MANY_REQUESTS');
  }
  await recordRateLimitHit(env, key, TEST_LIMIT);

  const appUrl = (new URL(request.url)).origin;
  const testDigest = reminderDigestEmail({
    subject: 'RealRate: ایمیل آزمایشی یادآوری سررسید',
    items: [
      '۱ قسط وام فردا سررسید می‌شود',
      '۱ چک صادره امروز سررسید است — موجودی حسابتان را بررسی کنید',
      'حقوق/درآمد ثابت امروز باید واریز شود',
    ],
    appUrl,
    settingsUrl: `${appUrl}/settings`,
  });

  await sendEmail(env, {
    to: user.email,
    subject: testDigest.subject,
    html: testDigest.html,
    text: testDigest.text,
  });

  return jsonResponse({ success: true, message: 'ایمیل آزمایشی با موفقیت ارسال شد.' }, 200, request);
}
