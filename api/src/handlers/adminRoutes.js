/**
 * adminRoutes.js — Protected admin API route handlers
 * All routes require admin role verified via session
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUsers,
  dbGetUserById,
  dbGetPortfolioHoldings,
  dbGetUserPortfolios,
  dbGetPriceSources,
  dbSavePriceSource,
  dbDeletePriceSource,
  dbSetPrimaryPriceSource,
  dbUpdateSourceLastPrice,
  dbRecordPriceHistory,
  dbGetPriceHistory,
} from "../lib/db.js";
import { getAdminStats } from "../lib/analytics.js";
import { saveGlobalSettings } from "../lib/settings.js";
import { testUsdSource } from "../services/telegramPrices.js";
import { testPriceSourceConfig, fetchAllPrices } from "../services/priceSources.js";
import { jsonResponse, errorResponse, forbiddenResponse } from "../lib/helpers.js";

/**
 * GET /api/admin/stats
 * Return site analytics stats — admin only
 */
export async function handleAdminStatsRoute(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  const stats = await getAdminStats(env);
  return jsonResponse(stats, 200, request);
}

/**
 * GET /api/admin/users
 * Return all registered users from D1/KV — admin only
 */
export async function handleAdminUsersRoute(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  const users = await dbGetUsers(env);
  return jsonResponse({ success: true, users }, 200, request);
}

/**
 * GET /api/admin/users/portfolio?userId=...&portfolioId=...
 * Return specific user's portfolios and holdings for inspection — admin only
 */
export async function handleAdminGetUserPortfolio(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");
  const portfolioId = url.searchParams.get("portfolioId") || null;

  if (!targetUserId) {
    return errorResponse("شناسه کاربر الزامی است.", 400, request);
  }

  const targetUser = await dbGetUserById(env, targetUserId);
  if (!targetUser) {
    return errorResponse("کاربر مورد نظر یافت نشد.", 404, request);
  }

  const portfolios = await dbGetUserPortfolios(env, targetUser.id);
  const holdings = await dbGetPortfolioHoldings(env, targetUser.id, portfolioId);

  return jsonResponse({
    success: true,
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      customName: targetUser.customName || "",
      picture: targetUser.picture,
      shareSlug: targetUser.shareSlug || "",
      shareEnabled: !!targetUser.shareEnabled,
      createdAt: targetUser.createdAt,
      lastLogin: targetUser.lastLogin,
    },
    portfolios,
    portfolioId,
    holdings,
  }, 200, request);
}

/**
 * POST /api/admin/settings
 * Save global settings to D1 + KV — admin only
 */
