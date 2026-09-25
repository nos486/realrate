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
 *   PUT    /api/loans/:id/installments/bulk               — Re-plan every pending installment at once (equal-split);
 *                                                            the sole way to edit installment amounts (no single-installment edit)
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetUserLoans,
  dbGetLoanById,
  dbCreateLoan,
  dbUpdateLoan,
  dbDeleteLoan,
  dbMarkInstallmentPaid,
  dbMarkInstallmentPaidCascade,
  dbUnmarkInstallmentPaid,
  dbBulkDistributeInstallments,
  dbAddExtraPayment,
  dbGetLoanExtraPayments,
} from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { rejectWhenVaultEnabled } from "../repositories/vault.repository.js";
import { logger } from "../lib/logger.js";
import { isValidIsoDate } from "../domain/isoDate.js";

/** An optional date field must, when present, be a real Gregorian ISO date */
function assertOptionalDate(value, message) {
  if (value !== undefined && value !== null && value !== "" && !isValidIsoDate(String(value).slice(0, 10))) {
    throw AppError.badRequest(message);
  }
}

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
 * POST /api/loans
 * Create a new loan and its installments
 * Accepts loan metadata including optional customFirstInstallmentAmount in request body
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
  assertOptionalDate(body.startDate ?? body.start_date, "تاریخ دریافت وام نامعتبر است.");

  await rejectWhenVaultEnabled(env, userId);
  const loan = await dbCreateLoan(env, userId, body);
  return jsonResponse({ success: true, loan }, 201, request);
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
  assertOptionalDate(body.startDate ?? body.start_date, "تاریخ دریافت وام نامعتبر است.");
  const updatedLoan = await dbUpdateLoan(env, userId, loanId, body);

  if (!updatedLoan) {
    throw AppError.notFound("وام مورد نظر یافت نشد یا امکان ویرایش آن وجود ندارد.");
  }

  return jsonResponse({ success: true, loan: updatedLoan }, 200, request);
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
 * PUT /api/loans/:id/installments/:installmentId
 * Mark or unmark a specific installment as paid
 */
export async function handleUpdateInstallment(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const loanId = params.loanId || params.id;
  const installmentId = params.installmentId;

  if (!installmentId) {
    throw AppError.badRequest("شناسه قسط الزامی است.");
  }

  const body = await request.json().catch(() => ({}));
  assertOptionalDate(body.paidDate ?? body.paid_date, "تاریخ پرداخت قسط نامعتبر است.");
  const isPaid = body.isPaid ?? body.is_paid;
  const cascade = Boolean(body.cascade);

  let installment;
  let cascadedCount = 0;
  let cascadedTotal = 0;
  let cascadedInstallments = [];

  if (isPaid === false || isPaid === 0) {
    installment = await dbUnmarkInstallmentPaid(env, userId, installmentId, loanId);
  } else if (cascade && loanId) {
    const cascadeRes = await dbMarkInstallmentPaidCascade(env, userId, loanId, installmentId, {
      paidDate: body.paidDate || body.paid_date,
      paidAmount: body.paidAmount ?? body.paid_amount,
    });
    installment = cascadeRes.installment;
    cascadedCount = cascadeRes.cascadedCount;
    cascadedTotal = cascadeRes.cascadedTotal;
    cascadedInstallments = cascadeRes.cascadedInstallments;
  } else {
    installment = await dbMarkInstallmentPaid(env, userId, installmentId, {
      paidDate: body.paidDate || body.paid_date,
      paidAmount: body.paidAmount ?? body.paid_amount,
      loanId,
    });
  }

  if (!installment) {
    throw AppError.notFound("قسط مورد نظر یافت نشد.");
  }

  return jsonResponse({
    success: true,
    installment,
    cascadedCount,
    cascadedTotal,
    cascadedInstallments,
  }, 200, request);
}

/**
 * PUT /api/loans/:id/installments/bulk
 * Re-plan every pending installment's amount at once ("ویرایش گروهی اقساط"): any subset of
 * pending installments may be given a known amount, and every other pending installment equally
 * divides what's left of the loan's expected total repayment (see distributeInstallmentAmounts).
 * Body: { knownAmounts: { [installmentNumber]: totalAmount } }
 */
export async function handleBulkDistributeInstallments(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const loanId = params.loanId || params.id;

  if (!loanId) {
    throw AppError.badRequest("شناسه وام الزامی است.");
  }

  const body = await request.json().catch(() => ({}));
  const knownAmounts = body.knownAmounts && typeof body.knownAmounts === "object" ? body.knownAmounts : {};
  const totalRepaymentAmount = body.totalRepaymentAmount ?? body.total_repayment_amount;

  const loan = await dbBulkDistributeInstallments(env, userId, loanId, knownAmounts, totalRepaymentAmount);
  return jsonResponse({ success: true, loan }, 200, request);
}

/**
 * POST /api/loans/:id/extra-payments
 * Record an extra payment and recalculate loan schedule
 */
export async function handleAddExtraPayment(request, env, params = {}) {
  const { userId } = await requireUser(request, env);
  const loanId = params.loanId || params.id;

  if (!loanId) {
    throw AppError.badRequest("شناسه وام الزامی است.");
  }

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const paymentDate = body.paymentDate || body.payment_date;
  const reductionMode = body.reductionMode || body.reduction_mode || "reduce_amount";
  const notes = body.notes || "";

  if (!amount || isNaN(amount) || amount <= 0) {
    throw AppError.badRequest("مبلغ پرداخت اضافه باید عددی بزرگتر از صفر باشد.");
  }
  if (!paymentDate) {
    throw AppError.badRequest("تاریخ پرداخت اضافه الزامی است.");
  }
  assertOptionalDate(paymentDate, "تاریخ پرداخت اضافه نامعتبر است.");

  const result = await dbAddExtraPayment(env, userId, loanId, {
    amount,
    paymentDate,
    reductionMode,
    notes,
  });

  return jsonResponse(result, 201, request);
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

