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
  dbSavePriceSource,
  dbSetPrimaryPriceSource,
  saveGlobalSettings,
  getGlobalSettings,
} from "../repositories/index.js";
import { getAdminStats } from "../lib/analytics.js";
import { testPriceSource, refreshPriceBook } from "../services/market/priceAggregator.service.js";
import { listPriceSourcesForAdmin, priceSourceItemsForAdmin, syncPriceSourceNow } from "../services/market/priceSourcesAdmin.service.js";
import { syncAllSources } from "../services/market/sourceSync.service.js";
import { jsonResponse, errorResponse, forbiddenResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";

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
 * Save global settings to the database — admin only
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

/** The admin, or a 403 response */
async function requireAdmin(request, env) {
  const user = await getAuthenticatedUser(request, env);
  return user?.role === "admin" ? null : forbiddenResponse(request);
}

/**
 * GET /api/admin/price-sources
 * Every source with its kind, schedule (interval, last and next sync) and status, a preview of
 * what it gives, and a summary — admin only
 */
export async function handleAdminGetPriceSources(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  return jsonResponse({ success: true, ...(await listPriceSourcesForAdmin(env)) }, 200, request);
}

/**
 * GET /api/admin/price-sources/items?id=
 * A source's items as its last sync stored them — admin only
 */
export async function handleAdminGetPriceSourceItems(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  const items = await priceSourceItemsForAdmin(env, id);
  if (!items) return errorResponse("سورس پیدا نشد.", 404, request);
  return jsonResponse({ success: true, id, items }, 200, request);
}

/**
 * POST /api/admin/price-sources { id, isActive }
 * Switch a source on or off: with "primary", the only change kept for a source defined in code
 * — admin only
 */
export async function handleAdminSavePriceSource(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const body = await request.json();
    await dbSavePriceSource(env, { id: body?.id, isActive: body?.isActive });
    await refreshPriceBook(env).catch(() => {});
    return jsonResponse({ success: true }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 400, request);
  }
}

/**
 * DELETE /api/admin/price-sources
 * Sources are defined in code (sources.config.js) and can't be deleted from the admin; switching
 * one off does the same for the prices — admin only
 */
export async function handleAdminDeletePriceSource(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  return errorResponse("سورس‌ها در کد تعریف شده‌اند و حذف نمی‌شوند؛ برای کنار گذاشتن، سورس را غیرفعال کنید.", 400, request);
}

/**
 * POST /api/admin/price-sources/set-primary { id }
 * Make a source the primary one for its id (it keeps the id; the others become `${sourceId}__id`)
 * — admin only
 */
export async function handleAdminSetPrimarySource(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  try {
    const { id } = await request.json();
    if (!id) return errorResponse("شناسه سورس الزامی است.", 400, request);
    await dbSetPrimaryPriceSource(env, id);
    await refreshPriceBook(env).catch(() => {});
    return jsonResponse({ success: true }, 200, request);
  } catch (e) {
    return errorResponse(e.message, 400, request);
  }
}

/**
 * POST /api/admin/price-sources/test { id }
 * A dry run of a source: fetched and parsed now, nothing kept — admin only
 */
export async function handleAdminTestPriceSource(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const { id } = await request.json().catch(() => ({}));
  return jsonResponse(await testPriceSource(env, id), 200, request);
}

/**
 * POST /api/admin/price-sources/sync { id }
 * Sync one source now through the pipeline (guard, storage, price book, history) — admin only
 */
export async function handleAdminSyncPriceSource(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const { id } = await request.json().catch(() => ({}));
  return jsonResponse(await syncPriceSourceNow(env, id), 200, request);
}

/**
 * POST /api/admin/price-sources/fetch-all
 * Sync every active source now — admin only
 */
export async function handleAdminFetchAllSources(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const { syncedCount, failedCount } = await syncAllSources(env, { forceAll: true });
  return jsonResponse({ success: true, syncedCount, failedCount }, 200, request);
}
