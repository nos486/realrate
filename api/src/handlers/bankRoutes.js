/**
 * bankRoutes.js — User-defined (custom) banks
 *
 * Endpoints:
 *   GET    /api/banks/custom       — List the user's custom banks
 *   POST   /api/banks/custom       — Add a custom bank ({ name }); returns the existing one on a duplicate name
 *   DELETE /api/banks/custom/:id   — Remove a custom bank (loans keep their lender name)
 *
 * The standard bank list is static (config/banks.config.js) and ships with the client, so it
 * has no endpoint.
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { dbListCustomBanks, dbCreateCustomBank, dbDeleteCustomBank } from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";

async function requireUserId(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized("جهت مدیریت بانک‌ها، ابتدا وارد حساب کاربری خود شوید.");
  return user.userId || user.id || user.email;
}

export async function handleListCustomBanks(request, env) {
  const userId = await requireUserId(request, env);
  const banks = await dbListCustomBanks(env, userId);
  return jsonResponse({ success: true, banks }, 200, request);
}

export async function handleCreateCustomBank(request, env) {
  const userId = await requireUserId(request, env);
  const body = await request.json().catch(() => ({}));
  const bank = await dbCreateCustomBank(env, userId, body.name);
  return jsonResponse({ success: true, bank }, 201, request);
}

export async function handleDeleteCustomBank(request, env, { bankId }) {
  const userId = await requireUserId(request, env);
  const deleted = await dbDeleteCustomBank(env, userId, bankId);
  if (!deleted) throw AppError.notFound("بانک مورد نظر یافت نشد.");
  return jsonResponse({ success: true, deletedId: bankId }, 200, request);
}
