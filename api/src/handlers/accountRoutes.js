/**
 * accountRoutes.js — Email/password accounts alongside Google Sign-In
 *
 * Endpoints:
 *   POST /api/auth/register                 — Create an account; sends a verification link
 *   POST /api/auth/verify-email             — Use the link's token; signs the user in
 *   POST /api/auth/verify-email/resend      — Send the verification link again
 *   POST /api/auth/login                    — Email + password (only verified addresses)
 *   POST /api/auth/password/forgot          — Email a password-reset link (also lets a Google
 *                                             user add a password without being signed in)
 *   POST /api/auth/password/reset           — Set a new password with the link's token
 *   POST /api/auth/password                 — Signed in: set a first password, or change it
 *
 * Privacy & abuse: register / resend / forgot answer the same way whether or not the email is
 * registered (the email itself tells the owner what happened), attempts are rate-limited, links
 * are single-use and stored hashed, and a reset or change signs out every other session.
 */

import { assertNotMaintenance } from "../lib/maintenance.js";
import { getAuthenticatedUser, isUserAdmin } from "../lib/auth.js";
import {
  dbGetUserAuthByEmail,
  dbGetUserAuthById,
  dbCreatePasswordUser,
  dbUpdateUnverifiedSignup,
  dbSetUserPassword,
  dbMarkEmailVerified,
  dbRecordLogin,
  dbCreateAuthToken,
  dbConsumeAuthToken,
  dbDeleteUserSessions,
  dbSaveSession,
  normalizeEmail,
} from "../repositories/index.js";
import { getCorsHeaders, getClientIp } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import {
  hashPassword,
  verifyPassword,
  isTrustedOrigin,
  getRateLimitState,
  recordRateLimitHit,
  clearRateLimit,
} from "../lib/security.js";
import { sendEmail, isEmailConfigured, verificationEmail, passwordResetEmail, accountExistsEmail } from "../lib/email.js";
import { SESSION_TTL_SECONDS, SESSION_COOKIE_MAX_AGE } from "../config/constants.js";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 60;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const VERIFY_TOKEN_TTL = 24 * 3600;
const RESET_TOKEN_TTL = 3600;

const LIMITS = {
  loginIp: { limit: 30, windowSec: 15 * 60 },
  loginEmail: { limit: 8, windowSec: 15 * 60 },
  registerIp: { limit: 10, windowSec: 3600 },
  mailEmail: { limit: 3, windowSec: 15 * 60 },
  mailIp: { limit: 15, windowSec: 3600 },
  passwordChange: { limit: 8, windowSec: 15 * 60 },
};

const DEFAULT_FRONTEND_ORIGIN = "https://realrate.geekio.org";

const SENT_MESSAGE = "اگر این ایمیل قابل استفاده باشد، لینکی برای آن ارسال شد. صندوق ورودی و پوشه اسپم را بررسی کنید.";

// ── Validation ──────────────────────────────────────────────────────────────

export function parseEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > EMAIL_MAX_LENGTH || !EMAIL_RE.test(email)) {
    throw AppError.badRequest("لطفاً یک ایمیل معتبر وارد کنید.");
  }
  return email;
}

export function parseNewPassword(value) {
  const password = typeof value === "string" ? value : "";
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw AppError.badRequest(`رمز عبور باید حداقل ${PASSWORD_MIN_LENGTH.toLocaleString("fa-IR")} کاراکتر باشد.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw AppError.badRequest("رمز عبور بیش از حد طولانی است.");
  }
  if (!/[A-Za-z؀-ۿ]/.test(password) || !/[0-9۰-۹]/.test(password)) {
    throw AppError.badRequest("رمز عبور باید هم حرف و هم عدد داشته باشد.");
  }
  return password;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Where links in emails point: the frontend that made the request, when it is one of ours */
export function resolveFrontendOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (origin && isTrustedOrigin(origin)) return new URL(origin).origin;
  const configured = String(env?.FRONTEND_URL || "").trim();
  if (configured && isTrustedOrigin(configured)) return new URL(configured).origin;
  return DEFAULT_FRONTEND_ORIGIN;
}

async function readJson(request) {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" ? body : {};
}

function json(request, data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...getCorsHeaders(request), ...extraHeaders },
  });
}

async function enforceLimit(env, key, limit, message = "تعداد تلاش‌ها بیش از حد مجاز است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.") {
  const { limited } = await getRateLimitState(env, key, limit);
  if (limited) throw new AppError(message, 429, "TOO_MANY_REQUESTS");
}

/** The user object the frontend keeps (same shape as /api/auth/me) */
export function publicUser(account, env) {
  const role = isUserAdmin(account.email, env) ? "admin" : "user";
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    customName: account.customName || "",
    picture: account.picture || "",
    role,
    isAdmin: role === "admin",
    hasPassword: Boolean(account.passwordHash),
    emailVerified: account.emailVerified,
  };
}

export const ACCOUNT_DISABLED_MESSAGE = "حساب کاربری شما توسط مدیر سیستم مسدود شده است.";

/** Start a 30-day session and answer with the token (body + cookie), like Google sign-in */
async function signIn(request, env, account, message) {
  if (account.disabled) throw new AppError(ACCOUNT_DISABLED_MESSAGE, 403, "ACCOUNT_DISABLED");
  await assertNotMaintenance(env, account.email);
  const user = publicUser(account, env);
  const token = crypto.randomUUID();
  await dbSaveSession(env, {
    token,
    userId: account.id,
    email: account.email,
    name: account.name,
    picture: account.picture || "",
    role: user.role,
    createdAt: new Date().toISOString(),
  }, SESSION_TTL_SECONDS);
  await dbRecordLogin(env, account.id);
  return json(request, { success: true, message, token, user }, 200, {
    "Set-Cookie": `realrate_session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_COOKIE_MAX_AGE}`,
  });
}

export async function sendVerification(request, env, account) {
  const token = await dbCreateAuthToken(env, account.id, "verify_email", VERIFY_TOKEN_TTL);
  const url = `${resolveFrontendOrigin(request, env)}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail(env, { to: account.email, ...verificationEmail(url) });
}

