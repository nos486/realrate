/**
 * portfolioRoutes.js — Handlers for the user's portfolios and their share settings
 *
 * Endpoints:
 *   GET    /api/portfolios        — Fetch list of all portfolios for user
 *   POST   /api/portfolios        — Create a portfolio (with its data key, wrapped by the account key)
 *   PUT    /api/portfolios        — Update portfolio name & share settings
 *   DELETE /api/portfolios?id=... — Delete a portfolio and its items
 *   GET/POST /api/user/settings   — The user's display name and share defaults
 *   GET/POST /api/portfolio/shared — Public endpoint for shared portfolios
 *
 * A portfolio's items are encrypted vault records (vault.repository.js); a shared portfolio's
 * records are decrypted in the viewer's browser with the key the share link carries.
 */

import { enforcePortfolioLimit } from "../lib/planLimits.js";
import { getAuthenticatedUser } from "../lib/auth.js";
import { hasFeature } from "../lib/features.js";
import {
  dbGetUserPortfolios,
  dbGetPortfolioById,
  dbCreatePortfolio,
  dbUpdatePortfolio,
  dbDeletePortfolio,
  dbGetPortfolioByShareSlug,
  dbGetUserById,
  dbUpdateUserSettings,
  dbListVaultRecords,
  isCipherText,
} from "../repositories/index.js";
import { jsonResponse, getClientIp } from "../lib/helpers.js";
import {
  verifySharePassword,
  hashSharePassword,
  isHashedSharePassword,
  getRateLimitState,
  recordRateLimitHit,
  clearRateLimit,
} from "../lib/security.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

/** Failed share-password attempts allowed per slug + IP within the window */
const SHARE_PASSWORD_RATE_LIMIT = { limit: 10, windowSec: 15 * 60 };

/** A portfolio as the API returns it (the share password only as whether there is one) */
function portfolioJson(p) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    isDefault: !!p.isDefault,
    shareSlug: p.shareSlug || "",
    shareEnabled: !!p.shareEnabled,
    e2eeWrappedKey: p.e2eeWrappedKey || "",
    hasPassword: !!(p.sharePassword && p.sharePassword.trim()),
    itemCount: Number(p.itemCount) || 0,
    transactionCount: Number(p.transactionCount) || 0,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** The portfolio section is a feature (config/features.js `portfolio`): hidden like it when closed to the user */
async function requirePortfolioFeature(env, user) {
  if (!(await hasFeature(env, user, "portfolio"))) throw AppError.notFound("یافت نشد.");
}

/**
 * GET /api/portfolios
 * Fetch all portfolios of current authenticated user
 */
export async function handleGetPortfolios(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت دسترسی به پورتفوها، ابتدا وارد حساب کاربری خود شوید.");
  }
  await requirePortfolioFeature(env, user);
  const userId = user.userId || user.id || user.email;
  const portfolios = await dbGetUserPortfolios(env, userId);
  return jsonResponse({ success: true, portfolios: portfolios.map(portfolioJson) }, 200, request);
}

/**
 * POST /api/portfolios
 * Create a portfolio; it must arrive with its own data key wrapped by the account key, so
 * nothing of it is ever stored in plaintext. The user's first portfolio is their default.
 */
export async function handleCreatePortfolio(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت ساخت پورتفو، ابتدا وارد حساب کاربری خود شوید.");
  }
  await requirePortfolioFeature(env, user);

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) {
    throw AppError.badRequest("نام پورتفو نمی‌تواند خالی باشد.");
  }
  if (!isCipherText(body.e2eeWrappedKey)) {
    throw new AppError("پورتفوی جدید باید رمزنگاری‌شده ساخته شود. صفحه را تازه کنید.", 409, "VAULT_ENABLED");
  }
  await enforcePortfolioLimit(env, user);

  const userId = user.userId || user.id || user.email;
  const created = await dbCreatePortfolio(env, userId, { name, e2eeWrappedKey: body.e2eeWrappedKey });

  return jsonResponse({
    success: true,
    message: `پورتفوی «${created.name}» با موفقیت ساخته شد.`,
    portfolio: portfolioJson(created),
  }, 201, request);
}

/**
 * PUT /api/portfolios
 * Update portfolio name or share settings
 */
