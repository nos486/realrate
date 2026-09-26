/**
 * adminRoutes.js — Protected admin API route handlers
 * All routes require admin role verified via session
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUsersPage,
  USER_SORTS,
  USER_FILTERS,
  dbGetUserById,
  dbGetPortfolioHoldings,
  dbGetUserPortfolios,
  dbGetPriceSources,
  dbSavePriceSource,
  dbDeletePriceSource,
  dbSetPrimaryPriceSource,
  dbStoreTestedSourceItems,
  saveGlobalSettings,
  getGlobalSettings,
} from "../repositories/index.js";
import { getAdminStats } from "../lib/analytics.js";
import { testPriceSourceConfig, fetchAllPrices, inspectApiEndpointStructure, refreshPriceBook } from "../services/market/priceAggregator.service.js";
import { jsonResponse, errorResponse, forbiddenResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

/**
 * GET /api/admin/stats
 * Return site analytics stats — admin only
 */
export async function handleAdminStatsRoute(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");

  const stats = await getAdminStats(env);
  return jsonResponse(stats, 200, request);
}

const USERS_PAGE_SIZE_DEFAULT = 10;
const USERS_PAGE_SIZE_MAX = 100;

/**
 * GET /api/admin/users?page=1&pageSize=10&q=...&filter=all|new|inactive|unverified|google|blocked|e2ee|noE2ee
 *   &sort=lastLogin|createdAt&dir=desc|asc
 * One page of registered users (by default most recently active first), optionally filtered —
 * admin only
 */
export async function handleAdminUsersRoute(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");

  const url = new URL(request.url);
  const toInt = (value, fallback) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const pageSize = Math.min(toInt(url.searchParams.get("pageSize"), USERS_PAGE_SIZE_DEFAULT), USERS_PAGE_SIZE_MAX);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const requestedPage = toInt(url.searchParams.get("page"), 1);
  const sortParam = url.searchParams.get("sort");
  const sort = Object.hasOwn(USER_SORTS, sortParam || "") ? sortParam : "lastLogin";
  const dir = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  const filterParam = url.searchParams.get("filter");
  const filter = Object.hasOwn(USER_FILTERS, filterParam || "") ? filterParam : "all";
  const query = { q, filter, sort, dir, limit: pageSize };

  let { users, total } = await dbGetUsersPage(env, { ...query, offset: (requestedPage - 1) * pageSize });
  // Past the last page (e.g. the list shrank): answer with the last page instead of an empty one
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  if (page !== requestedPage) {
    ({ users, total } = await dbGetUsersPage(env, { ...query, offset: (page - 1) * pageSize }));
  }

  return jsonResponse({ success: true, users, total, page, pageSize, pageCount, sort, dir, filter }, 200, request);
}

/**
 * GET /api/admin/users/portfolio?userId=...&portfolioId=...
 * Return specific user's portfolios and holdings for inspection — admin only
 */
export async function handleAdminGetUserPortfolio(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") throw AppError.forbidden("دسترسی غیرمجاز. فقط مدیر سیستم مجاز است.");

  const url = new URL(request.url);
  const targetUserId = url.searchParams.get("userId");
  const portfolioId = url.searchParams.get("portfolioId") || null;

  if (!targetUserId) {
    throw AppError.badRequest("شناسه کاربر الزامی است.");
  }

  const targetUser = await dbGetUserById(env, targetUserId);
  if (!targetUser) {
    throw AppError.notFound("کاربر مورد نظر یافت نشد.");
  }

  const portfolios = (await dbGetUserPortfolios(env, targetUser.id)).map(({ sharePassword, ...p }) => ({
    ...p,
    hasPassword: !!(sharePassword && String(sharePassword).trim()),
  }));
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
    // Only the fields sent change, so each panel card can save its own settings
    const next = { ...(await getGlobalSettings(env, true)) };
    const percent = (value) => {
      const n = parseFloat(value);
      return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : null;
    };
    for (const key of ["bubble_pct_full", "bubble_pct_half", "bubble_pct_quarter"]) {
      if (body[key] === undefined) continue;
      const n = percent(body[key]);
      if (n === null) throw AppError.badRequest("درصد حباب باید عددی بین ۰ تا ۱۰۰۰ باشد.");
      next[key] = n;
    }
    if (body.announcement !== undefined) next.announcement = String(body.announcement || "").trim().slice(0, 500);
    if (body.maintenance_mode !== undefined) next.maintenance_mode = body.maintenance_mode ? 1 : 0;
    if (body.maintenance_message !== undefined) next.maintenance_message = String(body.maintenance_message || "").trim().slice(0, 500);

    await saveGlobalSettings(env, next);

    return jsonResponse({ success: true, message: "تنظیمات با موفقیت ذخیره شد.", settings: next }, 200, request);
  } catch (e) {
    if (e instanceof AppError) throw e;
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
    await refreshPriceBook(env).catch(() => {});
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

    await refreshPriceBook(env).catch(() => {});

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
    await refreshPriceBook(env).catch(() => {});
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
 * If body.id is provided and the test succeeds, what it returned becomes the source's items and
 * the price book is rebuilt.
 */
export async function handleAdminTestPriceSource(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const body = await request.json();
    const testResult = await testPriceSourceConfig(body, env);

    if (testResult.success && body.id && Array.isArray(testResult.items) && testResult.items.length > 0) {
      await dbStoreTestedSourceItems(env, body.id, testResult.items);
      await refreshPriceBook(env);
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
 * POST /api/admin/price-sources/inspect-api
 * Analyze any API endpoint structure and return candidate arrays and keys — admin only
 */
export async function handleAdminInspectApiRoute(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);

  try {
    const body = await request.json();
    const apiUrl = body.apiUrl || body.url || body.endpoint;
    if (!apiUrl) {
      return errorResponse("آدرس وب‌سرویس الزامی است.", 400, request);
    }
    const result = await inspectApiEndpointStructure(apiUrl, body.headers || {}, env);
    return jsonResponse(result, 200, request);
  } catch (e) {
    return errorResponse(e.message, 400, request);
  }
}

