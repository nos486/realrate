/**
 * loans.repository.js — Reading and deleting the loans kept in plaintext D1 tables
 *
 * Loans are saved only as end-to-end encrypted vault records now: the browser runs every loan
 * operation on the decrypted document (domain/loanDocument.js) and lib/encryptionGate.js refuses
 * any plaintext loan write. What remains here is the older plaintext data, until it moves into
 * the vault: listing it, reading one loan, exporting its raw document for that move, and deleting it.
 *
 * Tables (repositories/d1Schema.js):
 * - loans: a loan's parameters
 * - loan_installment_states: the sparse installment rows (paid events, manual overrides)
 * - loan_extra_payments: the lump-sum payments
 * A stored loan is read back as the same document the vault keeps ({ loan, states, extraPayments }),
 * and its schedule and totals come from the same engine the browser runs (buildLoanView).
 */

import { ensureSchema } from "./schema.repository.js";
import { logger } from "../lib/logger.js";
import { buildLoanView, listExtraPaymentsDoc, summarizeLoan } from "../domain/loanDocument.js";

const LOAN_COLUMNS = `
  id, title, lender_name, bank_id, principal_amount, annual_interest_rate, installment_count,
  interval_months, start_date, annual_fee_amount, schedule_mode, notes, created_at, updated_at
`;
const STATE_COLUMNS = `
  id, loan_id, installment_number, due_date, principal_portion, interest_portion, total_amount,
  remaining_balance_after, is_paid, paid_date, paid_amount, is_manual_override, created_at, updated_at
`;
const EXTRA_PAYMENT_COLUMNS = `
  id, loan_id, amount, payment_date, reduction_mode, notes, anchor_installment_number,
  resulting_balance, resulting_installment_count, created_at
`;

