/**
 * portfolioRoutes.js — Handlers for user portfolio asset management
 *
 * Endpoints:
 *   GET    /api/portfolios        — Fetch list of all portfolios for user
 *   POST   /api/portfolios        — Create a new portfolio
 *   PUT    /api/portfolios        — Update portfolio name & share settings
 *   DELETE /api/portfolios?id=... — Delete a portfolio and its holdings
 *
 *   GET    /api/portfolio         — Fetch user's holdings (optionally for a specific portfolio)
 *   POST   /api/portfolio         — Add or update a holding
 *   DELETE /api/portfolio?id=...  — Remove a holding
 *   GET/POST /api/portfolio/shared — Public endpoint for shared portfolios
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUserPortfolios,
  dbGetPortfolioById,
  dbCreatePortfolio,
  dbUpdatePortfolio,
  dbDeletePortfolio,
  dbGetPortfolioByShareSlug,
  dbGetPortfolioHoldings,
  dbAddPortfolioHolding,
  dbDeletePortfolioHolding,
  dbGetUserById,
  dbUpdateUserSettings,
  dbGetTransactionsByPortfolio,
  dbHasUserVault,
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

/** Failed share-password attempts allowed per slug + IP within the window */
const SHARE_PASSWORD_RATE_LIMIT = { limit: 10, windowSec: 15 * 60 };
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";
import {
  resolveAssetDisplayName,
  resolveAssetDisplayWithSource,
  resolveAssetUnit,
  resolveCategory,
} from "../config/sourceRegistry.js";

