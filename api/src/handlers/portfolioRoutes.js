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
} from "../lib/db.js";
import { jsonResponse, errorResponse } from "../lib/helpers.js";

/**
 * GET /api/portfolios
 * Fetch all portfolios of current authenticated user
 */
export async function handleGetPortfolios(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت دسترسی به پورتفوها، ابتدا وارد حساب کاربری خود شوید.", 401, request);
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
        hasPassword: !!(p.sharePassword && p.sharePassword.trim()),
        sharePassword: p.sharePassword || "",
        itemCount: Number(p.itemCount) || 0,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    }, 200, request);
  } catch (err) {
    console.error("Error in handleGetPortfolios:", err);
    return errorResponse("خطای سرور در دریافت لیست پورتفوها: " + err.message, 500, request);
  }
}

/**
 * POST /api/portfolios
 * Create a new portfolio for current user
 */
export async function handleCreatePortfolio(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت ساخت پورتفو، ابتدا وارد حساب کاربری خود شوید.", 401, request);
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();

    if (!name) {
      return errorResponse("نام پورتفو نمی‌تواند خالی باشد.", 400, request);
    }

    const userId = user.userId || user.id || user.email;
    const created = await dbCreatePortfolio(env, userId, { name });

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
        hasPassword: false,
        sharePassword: "",
        itemCount: 0,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    }, 201, request);
  } catch (err) {
    console.error("Error in handleCreatePortfolio:", err);
    return errorResponse("خطای سرور در ساخت پورتفو: " + err.message, 500, request);
  }
}

/**
 * PUT /api/portfolios
 * Update portfolio name or share settings
 */
export async function handleUpdatePortfolio(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت ویرایش پورتفو، ابتدا وارد حساب کاربری خود شوید.", 401, request);
    }

    const body = await request.json().catch(() => ({}));
    const portfolioId = body.id || body.portfolioId;

    if (!portfolioId) {
      return errorResponse("شناسه پورتفو جهت ویرایش الزامی است.", 400, request);
    }

    const userId = user.userId || user.id || user.email;
    const updated = await dbUpdatePortfolio(env, portfolioId, userId, {
      name: body.name,
      shareSlug: body.shareSlug,
      sharePassword: body.sharePassword,
      shareEnabled: body.shareEnabled,
    });

    if (!updated) {
      return errorResponse("پورتفوی مورد نظر یافت نشد.", 404, request);
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
        hasPassword: !!(updated.sharePassword && updated.sharePassword.trim()),
        sharePassword: updated.sharePassword || "",
        itemCount: Number(updated.itemCount) || 0,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    }, 200, request);
  } catch (err) {
    console.error("Error in handleUpdatePortfolio:", err);
    return errorResponse(err.message || "خطای سرور در ویرایش پورتفو.", 400, request);
  }
}

/**
 * DELETE /api/portfolios
 * Delete a portfolio
 */
export async function handleDeletePortfolioGroup(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت حذف پورتفو، ابتدا وارد حساب کاربری خود شوید.", 401, request);
    }

    const url = new URL(request.url);
    let portfolioId = url.searchParams.get("id") || url.searchParams.get("portfolioId");

    if (!portfolioId) {
      const body = await request.json().catch(() => ({}));
      portfolioId = body.id || body.portfolioId;
    }

    if (!portfolioId) {
      return errorResponse("شناسه پورتفو جهت حذف ارسال نشده است.", 400, request);
    }

    const userId = user.userId || user.id || user.email;
    await dbDeletePortfolio(env, portfolioId, userId);

    return jsonResponse({
      success: true,
      message: "پورتفو و دارایی‌های آن با موفقیت حذف شد.",
      deletedId: portfolioId,
    }, 200, request);
  } catch (err) {
    console.error("Error in handleDeletePortfolioGroup:", err);
    return errorResponse(err.message || "خطای سرور در حذف پورتفو.", 400, request);
  }
}

/**
 * GET /api/portfolio
 * Fetch all assets registered in current user's portfolio (optionally specific portfolioId)
 */
export async function handleGetPortfolio(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت دسترسی به پورتفوی دارایی، ابتدا وارد حساب کاربری خود شوید.", 401, request);
    }

    const url = new URL(request.url);
    const portfolioId = url.searchParams.get("portfolioId") || null;
    const userId = user.userId || user.id || user.email;

    const holdings = await dbGetPortfolioHoldings(env, userId, portfolioId);

    return jsonResponse({
      success: true,
      user: { id: userId, email: user.email, name: user.name },
      portfolioId,
      holdings,
    }, 200, request);
  } catch (err) {
    console.error("Error in handleGetPortfolio:", err);
    return errorResponse("خطای سرور در دریافت اطلاعات پورتفو: " + err.message, 500, request);
  }
}

/**
 * POST /api/portfolio
 * Add a new asset or update an existing holding in a portfolio
 */
