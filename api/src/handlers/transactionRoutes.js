/**
 * transactionRoutes.js — REST endpoints for user portfolio transaction management
 *
 * Endpoints:
 *   GET    /api/portfolios/:id/transactions     — List transactions for a portfolio
 *   POST   /api/portfolios/:id/transactions     — Add a new transaction
 *   PUT    /api/portfolios/:id/transactions     — Update an existing transaction
 *   DELETE /api/portfolios/:id/transactions     — Delete a transaction
 */

import { getAuthenticatedUser } from "../lib/auth.js";
import {
  dbGetPortfolioById,
  dbGetTransactionsByPortfolio,
  dbGetTransactionById,
  dbCreateTransaction,
  dbUpdateTransaction,
  dbDeleteTransaction,
} from "../repositories/index.js";
import { jsonResponse } from "../lib/helpers.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../lib/logger.js";

/**
 * Helper to authenticate user and verify portfolio ownership
 * @param {Request} request
 * @param {object} env
 * @param {string} portfolioId
 * @returns {Promise<{ user: object, userId: string, portfolio: object }>}
 */
async function authenticateAndVerifyPortfolio(request, env, portfolioId) {
  const user = await getAuthenticatedUser(request, env);
  if (!user) {
    throw AppError.unauthorized("جهت دسترسی به تراکنش‌ها، ابتدا وارد حساب کاربری خود شوید.");
  }

  const userId = user.userId || user.id || user.email;
  if (!portfolioId) {
    throw AppError.badRequest("شناسه پورتفو الزامی است.");
  }

  const portfolio = await dbGetPortfolioById(env, portfolioId, userId);
  if (!portfolio) {
    throw AppError.notFound("پورتفوی مورد نظر یافت نشد یا شما به آن دسترسی ندارید.");
  }

  return { user, userId, portfolio };
}

/**
 * GET /api/portfolios/:id/transactions
 */
export async function handleGetTransactions(request, env, params = {}) {
  const url = new URL(request.url);
  const portfolioId = params.portfolioId || url.searchParams.get("portfolioId");
  const { userId } = await authenticateAndVerifyPortfolio(request, env, portfolioId);

  const transactions = await dbGetTransactionsByPortfolio(env, userId, portfolioId);

  return jsonResponse({
    success: true,
    portfolioId,
    count: transactions.length,
    transactions,
  }, 200, request);
}

/**
 * POST /api/portfolios/:id/transactions
 */
export async function handleCreateTransaction(request, env, params = {}) {
  const url = new URL(request.url);
  const portfolioId = params.portfolioId || url.searchParams.get("portfolioId");
  const { userId } = await authenticateAndVerifyPortfolio(request, env, portfolioId);

  const body = await request.json().catch(() => ({}));
  const encryptedPayload = body.encryptedPayload || body.payload;

  if (!encryptedPayload) {
    throw AppError.badRequest("داده تراکنش (encryptedPayload) نمی‌تواند خالی باشد.");
  }

  const transaction = await dbCreateTransaction(env, {
    id: body.id,
    userId,
    portfolioId,
    encryptedPayload,
    createdAt: body.createdAt,
  });

  return jsonResponse({
    success: true,
    message: "تراکنش با موفقیت ثبت شد.",
    transaction,
  }, 201, request);
}

/**
 * PUT /api/portfolios/:id/transactions
 */
export async function handleUpdateTransaction(request, env, params = {}) {
  const url = new URL(request.url);
  const portfolioId = params.portfolioId || url.searchParams.get("portfolioId");
  const { userId } = await authenticateAndVerifyPortfolio(request, env, portfolioId);

  const body = await request.json().catch(() => ({}));
  const txId = params.txId || url.searchParams.get("id") || url.searchParams.get("txId") || body.id || body.txId;

  if (!txId) {
    throw AppError.badRequest("شناسه تراکنش جهت ویرایش الزامی است.");
  }

  const encryptedPayload = body.encryptedPayload || body.payload;
  if (!encryptedPayload) {
    throw AppError.badRequest("داده تراکنش (encryptedPayload) نمی‌تواند خالی باشد.");
  }

  const existing = await dbGetTransactionById(env, txId, userId);
  if (!existing || existing.portfolioId !== portfolioId) {
    throw AppError.notFound("تراکنش مورد نظر یافت نشد.");
  }

  const updated = await dbUpdateTransaction(env, {
    id: txId,
    userId,
    portfolioId,
    encryptedPayload,
  });

  return jsonResponse({
    success: true,
    message: "تراکنش با موفقیت به‌روزرسانی شد.",
    transaction: updated,
  }, 200, request);
}

/**
 * DELETE /api/portfolios/:id/transactions
 */
export async function handleDeleteTransaction(request, env, params = {}) {
  const url = new URL(request.url);
  const portfolioId = params.portfolioId || url.searchParams.get("portfolioId");
  const { userId } = await authenticateAndVerifyPortfolio(request, env, portfolioId);

  let txId = params.txId || url.searchParams.get("id") || url.searchParams.get("txId");
  if (!txId) {
    const body = await request.json().catch(() => ({}));
    txId = body.id || body.txId;
  }

  if (!txId) {
    throw AppError.badRequest("شناسه تراکنش جهت حذف الزامی است.");
  }

  const existing = await dbGetTransactionById(env, txId, userId);
  if (!existing || existing.portfolioId !== portfolioId) {
    throw AppError.notFound("تراکنش مورد نظر یافت نشد.");
  }

  const deleted = await dbDeleteTransaction(env, txId, userId);
  if (!deleted) {
    throw AppError.internal("خطا در حذف تراکنش.");
  }

  return jsonResponse({
    success: true,
    message: "تراکنش با موفقیت حذف شد.",
    deletedId: txId,
  }, 200, request);
}