export async function handleUpdatePortfolio(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت ویرایش پورتفو، ابتدا وارد حساب کاربری خود شوید.");
  }
  await requirePortfolioFeature(env, user);

  const body = await request.json().catch(() => ({}));
  const portfolioId = body.id || body.portfolioId;
  if (!portfolioId) {
    throw AppError.badRequest("شناسه پورتفو جهت ویرایش الزامی است.");
  }

  // Encryption is mandatory: a portfolio's key can be replaced, never cleared
  if (body.e2eeWrappedKey !== undefined && !isCipherText(body.e2eeWrappedKey)) {
    throw new AppError("رمزنگاری سرتاسری اجباری است؛ پورتفو نمی‌تواند بدون رمز شود.", 403, "ENCRYPTION_MANDATORY");
  }
  const userId = user.userId || user.id || user.email;
  const updated = await dbUpdatePortfolio(env, portfolioId, userId, {
    name: body.name,
    shareSlug: body.shareSlug,
    sharePassword: body.sharePassword,
    shareEnabled: body.shareEnabled,
    isDefault: body.isDefault !== undefined ? !!body.isDefault : undefined,
    e2eeWrappedKey: body.e2eeWrappedKey,
  });
  if (!updated) {
    throw AppError.notFound("پورتفوی مورد نظر یافت نشد.");
  }

  return jsonResponse({
    success: true,
    message: "تنظیمات پورتفو با موفقیت به‌روزرسانی شد.",
    portfolio: portfolioJson(updated),
  }, 200, request);
}

/**
 * DELETE /api/portfolios
 * Delete a portfolio
 */
export async function handleDeletePortfolioGroup(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت حذف پورتفو، ابتدا وارد حساب کاربری خود شوید.");
  }
  await requirePortfolioFeature(env, user);

  const url = new URL(request.url);
  let portfolioId = url.searchParams.get("id") || url.searchParams.get("portfolioId");
  if (!portfolioId) {
    const body = await request.json().catch(() => ({}));
    portfolioId = body.id || body.portfolioId;
  }
  if (!portfolioId) {
    throw AppError.badRequest("شناسه پورتفو جهت حذف ارسال نشده است.");
  }

  const userId = user.userId || user.id || user.email;
  await dbDeletePortfolio(env, portfolioId, userId);

  return jsonResponse({
    success: true,
    message: "پورتفو و دارایی‌های آن با موفقیت حذف شد.",
    deletedId: portfolioId,
  }, 200, request);
}

/**
 * GET /api/user/settings
 * Fetch current user settings (custom name, share slug, share enabled, password status)
 */
export async function handleGetUserSettings(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت دسترسی به تنظیمات، ابتدا وارد حساب کاربری خود شوید.");
  }

  const userId = user.userId || user.id || user.email;
  const userData = await dbGetUserById(env, userId);
  if (!userData) {
    throw AppError.notFound("اطلاعات کاربر یافت نشد.");
  }

  return jsonResponse({
    success: true,
    settings: {
      name: userData.name,
      customName: userData.customName || "",
      shareSlug: userData.shareSlug || "",
      shareEnabled: !!userData.shareEnabled,
      hasPassword: !!(userData.sharePassword && userData.sharePassword.trim()),
    },
  }, 200, request);
}

/**
 * POST /api/user/settings
 * Update current user settings
 */
export async function handleUpdateUserSettings(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت تغییر تنظیمات، ابتدا وارد حساب کاربری خود شوید.");
  }

  const body = await request.json().catch(() => ({}));
  const userId = user.userId || user.id || user.email;
  const updatedUser = await dbUpdateUserSettings(env, userId, {
    customName: body.customName,
    shareSlug: body.shareSlug,
    sharePassword: body.sharePassword,
    shareEnabled: body.shareEnabled,
  });

  return jsonResponse({
    success: true,
    message: "تنظیمات کاربری و اشتراک‌گذاری با موفقیت ذخیره شد.",
    settings: {
      name: updatedUser.name,
      customName: updatedUser.customName || "",
      shareSlug: updatedUser.shareSlug || "",
      shareEnabled: !!updatedUser.shareEnabled,
      hasPassword: !!(updatedUser.sharePassword && updatedUser.sharePassword.trim()),
    },
  }, 200, request);
}

/**
 * GET or POST /api/portfolio/shared
 * Public endpoint to view a shared portfolio by slug (protected with password if set)
 */
