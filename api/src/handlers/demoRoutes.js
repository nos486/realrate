/**
 * demoRoutes.js — Route handlers for the read-only demo account:
 *  - Public visitor demo login: POST /api/auth/demo
 *  - Admin management:
 *      GET  /api/admin/demo
 *      POST /api/admin/demo
 *      POST /api/admin/demo/edit-session
 *      POST /api/admin/demo/reset
 */

import {
  dbGetDemoUser,
  dbEnsureDemoUser,
  dbGetDemoStats,
  dbResetDemoData,
  getDemoVaultPassphrase,
  DEMO_VIEW_TTL_SECONDS,
  DEMO_EDIT_TTL_SECONDS,
} from "../repositories/demo.repository.js";
import { dbSaveSession } from "../repositories/session.repository.js";
import { getAuthenticatedUser } from "../lib/auth.js";
import { jsonResponse, getClientIp } from "../lib/helpers.js";
import { getRateLimitState, recordRateLimitHit } from "../lib/security.js";
import { assertNotMaintenance } from "../lib/maintenance.js";
import { AppError } from "../lib/AppError.js";

const DEMO_LOGIN_RATE_LIMIT = { limit: 30, windowSec: 15 * 60 };

async function requireAdmin(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") {
    throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
  }
  return user;
}

/**
 * POST /api/auth/demo
 * Visitor one-click entry to the read-only demo account
 */
export async function handleDemoLogin(request, env) {
  const ip = getClientIp(request);
  const { limited } = await getRateLimitState(env, `demo-ip:${ip}`, DEMO_LOGIN_RATE_LIMIT);
  if (limited) {
    throw new AppError("تعداد درخواست‌ها بیش از حد مجاز است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.", 429, "TOO_MANY_REQUESTS");
  }
  await recordRateLimitHit(env, `demo-ip:${ip}`, DEMO_LOGIN_RATE_LIMIT);

  const demoUser = await dbGetDemoUser(env);
  if (!demoUser || demoUser.disabled) {
    throw new AppError("حساب کاربری دمو هنوز ایجاد نشده است.", 404, "DEMO_NOT_FOUND");
  }

  // Like regular sign in, maintenance stops non-admins
  await assertNotMaintenance(env, demoUser.email);

  const sessionToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const sessionData = {
    token: sessionToken,
    userId: demoUser.id,
    email: demoUser.email,
    name: demoUser.name,
    picture: demoUser.picture || "",
    role: "user",
    createdAt: now,
    kind: "demo_view",
  };

  await dbSaveSession(env, sessionData, DEMO_VIEW_TTL_SECONDS);

  return jsonResponse(
    {
      success: true,
      message: "ورود موفقیت‌آمیز به نسخه دمو",
      token: sessionToken,
      user: {
        id: demoUser.id,
        email: demoUser.email,
        name: demoUser.name,
        customName: demoUser.customName || "",
        picture: demoUser.picture || "",
        role: "user",
        isAdmin: false,
        hasPassword: false,
        emailVerified: true,
      },
      demo: { mode: "view" },
      demoVaultPassphrase: getDemoVaultPassphrase(env),
    },
    200,
    request,
    {
      "Set-Cookie": `realrate_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${DEMO_VIEW_TTL_SECONDS}`,
    }
  );
}

/**
 * GET /api/admin/demo
 * Admin inspects demo account metadata & counts
 */
export async function handleAdminGetDemo(request, env) {
  await requireAdmin(request, env);
  const stats = await dbGetDemoStats(env);
  return jsonResponse({ success: true, ...stats }, 200, request);
}

/**
 * POST /api/admin/demo
 * Admin ensures demo account user exists (idempotent)
 */
export async function handleAdminCreateDemo(request, env) {
  await requireAdmin(request, env);
  const user = await dbEnsureDemoUser(env);
  return jsonResponse(
    {
      success: true,
      message: "حساب کاربری دمو با موفقیت آماده شد.",
      user,
    },
    200,
    request
  );
}

/**
 * POST /api/admin/demo/edit-session
 * Admin obtains a short-lived demo_edit session token to configure demo data
 */
export async function handleAdminCreateDemoEditSession(request, env) {
  await requireAdmin(request, env);

  let demoUser = await dbGetDemoUser(env);
  if (!demoUser) {
    demoUser = await dbEnsureDemoUser(env);
  }

  const sessionToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const sessionData = {
    token: sessionToken,
    userId: demoUser.id,
    email: demoUser.email,
    name: demoUser.name,
    picture: demoUser.picture || "",
    role: "user",
    createdAt: now,
    kind: "demo_edit",
  };

  await dbSaveSession(env, sessionData, DEMO_EDIT_TTL_SECONDS);

  return jsonResponse(
    {
      success: true,
      message: "نشست ویرایش داده‌های دمو با موفقیت ایجاد شد.",
      token: sessionToken,
      user: {
        id: demoUser.id,
        email: demoUser.email,
        name: demoUser.name,
        customName: demoUser.customName || "",
        picture: demoUser.picture || "",
        role: "user",
        isAdmin: false,
        hasPassword: false,
        emailVerified: true,
      },
      demo: { mode: "edit" },
      demoVaultPassphrase: getDemoVaultPassphrase(env),
    },
    200,
    request
  );
}

/**
 * POST /api/admin/demo/reset
 * Admin resets all data for demo user
 */
export async function handleAdminResetDemo(request, env) {
  await requireAdmin(request, env);
  const success = await dbResetDemoData(env);
  return jsonResponse(
    {
      success,
      message: "تمام داده‌های مالی، پورتفوها و چیدمان حساب دمو با موفقیت بازنشانی شدند.",
    },
    200,
    request
  );
}