export async function handleAddPortfolio(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت ثبت دارایی در پورتفو، ابتدا وارد حساب کاربری خود شوید.", 401, request);
    }

    const body = await request.json().catch(() => ({}));
    const amount = parseFloat(body.amount);
    const rawBuyPrice = body.buyPrice;
    const buyPrice = (rawBuyPrice !== undefined && rawBuyPrice !== null && rawBuyPrice !== '')
      ? parseFloat(rawBuyPrice)
      : 0;

    if (isNaN(amount) || amount <= 0) {
      return errorResponse("مقدار یا وزن دارایی باید یک عدد معتبر و بزرگتر از صفر باشد.", 400, request);
    }

    if (isNaN(buyPrice) || buyPrice < 0) {
      return errorResponse("قیمت خرید واحد در صورت وارد شدن باید یک عدد معتبر و نامنفی باشد.", 400, request);
    }

    const userId = user.userId || user.id || user.email;
    const holdingData = {
      id: body.id || `h_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      userId,
      portfolioId: body.portfolioId || body.portfolio_id || null,
      assetId: String(body.assetId || "gold_18k"),
      assetName: String(body.assetName || "طلا ۱۸ عیار"),
      assetType: String(body.assetType || "gold"),
      unit: String(body.unit || "واحد"),
      amount,
      buyPrice,
      currentPrice: parseFloat(body.currentPrice) || 0,
      buyDate: String(body.buyDate || "").trim(),
      notes: String(body.notes || "").trim(),
      createdAt: body.createdAt || new Date().toISOString(),
    };

    const saved = await dbAddPortfolioHolding(env, holdingData);

    return jsonResponse({
      success: true,
      message: "دارایی با موفقیت در پورتفوی شما ثبت شد.",
      item: saved,
    }, 201, request);
  } catch (err) {
    console.error("Error in handleAddPortfolio:", err);
    return errorResponse("خطای سرور در ثبت دارایی: " + err.message, 500, request);
  }
}

/**
 * DELETE /api/portfolio
 * Delete an asset from user's portfolio
 */
export async function handleDeletePortfolio(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت حذف دارایی، ابتدا وارد حساب کاربری خود شوید.", 401, request);
    }

    const url = new URL(request.url);
    let id = url.searchParams.get("id");

    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return errorResponse("شناسه دارایی جهت حذف ارسال نشده است.", 400, request);
    }

    const userId = user.userId || user.id || user.email;
    await dbDeletePortfolioHolding(env, id, userId);

    return jsonResponse({
      success: true,
      message: "دارایی با موفقیت از پورتفوی شما حذف شد.",
      deletedId: id,
    }, 200, request);
  } catch (err) {
    console.error("Error in handleDeletePortfolio:", err);
    return errorResponse("خطای سرور در حذف دارایی: " + err.message, 500, request);
  }
}

/**
 * GET /api/user/settings
 * Fetch current user settings (custom name, share slug, share enabled, password status)
 */
export async function handleGetUserSettings(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت دسترسی به تنظیمات، ابتدا وارد حساب کاربری خود شوید.", 401, request);
    }

    const userId = user.userId || user.id || user.email;
    const userData = await dbGetUserById(env, userId);

    if (!userData) {
      return errorResponse("اطلاعات کاربر یافت نشد.", 404, request);
    }

    return jsonResponse({
      success: true,
      settings: {
        name: userData.name,
        customName: userData.customName || "",
        shareSlug: userData.shareSlug || "",
        shareEnabled: !!userData.shareEnabled,
        hasPassword: !!(userData.sharePassword && userData.sharePassword.trim()),
        sharePassword: userData.sharePassword || "",
      },
    }, 200, request);
  } catch (err) {
    console.error("Error in handleGetUserSettings:", err);
    return errorResponse("خطای سرور در دریافت تنظیمات کاربر: " + err.message, 500, request);
  }
}

/**
 * POST /api/user/settings
 * Update current user settings
 */
export async function handleUpdateUserSettings(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت تغییر تنظیمات، ابتدا وارد حساب کاربری خود شوید.", 401, request);
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
        sharePassword: updatedUser.sharePassword || "",
      },
    }, 200, request);
  } catch (err) {
    console.error("Error in handleUpdateUserSettings:", err);
    return errorResponse(err.message || "خطای سرور در ذخیره تنظیمات.", 400, request);
  }
}

/**
 * GET or POST /api/portfolio/shared
 * Public endpoint to view a shared portfolio by slug (protected with password if set)
 */
export async function handleGetSharedPortfolio(request, env) {
  try {
    const url = new URL(request.url);
    let slug = url.searchParams.get("slug");
    let password = url.searchParams.get("password") || request.headers.get("X-Portfolio-Password");

    if (request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (body.slug) slug = body.slug;
      if (body.password !== undefined) password = body.password;
    }

    if (!slug) {
      return errorResponse("شناسه پورتفوی اشتراک‌گذاری‌شده ارسال نشده است.", 400, request);
    }

    const targetPortfolio = await dbGetPortfolioByShareSlug(env, slug);
    if (!targetPortfolio || !targetPortfolio.shareEnabled) {
      return errorResponse("پورتفوی مورد نظر یافت نشد یا اشتراک‌گذاری عمومی آن غیرفعال است.", 404, request);
    }

    const ownerName = targetPortfolio.userCustomName || targetPortfolio.userName || "کاربر";
    const portfolioName = targetPortfolio.name || "پورتفوی سرمایه‌گذاری";

    // Check password protection
    if (targetPortfolio.sharePassword && targetPortfolio.sharePassword.trim().length > 0) {
      if (!password || String(password).trim() !== targetPortfolio.sharePassword.trim()) {
        return jsonResponse({
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
          message: password ? "رمز عبور وارد شده نادرست است." : "جهت مشاهده این پورتفو، لطفاً رمز عبور را وارد نمایید.",
        }, 200, request);
      }
    }

    // Password passed or not required: return holdings for this portfolio
    const holdings = await dbGetPortfolioHoldings(env, targetPortfolio.userId, targetPortfolio.id);

    return jsonResponse({
      success: true,
      portfolio: {
        id: targetPortfolio.id,
        name: portfolioName,
        slug: targetPortfolio.shareSlug,
      },
      user: {
        name: ownerName,
        slug: targetPortfolio.shareSlug,
      },
      holdings,
    }, 200, request);
  } catch (err) {
    console.error("Error in handleGetSharedPortfolio:", err);
    return errorResponse("خطای سرور در بارگذاری پورتفوی اشتراکی: " + err.message, 500, request);
  }
}
