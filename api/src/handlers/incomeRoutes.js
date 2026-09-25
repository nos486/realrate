/**
 * incomeRoutes.js — Handlers for user income tracking
 *
 * Endpoints:
 *   GET    /api/incomes        — List the user's incomes (newest first)
 *   POST   /api/incomes        — Record a new income
 *   PUT    /api/incomes/:id    — Update an income
 *   DELETE /api/incomes/:id    — Delete an income
 *
 * Aggregated reports (totals, per-category & per-month breakdowns) are computed client-side
 * from the full list, since a single user's income history is small.
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUserIncomes,
  dbCreateIncome,
  dbUpdateIncome,
  dbDeleteIncome,
} from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { rejectWhenVaultEnabled } from "../repositories/vault.repository.js";
import {
  INCOME_CATEGORIES,
  INCOME_TITLE_MAX_LENGTH,
  INCOME_NOTES_MAX_LENGTH,
} from "../config/constants.js";
import { isRecurringId } from "../domain/recurringIncome.js";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Helper to ensure authenticated user
 */
async function requireUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت دسترسی به مدیریت درآمدها، ابتدا وارد حساب کاربری خود شوید.");
  }
  const userId = user.userId || user.id || user.email;
  return { user, userId };
}

/**
 * Validate & normalize an income request body into the shape the repository persists.
 * Throws a 400 AppError with a user-facing message on invalid input.
 * @param {object} body
 * @returns {{ title: string, category: string, amount: number, incomeDate: string, notes: string, recurringId: string }}
 */
export function parseIncomeInput(body = {}) {
  const title = String(body.title ?? "").trim();
  const amount = Number(body.amount);
  const incomeDate = String(body.incomeDate ?? body.income_date ?? "").trim();
  const notes = String(body.notes ?? "").trim();
  const category = INCOME_CATEGORIES.includes(body.category) ? body.category : "other";
  // Set on entries a fixed (recurring) income created; '' for entries typed by the user
  const recurringId = String(body.recurringId ?? "").trim();

  if (!title) {
    throw AppError.badRequest("عنوان درآمد الزامی است.");
  }
  if (title.length > INCOME_TITLE_MAX_LENGTH) {
    throw AppError.badRequest(`عنوان درآمد نباید بیشتر از ${INCOME_TITLE_MAX_LENGTH} کاراکتر باشد.`);
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw AppError.badRequest("مبلغ درآمد باید عددی بزرگتر از صفر باشد.");
  }
  if (!ISO_DATE_RE.test(incomeDate) || isNaN(new Date(incomeDate).getTime())) {
    throw AppError.badRequest("تاریخ دریافت درآمد نامعتبر است.");
  }
  if (notes.length > INCOME_NOTES_MAX_LENGTH) {
    throw AppError.badRequest(`یادداشت نباید بیشتر از ${INCOME_NOTES_MAX_LENGTH} کاراکتر باشد.`);
  }

  if (!isRecurringId(recurringId)) {
    throw AppError.badRequest("شناسه درآمد ثابت نامعتبر است.");
  }

  return { title, category, amount, incomeDate, notes, recurringId };
}

/**
 * GET /api/incomes
 */
export async function handleGetIncomes(request, env) {
  const { userId } = await requireUser(request, env);
  const incomes = await dbGetUserIncomes(env, userId);
  return jsonResponse({ success: true, count: incomes.length, incomes }, 200, request);
}

/**
 * POST /api/incomes
 */
export async function handleCreateIncome(request, env) {
  const { userId } = await requireUser(request, env);
  const body = await request.json().catch(() => ({}));
  await rejectWhenVaultEnabled(env, userId);
  const income = await dbCreateIncome(env, userId, parseIncomeInput(body));
  return jsonResponse({ success: true, income }, 201, request);
}

/**
 * PUT /api/incomes/:id
 */
export async function handleUpdateIncome(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const incomeId = params.incomeId;
  if (!incomeId) {
    throw AppError.badRequest("شناسه درآمد الزامی است.");
  }

  const body = await request.json().catch(() => ({}));
  const income = await dbUpdateIncome(env, userId, incomeId, parseIncomeInput(body));
  if (!income) {
    throw AppError.notFound("درآمد مورد نظر یافت نشد.");
  }

  return jsonResponse({ success: true, income }, 200, request);
}

/**
 * DELETE /api/incomes/:id
 */
export async function handleDeleteIncome(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const incomeId = params.incomeId;
  if (!incomeId) {
    throw AppError.badRequest("شناسه درآمد الزامی است.");
  }

  const deleted = await dbDeleteIncome(env, userId, incomeId);
  if (!deleted) {
    throw AppError.notFound("درآمد مورد نظر یافت نشد یا قبلاً حذف شده است.");
  }

  return jsonResponse({ success: true, message: "درآمد با موفقیت حذف شد." }, 200, request);
}