export async function handleGetSharedPortfolio(request, env) {
  const url = new URL(request.url);
  let slug = url.searchParams.get("slug");
  // The password is only accepted in a POST body — never in the query string, which ends up
  // in logs, browser history and Referer headers.
  let password = "";

  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (body.slug) slug = body.slug;
    if (body.password !== undefined && body.password !== null) password = String(body.password);
  }

  if (!slug) {
    throw AppError.badRequest("شناسه پورتفوی اشتراک‌گذاری‌شده ارسال نشده است.");
  }

  const targetPortfolio = await dbGetPortfolioByShareSlug(env, slug);
  if (!targetPortfolio || !targetPortfolio.shareEnabled) {
    throw AppError.notFound("پورتفوی مورد نظر یافت نشد یا اشتراک‌گذاری عمومی آن غیرفعال است.");
  }

  const ownerName = targetPortfolio.userCustomName || targetPortfolio.userName || "کاربر";
  const portfolioName = targetPortfolio.name || "پورتفوی سرمایه‌گذاری";
  const storedPassword = String(targetPortfolio.sharePassword || "").trim();

  if (storedPassword) {
    // Before the password nothing about the owner or the portfolio is told, not even names
    const lockedResponse = (message) => jsonResponse({
      success: false,
      requirePassword: true,
      portfolio: {
        id: targetPortfolio.id,
        slug: targetPortfolio.shareSlug,
      },
      user: {
        slug: targetPortfolio.shareSlug,
      },
      message,
    }, 200, request);

    if (!password.trim()) {
      return lockedResponse("جهت مشاهده این پورتفو، لطفاً رمز عبور را وارد نمایید.");
    }

    const rateKey = `share:${String(targetPortfolio.shareSlug || slug).toLowerCase()}:${getClientIp(request)}`;
    const { limited } = await getRateLimitState(env, rateKey, SHARE_PASSWORD_RATE_LIMIT);
    if (limited) {
      throw new AppError("تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.", 429, "TOO_MANY_REQUESTS");
    }

    const valid = await verifySharePassword(password, storedPassword);
    if (!valid) {
      await recordRateLimitHit(env, rateKey, SHARE_PASSWORD_RATE_LIMIT);
      return lockedResponse("رمز عبور وارد شده نادرست است.");
    }

    await clearRateLimit(env, rateKey);

    // Lazily replace a legacy plaintext password with its hash
    if (!isHashedSharePassword(storedPassword) && targetPortfolio.shareSlug) {
      try {
        const hashed = await hashSharePassword(password);
        // Only the portfolio row owning this slug
        const ownRow = await dbGetPortfolioById(env, targetPortfolio.id, targetPortfolio.userId);
        if (ownRow && String(ownRow.shareSlug || "").toLowerCase() === String(targetPortfolio.shareSlug).toLowerCase()) {
          await dbUpdatePortfolio(env, targetPortfolio.id, targetPortfolio.userId, { sharePassword: hashed });
        }
      } catch (e) {
        logger.warn("Could not upgrade legacy share password hash:", { error: e.message });
      }
    }
  }

  // Its items are encrypted vault records: the portfolio key, carried in the share link's
  // #fragment (never sent to the server), decrypts them in the viewer's browser
  const [vaultHoldings, vaultTransactions, vaultLayout] = await Promise.all([
    dbListVaultRecords(env, targetPortfolio.userId, "holding", { parentId: targetPortfolio.id }),
    dbListVaultRecords(env, targetPortfolio.userId, "transaction", { parentId: targetPortfolio.id }),
    dbListVaultRecords(env, targetPortfolio.userId, "portfolio_layout", { parentId: targetPortfolio.id }),
  ]);
  const publicRecord = ({ id, payload, recordDate, createdAt, updatedAt }) => ({ id, payload, recordDate, createdAt, updatedAt });

  return jsonResponse({
    success: true,
    portfolio: {
      id: targetPortfolio.id,
      name: portfolioName,
      slug: targetPortfolio.shareSlug,
      e2eeLinkKey: true,
    },
    user: {
      name: ownerName,
      slug: targetPortfolio.shareSlug,
    },
    vaultHoldings: vaultHoldings.map(publicRecord),
    vaultTransactions: vaultTransactions.map(publicRecord),
    vaultLayout: vaultLayout.map(publicRecord),
  }, 200, request);
}
