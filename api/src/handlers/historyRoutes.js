/**
 * historyRoutes.js — Admin: the price history and its tgju backfill (historyBackfill.service.js)
 *
 *   GET  /api/admin/history                     catalog, mappings, the book's items, the history per id
 *   POST /api/admin/history/mappings            { mappings } → save them
 *   POST /api/admin/history/preview             { slug, target? } → latest days, the matching unit
 *   POST /api/admin/history/backfill            { slug, target, unit, days, overwrite, usdTarget? }
 *   POST /api/admin/history/keys                { action: "delete", key } | { action: "move", key, to }
 *                                               | { action: "delete-orphans" }
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { jsonResponse, forbiddenResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { getPriceBookCache } from "../repositories/priceBookStore.repository.js";
import { TGJU_CATALOG } from "../config/tgjuCatalog.js";
import {
  backfillPriceHistory,
  previewTgju,
  getMappings,
  saveMappings,
  recordMappingRun,
  listHistoryKeys,
  deleteHistoryKey,
  deleteOrphanKeys,
  moveHistoryKey,
  MAX_BACKFILL_DAYS,
} from "../services/market/historyBackfill.service.js";

/** The book's items a series can fill (catalogs — thousands of symbols — left out) */
function bookItems(book) {
  return Object.entries(book?.items || {})
    .filter(([, item]) => !String(item.category || "").startsWith("bourse"))
    .map(([id, item]) => ({ id, name: item.name || id, category: item.category || "", price: Number(item.price) || null }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "fa"));
}

export async function handleAdminHistory(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user || user.role !== "admin") return forbiddenResponse(request);
  const path = new URL(request.url).pathname.replace(/^\/api\/(v1\/)?admin\/history/, "") || "/";
  const ok = (data) => jsonResponse({ success: true, ...data }, 200, request);

  if (request.method === "GET" && path === "/") {
    const [book, mappings, history] = await Promise.all([getPriceBookCache(env), getMappings(env), listHistoryKeys(env)]);
    return ok({ catalog: TGJU_CATALOG, mappings, items: bookItems(book), history, maxDays: MAX_BACKFILL_DAYS });
  }
  if (request.method !== "POST") throw AppError.notFound("مسیر پیدا نشد");
  const body = await request.json().catch(() => ({}));

  if (path === "/mappings") return ok({ mappings: await saveMappings(env, body.mappings) });

  if (path === "/preview") return ok(await previewTgju(env, { slug: body.slug, target: body.target || "" }));

  if (path === "/backfill") {
    const slug = String(body.slug || "");
    try {
      const result = await backfillPriceHistory(env, {
        slug,
        target: String(body.target || ""),
        unit: String(body.unit || ""),
        usdTarget: String(body.usdTarget || "usd"),
        days: Number(body.days) || 730,
        overwrite: body.overwrite === true,
      });
      await recordMappingRun(env, result.slug, { ok: true, written: result.written, from: result.from, to: result.to });
      return ok(result);
    } catch (err) {
      await recordMappingRun(env, slug, { ok: false, error: err.message }).catch(() => {});
      throw err;
    }
  }

  if (path === "/keys") {
    if (body.action === "delete") return ok({ deleted: await deleteHistoryKey(env, String(body.key || "")), history: await listHistoryKeys(env) });
    if (body.action === "move") return ok({ ...(await moveHistoryKey(env, String(body.key || ""), String(body.to || ""))), history: await listHistoryKeys(env) });
    if (body.action === "delete-orphans") return ok({ ...(await deleteOrphanKeys(env)), history: await listHistoryKeys(env) });
    throw AppError.badRequest("عملیات نامعتبر است");
  }
  throw AppError.notFound("مسیر پیدا نشد");
}
