/**
 * loanRoutes.js — Handlers for Loan & Installment Management
 *
 * Endpoints:
 *   GET    /api/loans                                    — List user's loans with metadata
 *   POST   /api/loans                                    — Create a new loan with full schedule
 *   GET    /api/loans/:id                                — Get single loan details + installment list
 *   PUT    /api/loans/:id                                — Update loan details (rebuilds pending installments if needed)
 *   DELETE /api/loans/:id                                — Delete a loan
 *   PUT    /api/loans/:id/installments/:installmentId    — Pay or unpay a specific installment
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUserLoans,
  dbGetLoanById,
  dbCreateLoan,
  dbUpdateLoan,
  dbDeleteLoan,
  dbMarkInstallmentPaid,
  dbUnmarkInstallmentPaid,
} from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

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
  });
}

/**
 * POST /api/loans
 * Create a new loan and its installments
 */
export async function handleCreateLoan(request, env) {
  const { userId } = await requireUser(request, env);
  const body = await request.json().catch(() => ({}));

  const title = body.title?.trim();
  const principalAmount = Number(body.principalAmount ?? body.principal ?? 0);
  const installmentCount = parseInt(body.installmentCount ?? body.installment_count ?? 0, 10);

  if (!title) {
    throw AppError.badRequest("عنوان وام الزامی است.");
  }
  if (!principalAmount || principalAmount <= 0) {
    throw AppError.badRequest("مبلغ اصل وام باید مقداری بزرگتر از صفر باشد.");
  }
  if (!installmentCount || installmentCount <= 0) {
    throw AppError.badRequest("تعداد اقساط باید حداقل ۱ باشد.");
  }

  const loan = await dbCreateLoan(env, userId, body);
  return jsonResponse({ success: true, loan }, 201);
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

  return jsonResponse({ success: true, loan });
}

/**
 * PUT /api/loans/:id
 * Update loan info and rebuild pending installments if financial parameters changed
 */
export async function handleUpdateLoan(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const url = new URL(request.url);
  const loanId = params.loanId || params.id || url.searchParams.get("id");

  if (!loanId) {
    throw AppError.badRequest("شناسه وام الزامی است.");
  }

  const body = await request.json().catch(() => ({}));
  const updatedLoan = await dbUpdateLoan(env, userId, loanId, body);

  if (!updatedLoan) {
    throw AppError.notFound("وام مورد نظر یافت نشد یا امکان ویرایش آن وجود ندارد.");
  }

  return jsonResponse({ success: true, loan: updatedLoan });
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

  return jsonResponse({ success: true, message: "وام و اقساط مربوطه با موفقیت حذف شدند." });
}

/**
 * PUT /api/loans/:id/installments/:installmentId
 * Mark or unmark a specific installment as paid
 */
export async function handleUpdateInstallment(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const installmentId = params.installmentId;

  if (!installmentId) {
    throw AppError.badRequest("شناسه قسط الزامی است.");
  }

  const body = await request.json().catch(() => ({}));
  const isPaid = body.isPaid ?? body.is_paid;

  let installment;
  if (isPaid === false || isPaid === 0) {
    installment = await dbUnmarkInstallmentPaid(env, userId, installmentId);
  } else {
    installment = await dbMarkInstallmentPaid(env, userId, installmentId, {
      paidDate: body.paidDate || body.paid_date,
      paidAmount: body.paidAmount ?? body.paid_amount,
    });
  }

  if (!installment) {
    throw AppError.notFound("قسط مورد نظر یافت نشد.");
  }

  return jsonResponse({ success: true, installment });
}
