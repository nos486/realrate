/**
 * portfolioRoutes.js — Handlers for user portfolio asset management
 *
 * Endpoints:
 *   GET    /api/portfolio         — Fetch user's holdings from D1/KV
 *   POST   /api/portfolio         — Add or update a holding
 *   DELETE /api/portfolio?id=...  — Remove a holding
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { dbGetPortfolioHoldings, dbAddPortfolioHolding, dbDeletePortfolioHolding } from "../lib/db.js";
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