async function sendPasswordReset(request, env, account) {
  const token = await dbCreateAuthToken(env, account.id, "reset_password", RESET_TOKEN_TTL);
  const url = `${resolveFrontendOrigin(request, env)}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail(env, { to: account.email, ...passwordResetEmail(url) });
}

async function sendAccountExists(request, env, account) {
  const origin = resolveFrontendOrigin(request, env);
  const token = await dbCreateAuthToken(env, account.id, "reset_password", RESET_TOKEN_TTL);
  await sendEmail(env, {
    to: account.email,
    ...accountExistsEmail(`${origin}/login`, `${origin}/reset-password?token=${encodeURIComponent(token)}`),
  });
}

/**
 * Before anything that sends an email: the deployment must be able to send one (checked first,
 * so a sign-up is never created that could not be verified), then a per-address and per-IP brake.
 */
async function guardEmailSending(request, env, email) {
  await assertNotMaintenance(env, email);
  if (!isEmailConfigured(env)) {
    throw new AppError("ارسال ایمیل روی سرور تنظیم نشده است. فعلاً با گوگل وارد شوید.", 503, "EMAIL_NOT_CONFIGURED");
  }
  const ip = getClientIp(request);
  await enforceLimit(env, `mail-ip:${ip}`, LIMITS.mailIp);
  await enforceLimit(env, `mail:${email}`, LIMITS.mailEmail, "برای این ایمیل به‌تازگی لینک ارسال شده است. چند دقیقه دیگر دوباره تلاش کنید.");
  await recordRateLimitHit(env, `mail-ip:${ip}`, LIMITS.mailIp);
  await recordRateLimitHit(env, `mail:${email}`, LIMITS.mailEmail);
}

// ── Handlers ────────────────────────────────────────────────────────────────

export async function handleRegister(request, env) {
  const body = await readJson(request);
  const email = parseEmail(body.email);
  const password = parseNewPassword(body.password);
  const name = String(body.name ?? "").trim().slice(0, NAME_MAX_LENGTH) || email.split("@")[0];

  const ip = getClientIp(request);
  await enforceLimit(env, `register:${ip}`, LIMITS.registerIp);
  await recordRateLimitHit(env, `register:${ip}`, LIMITS.registerIp);
  await guardEmailSending(request, env, email);

  const existing = await dbGetUserAuthByEmail(env, email);
  if (!existing) {
    const account = await dbCreatePasswordUser(env, {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: isUserAdmin(email, env) ? "admin" : "user",
    });
    await sendVerification(request, env, account);
  } else if (!existing.emailVerified) {
    // Never verified: whoever signs up again takes over the pending sign-up (it has no data and
    // could not be used without the address anyway)
    await dbUpdateUnverifiedSignup(env, existing.id, { name, passwordHash: await hashPassword(password) });
    await sendVerification(request, env, existing);
  } else {
    // A real account already owns this address: tell its owner by email, not the requester
    await sendAccountExists(request, env, existing);
  }

  return json(request, { success: true, message: SENT_MESSAGE, email });
}

export async function handleVerifyEmail(request, env) {
  const body = await readJson(request);
  const userId = await dbConsumeAuthToken(env, String(body.token || ""), "verify_email");
  if (!userId) throw AppError.badRequest("لینک تأیید نامعتبر یا منقضی شده است. لینک جدید درخواست کنید.", "INVALID_TOKEN");
  await dbMarkEmailVerified(env, userId);
  const account = await dbGetUserAuthById(env, userId);
  if (!account) throw AppError.badRequest("حساب کاربری یافت نشد.", "INVALID_TOKEN");
  return signIn(request, env, account, "ایمیل شما تأیید شد. خوش آمدید!");
}

export async function handleResendVerification(request, env) {
  const body = await readJson(request);
  const email = parseEmail(body.email);
  await guardEmailSending(request, env, email);
  const account = await dbGetUserAuthByEmail(env, email);
  if (account && !account.emailVerified && account.passwordHash) await sendVerification(request, env, account);
  return json(request, { success: true, message: SENT_MESSAGE });
}

export async function handleLogin(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) throw AppError.badRequest("ایمیل و رمز عبور را وارد کنید.");

  const ip = getClientIp(request);
  await enforceLimit(env, `login-ip:${ip}`, LIMITS.loginIp);
  await enforceLimit(env, `login:${email}`, LIMITS.loginEmail);

  const account = await dbGetUserAuthByEmail(env, email);
  // verifyPassword also runs for a missing account or one without a password (equal timing)
  const valid = await verifyPassword(password, account?.passwordHash || "");
  if (!account || !valid) {
    await recordRateLimitHit(env, `login-ip:${ip}`, LIMITS.loginIp);
    await recordRateLimitHit(env, `login:${email}`, LIMITS.loginEmail);
    throw new AppError("ایمیل یا رمز عبور نادرست است.", 401, "INVALID_CREDENTIALS");
  }
  if (!account.emailVerified) {
    throw new AppError("ایمیل شما هنوز تأیید نشده است. لینک تأیید را از صندوق ایمیل باز کنید یا دوباره درخواست دهید.", 403, "EMAIL_NOT_VERIFIED");
  }

  await clearRateLimit(env, `login:${email}`);
  return signIn(request, env, account, "ورود موفقیت‌آمیز بود.");
}

export async function handleForgotPassword(request, env) {
  const body = await readJson(request);
  const email = parseEmail(body.email);
  await guardEmailSending(request, env, email);
  const account = await dbGetUserAuthByEmail(env, email);
  if (account) await sendPasswordReset(request, env, account);
  return json(request, { success: true, message: SENT_MESSAGE });
}

export async function handleResetPassword(request, env) {
  const body = await readJson(request);
  const password = parseNewPassword(body.password);
  const userId = await dbConsumeAuthToken(env, String(body.token || ""), "reset_password");
  if (!userId) throw AppError.badRequest("لینک بازیابی نامعتبر یا منقضی شده است. لینک جدید درخواست کنید.", "INVALID_TOKEN");

  // The emailed link proves the address, so this also verifies an unverified account
  await dbSetUserPassword(env, userId, await hashPassword(password), { markVerified: true });
  await dbDeleteUserSessions(env, userId);
  const account = await dbGetUserAuthById(env, userId);
  if (!account) throw AppError.badRequest("حساب کاربری یافت نشد.", "INVALID_TOKEN");
  return signIn(request, env, account, "رمز عبور جدید ثبت شد و از دستگاه‌های دیگر خارج شدید.");
}

export async function handleSetPassword(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized();
  await assertNotMaintenance(env, user.email);
  const userId = user.userId || user.id;
  const account = await dbGetUserAuthById(env, userId);
  if (!account) throw AppError.unauthorized();

  const body = await readJson(request);
  const password = parseNewPassword(body.newPassword);

  // Changing an existing password needs the current one; a Google account adding its first
  // password is already proven by its Google sign-in
  if (account.passwordHash) {
    await enforceLimit(env, `pwchange:${userId}`, LIMITS.passwordChange);
    if (!(await verifyPassword(String(body.currentPassword ?? ""), account.passwordHash))) {
      await recordRateLimitHit(env, `pwchange:${userId}`, LIMITS.passwordChange);
      throw new AppError("رمز عبور فعلی نادرست است.", 400, "INVALID_CURRENT_PASSWORD");
    }
  }

  await dbSetUserPassword(env, userId, await hashPassword(password));
  const currentToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/, "").trim() || null;
  const signedOut = await dbDeleteUserSessions(env, userId, { exceptToken: currentToken });
  await clearRateLimit(env, `pwchange:${userId}`);

  return json(request, {
    success: true,
    message: account.passwordHash
      ? "رمز عبور تغییر کرد."
      : "رمز عبور تعیین شد؛ از این پس می‌توانید با ایمیل و رمز هم وارد شوید.",
    signedOutSessions: signedOut,
  });
}
