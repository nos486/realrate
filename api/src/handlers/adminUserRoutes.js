/**
 * adminUserRoutes.js — Admin actions on one user: details, block / unblock, sign out
 * everywhere, resend the verification email; plus the daily growth series
 *
 * Every route requires the admin role. Admin accounts (ADMIN_EMAIL) cannot be blocked from
 * here, so the panel can never lock its own owners out.
 */

import { getAuthenticatedUser, isUserAdmin } from "../lib/auth.js";
import { AppError } from "../lib/AppError.js";
import { jsonResponse } from "../lib/helpers.js";
import { isEmailConfigured } from "../lib/email.js";
import {
  dbGetUserDetail,
  dbSetUserDisabled,
  dbGetDailyGrowth,
  dbGetUserAuthById,
  dbDeleteUserSessions,
} from "../repositories/index.js";
import { sendVerification } from "./accountRoutes.js";

const GROWTH_DAYS_DEFAULT = 30;
const GROWTH_DAYS_MAX = 90;

async function requireAdminUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
  return user;
}

async function readUserId(request) {
  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!userId) throw AppError.badRequest("شناسه کاربر الزامی است.");
  return { userId, body };
}

async function loadAccount(env, userId) {
  const account = await dbGetUserAuthById(env, userId);
  if (!account) throw AppError.notFound("کاربر مورد نظر یافت نشد.");
  return account;
}

/** The detail view of a user, with the flags the panel needs for its actions */
async function detailResponse(request, env, userId) {
  const detail = await dbGetUserDetail(env, userId);
  if (!detail) throw AppError.notFound("کاربر مورد نظر یافت نشد.");
  return { ...detail, isAdmin: isUserAdmin(detail.email, env) };
}

/**
 * GET /api/admin/users/detail?userId=...
 * Account facts and usage counts of one user
 */
export async function handleAdminUserDetail(request, env) {
  await requireAdminUser(request, env);
  const userId = (new URL(request.url).searchParams.get("userId") || "").trim();
  if (!userId) throw AppError.badRequest("شناسه کاربر الزامی است.");
  return jsonResponse({ success: true, user: await detailResponse(request, env, userId) }, 200, request);
}

/**
 * POST /api/admin/users/block { userId, blocked: boolean }
 * Blocking also ends every session of the user, so it takes effect immediately
 */
export async function handleAdminBlockUser(request, env) {
  const admin = await requireAdminUser(request, env);
  const { userId, body } = await readUserId(request);
  const blocked = body.blocked !== false;
  const account = await loadAccount(env, userId);
  if (blocked && (isUserAdmin(account.email, env) || account.id === (admin.userId || admin.id))) {
    throw AppError.badRequest("حساب مدیر سیستم را نمی‌توان مسدود کرد.");
  }

  await dbSetUserDisabled(env, account.id, blocked);
  const endedSessions = blocked ? await dbDeleteUserSessions(env, account.id) : 0;
  return jsonResponse({
    success: true,
    message: blocked ? "حساب کاربر مسدود شد و از همه دستگاه‌ها خارج شد." : "حساب کاربر دوباره فعال شد.",
    endedSessions,
    user: await detailResponse(request, env, account.id),
  }, 200, request);
}

/**
 * POST /api/admin/users/signout { userId }
 * End every session of the user (they stay able to sign in again)
 */
export async function handleAdminSignOutUser(request, env) {
  const admin = await requireAdminUser(request, env);
  const { userId } = await readUserId(request);
  const account = await loadAccount(env, userId);
  // Never end the session making this request
  const currentToken = admin.token || null;
  const endedSessions = await dbDeleteUserSessions(env, account.id, { exceptToken: currentToken });
  return jsonResponse({
    success: true,
    message: endedSessions > 0
      ? `کاربر از ${endedSessions.toLocaleString("fa-IR")} نشست فعال خارج شد.`
      : "کاربر نشست فعالی نداشت.",
    endedSessions,
    user: await detailResponse(request, env, account.id),
  }, 200, request);
}

/**
 * POST /api/admin/users/resend-verification { userId }
 * Send a fresh verification link to an email/password account that is not verified yet
 */
export async function handleAdminResendVerification(request, env) {
  await requireAdminUser(request, env);
  const { userId } = await readUserId(request);
  const account = await loadAccount(env, userId);
  if (account.emailVerified) throw AppError.badRequest("ایمیل این کاربر قبلاً تأیید شده است.");
  if (!account.passwordHash) throw AppError.badRequest("این حساب رمز عبور ندارد و با گوگل تأیید می‌شود.");
  if (!isEmailConfigured(env)) {
    throw new AppError("ارسال ایمیل روی سرور تنظیم نشده است.", 503, "EMAIL_NOT_CONFIGURED");
  }
  await sendVerification(request, env, account);
  return jsonResponse({ success: true, message: `لینک تأیید دوباره به ${account.email} ارسال شد.` }, 200, request);
}

/**
 * GET /api/admin/growth?days=30
 * Sign-ups and active users per day
 */
export async function handleAdminGrowth(request, env) {
  await requireAdminUser(request, env);
  const requested = parseInt(new URL(request.url).searchParams.get("days") || "", 10);
  const days = Number.isFinite(requested) && requested > 0 ? Math.min(requested, GROWTH_DAYS_MAX) : GROWTH_DAYS_DEFAULT;
  return jsonResponse({ success: true, days, series: await dbGetDailyGrowth(env, days) }, 200, request);
}