export async function handleAdminSaveSettings(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const body = await request.json();
    const newSettings = {
      default_usd_toman:    parseFloat(body.default_usd_toman) || 62000,
      default_gold_usd:     parseFloat(body.default_gold_usd)  || 2450,
      bubble_pct_full:      parseFloat(body.bubble_pct_full)   >= 0 ? parseFloat(body.bubble_pct_full)   : 15,
      bubble_pct_half:      parseFloat(body.bubble_pct_half)   >= 0 ? parseFloat(body.bubble_pct_half)   : 20,
      bubble_pct_quarter:   parseFloat(body.bubble_pct_quarter) >= 0 ? parseFloat(body.bubble_pct_quarter) : 25,
      announcement:         (body.announcement || "").trim(),
      usd_source_type:      body.usd_source_type === "api_url" ? "api_url" : "telegram",
      usd_telegram_channel: (body.usd_telegram_channel || "tahran_sabza").trim(),
      usd_api_url:          (body.usd_api_url || "").trim(),
      usd_api_json_path:    (body.usd_api_json_path || "").trim(),
    };

    await saveGlobalSettings(env, newSettings);

    return jsonResponse({ success: true, message: "تنظیمات عمومی با موفقیت ذخیره شد.", settings: newSettings }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}

/**
 * POST /api/admin/test-usd-source
 * Test USD price source (Telegram or external API) without saving — admin only
 */
export async function handleAdminTestUsdSource(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const body = await request.json();
    const testResult = await testUsdSource(body);
    return jsonResponse(testResult, testResult.success ? 200 : 400, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}

/**
 * GET /api/admin/price-sources
 * List all configured price sources — admin only
 */
export async function handleAdminGetPriceSources(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const sources = await dbGetPriceSources(env);
    return jsonResponse({ success: true, sources }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}

/**
 * POST /api/admin/price-sources
 * Create or update a price source — admin only
 */
export async function handleAdminSavePriceSource(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const body = await request.json();
    const saved = await dbSavePriceSource(env, body);
    return jsonResponse({
      success: true,
      message: "سورس قیمت با موفقیت ذخیره شد.",
      source: saved,
    }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 400, request);
  }
}

/**
 * DELETE /api/admin/price-sources
 * Delete a price source by ID (?id=...) — admin only
 */
export async function handleAdminDeletePriceSource(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const url = new URL(request.url);
    let id = url.searchParams.get("id");
    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return errorResponse("شناسه سورس الزامی است.", 400, request);
    }

    const success = await dbDeletePriceSource(env, id);
    if (!success) {
      return errorResponse("سورس یافت نشد یا حذف ناموفق بود.", 404, request);
    }

    return jsonResponse({ success: true, message: "سورس قیمت با موفقیت حذف شد." }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}

/**
 * POST /api/admin/price-sources/set-primary
 * Set a price source as primary for its price type — admin only
 */
export async function handleAdminSetPrimarySource(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const body = await request.json();
    const { id, priceType } = body;
    if (!id) return errorResponse("شناسه سورس الزامی است.", 400, request);

    const updated = await dbSetPrimaryPriceSource(env, id, priceType);
    return jsonResponse({
      success: true,
      message: "سورس مرجع با موفقیت تعیین شد.",
      source: updated,
    }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 400, request);
  }
}

/**
 * POST /api/admin/price-sources/test
 * Test a price source config without saving — admin only.
 * If body.id is provided and test succeeds, updates last_price and records price history.
 */
export async function handleAdminTestPriceSource(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const body = await request.json();
    const testResult = await testPriceSourceConfig(body);

    if (testResult.success && body.id && testResult.price) {
      const nowIso = testResult.datetime || new Date().toISOString();
      await dbUpdateSourceLastPrice(env, body.id, testResult.price, nowIso);
      await dbRecordPriceHistory(env, {
        sourceId: body.id,
        priceType: body.price_type || body.priceType || 'usd_toman',
        sourceName: body.name || '',
        price: testResult.price,
        timestamp: nowIso,
      });
      testResult.saved = true;
    }

    return jsonResponse(testResult, testResult.success ? 200 : 400, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}

/**
 * POST /api/admin/price-sources/fetch-all
 * Force refresh all active price sources, update last_price and record history — admin only
 */
export async function handleAdminFetchAllSources(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const prices = await fetchAllPrices(env, true);
    const updatedSources = await dbGetPriceSources(env);
    return jsonResponse({
      success: true,
      message: "تمامی سورس‌های فعال با موفقیت فراخوانی و بروز شدند.",
      prices,
      sources: updatedSources,
    }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}

/**
 * GET /api/admin/price-history
 * Query historical prices for graphing — admin only
 * Params: sourceId, priceType, range ('24h', '7d', '30d', '1y', 'all'), limit
 */
export async function handleAdminGetPriceHistory(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const url = new URL(request.url);
    const sourceId = url.searchParams.get("sourceId") || null;
    const priceType = url.searchParams.get("priceType") || null;
    const range = url.searchParams.get("range") || "24h";
    const limit = url.searchParams.get("limit") || 200;

    const history = await dbGetPriceHistory(env, { sourceId, priceType, range, limit });
    return jsonResponse({ success: true, history }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 500, request);
  }
}


