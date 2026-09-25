/**
 * chequeRoutes.js — Handlers for received / issued cheques
 *
 * Endpoints:
 *   GET    /api/cheques        — List the user's cheques (earliest due date first)
 *   POST   /api/cheques        — Register a cheque
 *   PUT    /api/cheques/:id    — Update a cheque (status changes arrive with their history entry)
 *   DELETE /api/cheques/:id    — Delete a cheque
 *
 * Validation is the shared domain/chequeDocument.js, also used by the browser for encrypted
 * (account vault) cheques. Summaries and reminders are computed client-side from the list.
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUserCheques,
  dbCreateCheque,
  dbUpdateCheque,
  dbDeleteCheque,
} from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { rejectWhenVaultEnabled } from "../repositories/vault.repository.js";
import { validateChequeInput } from "../domain/chequeDocument.js";

async function requireUserId(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) throw AppError.unauthorized("جهت مدیریت چک‌ها، ابتدا وارد حساب کاربری خود شوید.");
  return user.userId || user.id || user.email;
}

/**
 * Validate a cheque body; throws a 400 AppError with the user-facing message when invalid.
 * @returns {object} the normalized cheque fields
 */
export function parseChequeInput(body) {
  const { value, error } = validateChequeInput(body, { today: new Date().toISOString().slice(0, 10) });
  if (error) throw AppError.badRequest(error);
  return value;
}

export async function handleGetCheques(request, env) {
  const userId = await requireUserId(request, env);
  const cheques = await dbGetUserCheques(env, userId);
  return jsonResponse({ success: true, count: cheques.length, cheques }, 200, request);
}

export async function handleCreateCheque(request, env) {
  const userId = await requireUserId(request, env);
  const body = await request.json().catch(() => ({}));
  const data = parseChequeInput(body);
  await rejectWhenVaultEnabled(env, userId);
  const cheque = await dbCreateCheque(env, userId, data);
  return jsonResponse({ success: true, cheque }, 201, request);
}

export async function handleUpdateCheque(request, env, params = {}) {
  const userId = await requireUserId(request, env);
  if (!params.chequeId) throw AppError.badRequest("شناسه چک الزامی است.");
  const body = await request.json().catch(() => ({}));
  const cheque = await dbUpdateCheque(env, userId, params.chequeId, parseChequeInput(body));
  if (!cheque) throw AppError.notFound("چک مورد نظر یافت نشد.");
  return jsonResponse({ success: true, cheque }, 200, request);
}

export async function handleDeleteCheque(request, env, params = {}) {
  const userId = await requireUserId(request, env);
  if (!params.chequeId) throw AppError.badRequest("شناسه چک الزامی است.");
  const deleted = await dbDeleteCheque(env, userId, params.chequeId);
  if (!deleted) throw AppError.notFound("چک مورد نظر یافت نشد یا قبلاً حذف شده است.");
  return jsonResponse({ success: true, message: "چک با موفقیت حذف شد." }, 200, request);
}