/** A loans row → the document's `loan` */
function formatLoanRow(row) {
  return {
    id: row.id,
    title: row.title,
    lenderName: row.lender_name || "",
    bankId: row.bank_id || "",
    principalAmount: Number(row.principal_amount ?? 0),
    annualInterestRate: Number(row.annual_interest_rate ?? 0),
    installmentCount: parseInt(row.installment_count ?? 0, 10),
    intervalMonths: parseInt(row.interval_months ?? 1, 10),
    startDate: row.start_date,
    annualFeeAmount: Number(row.annual_fee_amount ?? 0),
    scheduleMode: row.schedule_mode || "formula",
    notes: row.notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A loan_installment_states row → one of the document's `states` */
function formatStateRow(row) {
  return {
    id: row.id,
    loanId: row.loan_id,
    installmentNumber: parseInt(row.installment_number ?? 0, 10),
    dueDate: row.due_date,
    dueDateIso: row.due_date,
    principalPortion: Number(row.principal_portion ?? 0),
    interestPortion: Number(row.interest_portion ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    remainingBalanceAfter: Number(row.remaining_balance_after ?? 0),
    isPaid: Boolean(row.is_paid),
    paidDate: row.paid_date || "",
    paidAmount: Number(row.paid_amount ?? 0),
    isManualOverride: Boolean(row.is_manual_override),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A loan_extra_payments row → one of the document's `extraPayments` */
function formatExtraPaymentRow(row) {
  return {
    id: row.id,
    loanId: row.loan_id,
    amount: Number(row.amount ?? 0),
    paymentDate: row.payment_date,
    reductionMode: row.reduction_mode || "reduce_amount",
    notes: row.notes || "",
    anchorInstallmentNumber: Number(row.anchor_installment_number ?? 0),
    resultingBalance: Number(row.resulting_balance ?? 0),
    resultingInstallmentCount: row.resulting_installment_count ? Number(row.resulting_installment_count) : null,
    createdAt: row.created_at,
  };
}

/** Group rows by their loan_id */
function byLoan(rows, format) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.loan_id)) groups.set(row.loan_id, []);
    groups.get(row.loan_id).push(format(row));
  }
  return groups;
}

/**
 * The user's stored loans as documents, newest first — three queries in all, whatever the count
 * @param {string} [loanId] only this loan
 * @returns {Promise<Array<{ loan: object, states: object[], extraPayments: object[] }>>}
 */
async function readLoanDocuments(env, userId, loanId = null) {
  await ensureSchema(env);
  const where = loanId ? "user_id = ? AND id = ?" : "user_id = ?";
  const childWhere = loanId ? "user_id = ? AND loan_id = ?" : "user_id = ?";
  const args = loanId ? [userId, loanId] : [userId];

  const { results: loanRows = [] } = await env.DB
    .prepare(`SELECT ${LOAN_COLUMNS} FROM loans WHERE ${where} ORDER BY created_at DESC`)
    .bind(...args).all();
  if (!loanRows.length) return [];

  const [{ results: stateRows = [] }, { results: paymentRows = [] }] = await Promise.all([
    env.DB.prepare(`SELECT ${STATE_COLUMNS} FROM loan_installment_states WHERE ${childWhere} ORDER BY installment_number ASC`)
      .bind(...args).all(),
    env.DB.prepare(`SELECT ${EXTRA_PAYMENT_COLUMNS} FROM loan_extra_payments WHERE ${childWhere} ORDER BY payment_date ASC, created_at ASC`)
      .bind(...args).all(),
  ]);
  const states = byLoan(stateRows, formatStateRow);
  const payments = byLoan(paymentRows, formatExtraPaymentRow);

  return loanRows.map((row) => ({
    loan: formatLoanRow(row),
    states: states.get(row.id) || [],
    extraPayments: payments.get(row.id) || [],
  }));
}

/**
 * The user's stored loans with their totals (no schedule), newest first (GET /api/loans)
 * @returns {Promise<object[]>}
 */
export async function dbGetUserLoans(env, userId) {
  if (!userId || !env?.DB) return [];
  return (await readLoanDocuments(env, userId)).map(summarizeLoan);
}

/**
 * One stored loan with its full schedule and extra payments (GET /api/loans/:id)
 * @returns {Promise<object|null>} null when there is no such loan
 */
export async function dbGetLoanById(env, userId, loanId) {
  const doc = await dbGetLoanDocument(env, userId, loanId);
  return doc ? buildLoanView(doc) : null;
}

/**
 * A stored loan's raw document — parameters, sparse installment states and extra payments,
 * exactly as persisted (nothing computed) — to move it into an encrypted vault record
 * (GET /api/loans/:id/document)
 * @returns {Promise<{ loan: object, states: object[], extraPayments: object[] }|null>}
 */
export async function dbGetLoanDocument(env, userId, loanId) {
  if (!userId || !loanId || !env?.DB) return null;
  const [doc] = await readLoanDocuments(env, userId, loanId);
  return doc || null;
}

/**
 * A stored loan's extra payments, newest first (GET /api/loans/:id/extra-payments)
 * @returns {Promise<object[]>}
 */
export async function dbGetLoanExtraPayments(env, userId, loanId) {
  const doc = await dbGetLoanDocument(env, userId, loanId);
  return doc ? listExtraPaymentsDoc(doc) : [];
}

/**
 * Delete a stored loan with its installment states and extra payments, in one batch
 * @returns {Promise<boolean>} false when the delete failed
 */
export async function dbDeleteLoan(env, userId, loanId) {
  if (!userId || !loanId || !env?.DB) return false;
  await ensureSchema(env);
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM loan_installment_states WHERE loan_id = ? AND user_id = ?").bind(loanId, userId),
      env.DB.prepare("DELETE FROM loan_extra_payments WHERE loan_id = ? AND user_id = ?").bind(loanId, userId),
      env.DB.prepare("DELETE FROM loans WHERE id = ? AND user_id = ?").bind(loanId, userId),
    ]);
    return true;
  } catch (e) {
    logger.error("[DB] dbDeleteLoan error:", { error: e.message, userId, loanId });
    return false;
  }
}
