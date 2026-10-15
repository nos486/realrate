/**
 * loanRoutes.js — Handlers for the loans kept in plaintext D1 tables (reading and deleting them)
 *
 * Loans are saved only as end-to-end encrypted vault records (shared/vault/vaultLoans.js runs
 * every operation in the browser); lib/encryptionGate.js refuses any plaintext loan write before
 * a handler runs. These routes serve the older plaintext data until it moves into the vault:
 *   GET    /api/loans                    — the user's loans with their totals
 *   GET    /api/loans/:id                — one loan with its installment list
 *   GET    /api/loans/:id/extra-payments — its extra payments, newest first
 *   DELETE /api/loans/:id                — delete a loan with its installments
 * (GET /api/loans/:id/document, its raw document for the move, is in vaultRoutes.js.)
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import { dbGetUserLoans, dbGetLoanById, dbDeleteLoan, dbGetLoanExtraPayments } from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";

/**
 * Helper to ensure authenticated user
 */
async function requireUser(request, env) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت دسترسی به مدیریت وام‌ها، ابتدا وارد حساب کاربری خود شوید.");
  }
  const userId = user.userId || user.id || user.email;
  return { user, userId };
}

/**
 * GET /api/loans
 * List all loans of current authenticated user with aggregates
 */
export async function handleGetLoans(request, env) {
  const { userId } = await requireUser(request, env);
  const loans = await dbGetUserLoans(env, userId);
  return jsonResponse({
    success: true,
    count: loans.length,
    loans,
  }, 200, request);
}

/**
 * GET /api/loans/:id
 * Retrieve a single loan and its full installment list
 */
export async function handleGetLoan(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const url = new URL(request.url);
  const loanId = params.loanId || params.id || url.searchParams.get("id");

  if (!loanId) {
    throw AppError.badRequest("شناسه وام الزامی است.");
  }

  const loan = await dbGetLoanById(env, userId, loanId);
  if (!loan) {
    throw AppError.notFound("وام مورد نظر یافت نشد.");
  }

  return jsonResponse({ success: true, loan }, 200, request);
}

/**
 * DELETE /api/loans/:id
 * Delete a loan and all its installments
 */
export async function handleDeleteLoan(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const url = new URL(request.url);
  const loanId = params.loanId || params.id || url.searchParams.get("id");

  if (!loanId) {
    throw AppError.badRequest("شناسه وام الزامی است.");
  }

  const deleted = await dbDeleteLoan(env, userId, loanId);
  if (!deleted) {
    throw AppError.notFound("وام مورد نظر یافت نشد یا قبلاً حذف شده است.");
  }

  return jsonResponse({ success: true, message: "وام و اقساط مربوطه با موفقیت حذف شدند." }, 200, request);
}

/**
 * GET /api/loans/:id/extra-payments
 * List all extra payments recorded for a loan
 */
export async function handleGetLoanExtraPayments(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const loanId = params.loanId || params.id;

  if (!loanId) {
    throw AppError.badRequest("شناسه وام الزامی است.");
  }

  const extraPayments = await dbGetLoanExtraPayments(env, userId, loanId);
  return jsonResponse({ success: true, count: extraPayments.length, extraPayments }, 200, request);
}