function resolveHoldingMetadata(holding) {
  if (!holding) return holding;
  const isEncrypted = typeof holding.notes === 'string' && holding.notes.startsWith('enc:e2ee:v1:');
  const assetName = isEncrypted ? (holding.assetName || holding.assetId) : (resolveAssetDisplayWithSource(holding.assetId, holding) || holding.assetId);
  const unit = isEncrypted ? (holding.unit || 'واحد') : (resolveAssetUnit(holding.assetId, holding) || 'واحد');
  const category = isEncrypted ? (holding.assetType || 'custom') : resolveCategory(holding.assetId, holding.assetType);
  return {
    ...holding,
    assetName,
    assetType: category,
    category,
    unit,
    canonicalName: assetName,
    canonicalUnit: unit,
    canonicalCategory: category,
    resolvedCategory: category,
  };
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

  const userId = user.userId || user.id || user.email;
  const portfolios = await dbGetUserPortfolios(env, userId);

  return jsonResponse({
    success: true,
    portfolios: portfolios.map((p) => ({
      id: p.id,
      userId: p.userId,
      name: p.name,
      isDefault: !!p.isDefault,
      shareSlug: p.shareSlug || "",
      shareEnabled: !!p.shareEnabled,
      isE2ee: !!p.isE2ee,
      e2eeSalt: p.e2eeSalt || "",
      e2eeVerifier: p.e2eeVerifier || "",
      e2eeWrappedKey: p.e2eeWrappedKey || "",
      hasPassword: !!(p.sharePassword && p.sharePassword.trim()),
      itemCount: Number(p.itemCount) || 0,
      transactionCount: Number(p.transactionCount) || 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  }, 200, request);
}

/**
 * POST /api/portfolios
 * Create a new portfolio for current user
 */
export async function handleCreatePortfolio(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت ساخت پورتفو، ابتدا وارد حساب کاربری خود شوید.");
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();

  if (!name) {
    throw AppError.badRequest("نام پورتفو نمی‌تواند خالی باشد.");
  }

  const userId = user.userId || user.id || user.email;
  // With account-wide encryption on, every new portfolio must arrive with its own data key
  // (wrapped by the account key) so nothing is ever stored in plaintext.
  const e2eeWrappedKey = isCipherText(body.e2eeWrappedKey) ? body.e2eeWrappedKey : "";
  if (!e2eeWrappedKey && (await dbHasUserVault(env, userId))) {
    throw new AppError("رمزنگاری سرتاسری حساب فعال است؛ پورتفوی جدید باید رمزنگاری‌شده ساخته شود. صفحه را تازه کنید.", 409, "VAULT_ENABLED");
  }
  const created = await dbCreatePortfolio(env, userId, {
    name,
    isE2ee: Boolean(e2eeWrappedKey),
    e2eeWrappedKey,
  });

  return jsonResponse({
    success: true,
    message: `پورتفوی «${created.name}» با موفقیت ساخته شد.`,
    portfolio: {
      id: created.id,
      userId: created.userId,
      name: created.name,
      isDefault: !!created.isDefault,
      shareSlug: created.shareSlug || "",
      shareEnabled: !!created.shareEnabled,
      isE2ee: !!created.isE2ee,
      e2eeSalt: "",
      e2eeVerifier: "",
      e2eeWrappedKey: created.e2eeWrappedKey || "",
      hasPassword: false,
      itemCount: 0,
      transactionCount: 0,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
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

  const body = await request.json().catch(() => ({}));
  const portfolioId = body.id || body.portfolioId;

  if (!portfolioId) {
    throw AppError.badRequest("شناسه پورتفو جهت ویرایش الزامی است.");
  }

  const userId = user.userId || user.id || user.email;
  const updated = await dbUpdatePortfolio(env, portfolioId, userId, {
    name: body.name,
    shareSlug: body.shareSlug,
    sharePassword: body.sharePassword,
    shareEnabled: body.shareEnabled,
    isDefault: body.isDefault !== undefined ? !!body.isDefault : undefined,
    isE2ee: body.isE2ee !== undefined ? !!body.isE2ee : undefined,
    e2eeSalt: body.e2eeSalt,
    e2eeVerifier: body.e2eeVerifier,
    e2eeWrappedKey: body.e2eeWrappedKey,
  });

  if (!updated) {
    throw AppError.notFound("پورتفوی مورد نظر یافت نشد.");
  }

  return jsonResponse({
    success: true,
    message: "تنظیمات پورتفو با موفقیت به‌روزرسانی شد.",
    portfolio: {
      id: updated.id,
      userId: updated.userId,
      name: updated.name,
      isDefault: !!updated.isDefault,
      shareSlug: updated.shareSlug || "",
      shareEnabled: !!updated.shareEnabled,
      isE2ee: !!updated.isE2ee,
      e2eeSalt: updated.e2eeSalt || "",
      e2eeVerifier: updated.e2eeVerifier || "",
      e2eeWrappedKey: updated.e2eeWrappedKey || "",
      hasPassword: !!(updated.sharePassword && updated.sharePassword.trim()),
      itemCount: Number(updated.itemCount) || 0,
      transactionCount: Number(updated.transactionCount) || 0,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    },
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
 * GET /api/portfolio
 * Fetch all assets registered in current user's portfolio (optionally specific portfolioId)
 */
export async function handleGetPortfolio(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت دسترسی به پورتفوی دارایی، ابتدا وارد حساب کاربری خود شوید.");
  }

  const url = new URL(request.url);
  let portfolioId = url.searchParams.get("portfolioId");
  if (!portfolioId || portfolioId === "null" || portfolioId === "undefined" || portfolioId === "[object Object]" || !portfolioId.trim()) {
    portfolioId = null;
  } else {
    portfolioId = portfolioId.trim();
  }
  const userId = user.userId || user.id || user.email;

  const holdings = await dbGetPortfolioHoldings(env, userId, portfolioId);

  return jsonResponse({
    success: true,
    user: { id: userId, email: user.email, name: user.name },
    portfolioId,
    holdings: holdings.map(resolveHoldingMetadata),
  }, 200, request);
}

/**
 * POST /api/portfolio
 * Add a new asset or update an existing holding in a portfolio
 */
export async function handleAddPortfolio(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت ثبت دارایی در پورتفو، ابتدا وارد حساب کاربری خود شوید.");
  }

  const body = await request.json().catch(() => ({}));
  const isE2eeHolding = typeof body.notes === 'string' && body.notes.startsWith('enc:e2ee:v1:');
  const amount = parseFloat(body.amount);
  const rawBuyPrice = body.buyPrice;
  const buyPrice = (rawBuyPrice !== undefined && rawBuyPrice !== null && rawBuyPrice !== '')
    ? parseFloat(rawBuyPrice)
    : 0;

  if (!isE2eeHolding && (isNaN(amount) || amount <= 0)) {
    throw AppError.badRequest("مقدار یا وزن دارایی باید یک عدد معتبر و بزرگتر از صفر باشد.");
  }

  if (!isE2eeHolding && (isNaN(buyPrice) || buyPrice < 0)) {
    throw AppError.badRequest("قیمت خرید واحد در صورت وارد شدن باید یک عدد معتبر و نامنفی باشد.");
  }

  const userId = user.userId || user.id || user.email;
  const targetPortfolioId = body.portfolioId || body.portfolio_id || null;
  let targetPortfolio = null;
  if (targetPortfolioId) {
    targetPortfolio = await dbGetPortfolioById(env, targetPortfolioId, userId);
    if (!targetPortfolio) {
      throw AppError.notFound("پورتفوی مورد نظر یافت نشد یا شما به آن دسترسی ندارید.");
    }
  } else {
    const pList = await dbGetUserPortfolios(env, userId);
    targetPortfolio = pList?.find((p) => p.isDefault) || pList?.[0] || null;
  }

  if (targetPortfolio?.isE2ee && !isE2eeHolding) {
    throw AppError.badRequest("این پورتفو دارای رمزنگاری مبدا به مقصد (E2EE) است. دارایی باید به صورت رمزنگاری‌شده ثبت شود.");
  }

  const holdingData = {
    id: body.id || `h_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
    userId,
    portfolioId: targetPortfolio?.id || targetPortfolioId,
    assetId: String(body.assetId || "gold_18k"),
    amount: isNaN(amount) ? 0 : amount,
    buyPrice: isNaN(buyPrice) ? 0 : buyPrice,
    currentPrice: parseFloat(body.currentPrice) || 0,
    buyDate: String(body.buyDate || "").trim(),
    notes: String(body.notes || "").trim(),
    referenceAssetId: String(body.referenceAssetId || "").trim(),
    referenceQuantity: parseFloat(body.referenceQuantity) || 0,
    createdAt: body.createdAt || new Date().toISOString(),
  };

  const saved = await dbAddPortfolioHolding(env, holdingData);

  return jsonResponse({
    success: true,
    message: "دارایی با موفقیت در پورتفوی شما ثبت شد.",
    item: resolveHoldingMetadata(saved),
  }, 201, request);
}

/**
 * DELETE /api/portfolio
 * Delete an asset from user's portfolio
 */
export async function handleDeletePortfolio(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت حذف دارایی، ابتدا وارد حساب کاربری خود شوید.");
  }

  const url = new URL(request.url);
  let id = url.searchParams.get("id");

  if (!id) {
    const body = await request.json().catch(() => ({}));
    id = body.id;
  }

  if (!id) {
    throw AppError.badRequest("شناسه دارایی جهت حذف ارسال نشده است.");
  }

  const userId = user.userId || user.id || user.email;
  await dbDeletePortfolioHolding(env, id, userId);

  return jsonResponse({
    success: true,
    message: "دارایی با موفقیت از پورتفوی شما حذف شد.",
    deletedId: id,
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
    const lockedResponse = (message) => jsonResponse({
      success: false,
      requirePassword: true,
      portfolio: {
        id: targetPortfolio.id,
        name: portfolioName,
        slug: targetPortfolio.shareSlug,
      },
      user: {
        name: ownerName,
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
        // Only a real portfolio row owning this slug — not the legacy users-table fallback
        const ownRow = await dbGetPortfolioById(env, targetPortfolio.id, targetPortfolio.userId);
        if (ownRow && String(ownRow.shareSlug || "").toLowerCase() === String(targetPortfolio.shareSlug).toLowerCase()) {
          await dbUpdatePortfolio(env, targetPortfolio.id, targetPortfolio.userId, { sharePassword: hashed });
        }
      } catch (e) {
        logger.warn("Could not upgrade legacy share password hash:", { error: e.message });
      }
    }
  }

  const [holdings, transactions] = await Promise.all([
    dbGetPortfolioHoldings(env, targetPortfolio.userId, targetPortfolio.id),
    dbGetTransactionsByPortfolio(env, targetPortfolio.userId, targetPortfolio.id),
  ]);

  return jsonResponse({
    success: true,
    portfolio: {
      id: targetPortfolio.id,
      name: portfolioName,
      slug: targetPortfolio.shareSlug,
      isE2ee: !!targetPortfolio.isE2ee,
      e2eeSalt: targetPortfolio.e2eeSalt || "",
      e2eeVerifier: targetPortfolio.e2eeVerifier || "",
      // Protected by the owner's account key: the viewer needs the portfolio key carried in the
      // share link's #fragment (never sent to the server)
      e2eeLinkKey: Boolean(targetPortfolio.e2eeWrappedKey),
    },
    user: {
      name: ownerName,
      slug: targetPortfolio.shareSlug,
    },
    holdings: holdings.map(resolveHoldingMetadata),
    transactions,
  }, 200, request);
}
