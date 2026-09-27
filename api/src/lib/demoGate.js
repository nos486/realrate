/**
 * demoGate.js — Gate enforcing server-side read-only policy for demo visitors
 * and guardrails for admin demo editing sessions.
 *
 * Placed in router right after maintenance gate and before encryption gate.
 */

import { getAuthenticatedUser } from "./auth.js";
import { AppError } from "./AppError.js";
import { dbHasUserVault } from "../repositories/vault.repository.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const DEMO_READ_ONLY_MESSAGE = "این نسخه دمو است و تغییرات ذخیره نمی‌شود.";

/**
 * Enforce demo restrictions for demo sessions
 * @param {Request} request
 * @param {object} env
 * @param {string} normalizedPath
 */
export async function enforceDemoGate(request, env, normalizedPath) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || !user.kind) return;

  const { kind } = user;
  const method = request.method.toUpperCase();

  // ── 1. demo_view: Strictly Read-Only ──────────────────────────────────────
  if (kind === "demo_view") {
    // Demo visitors cannot access any admin routes
    if (normalizedPath.startsWith("/api/admin")) {
      throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
    }

    // Only exception for write methods: logout
    if (WRITE_METHODS.has(method)) {
      if (normalizedPath === "/api/auth/logout" && method === "POST") {
        return;
      }
      throw new AppError(DEMO_READ_ONLY_MESSAGE, 403, "DEMO_READ_ONLY");
    }

    return;
  }

  // ── 2. demo_edit: Admin editing demo data with guardrails ─────────────────
  if (kind === "demo_edit") {
    // Demo sessions cannot access admin endpoints
    if (normalizedPath.startsWith("/api/admin")) {
      throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");
    }

    // Prohibited: Changing vault passphrase (passphrase must stay public/default)
    // Allowed: Creating vault for the first time
    if (normalizedPath === "/api/vault" && method === "PUT") {
      const userId = user.userId || user.id || user.email;
      const hasVault = await dbHasUserVault(env, userId);
      if (hasVault) {
        throw new AppError("تغییر رمز عبور گاوصندوق در حساب دمو مجاز نیست.", 403, "DEMO_EDIT_FORBIDDEN");
      }
    }

    // Prohibited: Account deletion
    if (
      (normalizedPath === "/api/user" ||
        normalizedPath === "/api/auth/me" ||
        normalizedPath.startsWith("/api/auth/account")) &&
      method === "DELETE"
    ) {
      throw new AppError("حذف حساب دمو مجاز نیست.", 403, "DEMO_EDIT_FORBIDDEN");
    }

    // Prohibited: Changing login email or password
    if (
      normalizedPath.startsWith("/api/auth/password") ||
      normalizedPath.startsWith("/api/auth/verify-email")
    ) {
      throw new AppError("تغییر مشخصات ورود یا رمز عبور در حساب دمو مجاز نیست.", 403, "DEMO_EDIT_FORBIDDEN");
    }

    // Prohibited: Sign out of all devices
    if (normalizedPath.includes("signout-all")) {
      throw new AppError("خروج از همه دستگاه‌ها در حساب دمو مجاز نیست.", 403, "DEMO_EDIT_FORBIDDEN");
    }

    // Prohibited: Enabling public portfolio share (share_enabled)
    if (
      (normalizedPath === "/api/portfolios" ||
        normalizedPath === "/api/user/settings" ||
        normalizedPath.startsWith("/api/portfolios/")) &&
      WRITE_METHODS.has(method)
    ) {
      try {
        const cloned = request.clone();
        const body = await cloned.json().catch(() => ({}));
        if (body.shareEnabled === true || body.share_enabled === 1 || body.share_enabled === true) {
          throw new AppError("فعال‌سازی اشتراک عمومی در حساب دمو مجاز نیست.", 403, "DEMO_EDIT_FORBIDDEN");
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
      }
    }
  }
}
