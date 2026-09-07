/**
 * portfolioRoutes.js — Handlers for user portfolio asset management
 *
 * Endpoints:
 *   GET    /api/portfolio         — Fetch user's holdings from D1/KV
 *   POST   /api/portfolio         — Add or update a holding
 *   DELETE /api/portfolio?id=...  — Remove a holding
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetPortfolioHoldings,
  dbAddPortfolioHolding,
  dbDeletePortfolioHolding,
  dbGetUserById,
  dbGetUserByShareSlug,
  dbUpdateUserSettings,
} from "../lib/db.js";
import { jsonResponse, errorResponse } from "../lib/helpers.js";

/**
 * GET /api/portfolio
 * Fetch all assets registered in current user's portfolio
 */
export async function handleGetPortfolio(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت دسترسی به پورتفوی دارایی، ابتدا وارد حساب کاربری خود شوید.", 401, request);
    }

    const userId = user.userId || user.id || user.email;
    const holdings = await dbGetPortfolioHoldings(env, userId);

    return jsonResponse({
      success: true,
      user: { id: userId, email: user.email, name: user.name },
      holdings,
    }, 200, request);
  } catch (err) {
    console.error("Error in handleGetPortfolio:", err);
    return errorResponse("خطای سرور در دریافت اطلاعات پورتفو: " + err.message, 500, request);
  }
}

/**
 * POST /api/portfolio
 * Add a new asset or update an existing holding
 */
export async function handleAddPortfolio(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) {
      return errorResponse("جهت ثبت دارایی در پورتفو، ابتدا وارد حساب کاربری خود شوید.", 401, request);
    }

    const body = await request.json().catch(() => ({}));
    const amount = parseFloat(body.amount);
    const buyPrice = parseFloat(body.buyPrice);

    if (isNaN(amount) || amount <= 0) {
      return errorResponse("مقدار یا وزن دارایی باید یک عدد معتبر و بزرگتر از صفر باشد.", 400, request);
    }

    if (isNaN(buyPrice) || buyPrice <= 0) {
      return errorResponse("قیمت خرید واحد باید معتبر و بزرگتر از صفر باشد.", 400, request);
    }

    const userId = user.userId || user.id || user.email;
    const holdingData = {
      id: body.id || `h_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      userId,
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
      // Try body if not in query param
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
 * Update current user settings (custom name, share slug, share password, share enabled)
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

    const targetUser = await dbGetUserByShareSlug(env, slug);
    if (!targetUser || !targetUser.shareEnabled) {
      return errorResponse("پورتفوی مورد نظر یافت نشد یا اشتراک‌گذاری عمومی آن غیرفعال است.", 404, request);
    }

    // Check password protection
    if (targetUser.sharePassword && targetUser.sharePassword.trim().length > 0) {
      if (!password || String(password).trim() !== targetUser.sharePassword.trim()) {
        return jsonResponse({
          success: false,
          requirePassword: true,
          user: {
            name: targetUser.customName || targetUser.name || "کاربر",
            slug: targetUser.shareSlug,
          },
          message: password ? "رمز عبور وارد شده نادرست است." : "جهت مشاهده این پورتفو، لطفاً رمز عبور را وارد نمایید.",
        }, 200, request);
      }
    }

    // Password passed or not required: return holdings
    const holdings = await dbGetPortfolioHoldings(env, targetUser.id);

    return jsonResponse({
      success: true,
      user: {
        name: targetUser.customName || targetUser.name || "کاربر",
        slug: targetUser.shareSlug,
      },
      holdings,
    }, 200, request);
  } catch (err) {
    console.error("Error in handleGetSharedPortfolio:", err);
    return errorResponse("خطای سرور در بارگذاری پورتفوی اشتراکی: " + err.message, 500, request);
  }
}
