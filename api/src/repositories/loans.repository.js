/**
 * loans.repository.js — Cloudflare D1 Data Access Layer for Loans & Dynamic Amortization
 *
 * Implements Virtual Schedule Architecture:
 * - loans: stores loan master parameters
 * - loan_installment_states: stores only mutated installments (manual overrides, paid events)
 * - loan_extra_payments: stores lump sum payments with cached anchor & resulting balances
 * - computeEffectiveSchedule: dynamically reconstructs the full installments list on read
 */

import { ensureD1Tables } from "./migration.repository.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../lib/AppError.js";
import {
  generateAmortizationSchedule,
  recalculateFromBalance,
  calculateFixedInstallmentAmount,
  calculatePayoffScheduleFixedAmount,
  computeEffectiveSchedule,
  parseDateParts,
  computeClampedDueDate,
} from "../domain/loanCalculator.js";

/**
 * Helper to generate random IDs
 * @param {string} prefix
 * @returns {string}
 */
function generateId(prefix = "loan") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Format raw SQL loan row into camelCase object
 */
function formatLoanRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    title: row.title,
    lenderName: row.lender_name || row.lenderName || "",
    principalAmount: Number(row.principal_amount ?? row.principalAmount ?? 0),
    annualInterestRate: Number(row.annual_interest_rate ?? row.annualInterestRate ?? 0),
    installmentCount: parseInt(row.installment_count ?? row.installmentCount ?? 0, 10),
    intervalMonths: parseInt(row.interval_months ?? row.intervalMonths ?? 1, 10),
    startDate: row.start_date || row.startDate,
    notes: row.notes || "",
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

/**
 * Format raw SQL installment state row into camelCase object
 */
function formatInstallmentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    loanId: row.loan_id || row.loanId,
    userId: row.user_id || row.userId,
    installmentNumber: parseInt(row.installment_number ?? row.installmentNumber ?? 0, 10),
    dueDate: row.due_date || row.dueDate,
    dueDateIso: row.due_date || row.dueDate,
    principalPortion: Number(row.principal_portion ?? row.principalPortion ?? 0),
    interestPortion: Number(row.interest_portion ?? row.interestPortion ?? 0),
    totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
    remainingBalanceAfter: Number(row.remaining_balance_after ?? row.remainingBalanceAfter ?? 0),
    isPaid: Boolean(row.is_paid ?? row.isPaid),
    paidDate: row.paid_date || row.paidDate || "",
    paidAmount: Number(row.paid_amount ?? row.paidAmount ?? 0),
    isManualOverride: Boolean(row.is_manual_override ?? row.isManualOverride),
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

/**
 * Create a new loan.
 * Only inserts the row in `loans`. No installment rows are created,
 * unless a custom first installment amount is specified (in which case
 * a single override row is created in `loan_installment_states`).
 *
 * @param {object} env
 * @param {string} userId
 * @param {object} data
 * @returns {Promise<object>} The created loan with its calculated installments
 */
export async function dbCreateLoan(env, userId, data) {
  if (!userId || !data) return null;
  if (!env || !env.DB) return null;

  await ensureD1Tables(env);

  const loanId = data.id || generateId("loan");
  const title = String(data.title || "").trim();
  const lenderName = String(data.lenderName || data.lender_name || "").trim();
  const principalAmount = Number(data.principalAmount ?? data.principal ?? 0);
  const annualInterestRate = Number(data.annualInterestRate ?? data.annualRatePct ?? 0);
  const installmentCount = parseInt(data.installmentCount ?? data.installment_count ?? 0, 10);
  const intervalMonths = parseInt(data.intervalMonths ?? data.interval_months ?? 1, 10);
  const startDate = String(data.startDate || data.start_date || new Date().toISOString().split("T")[0]).trim();
  const notes = String(data.notes || "").trim();
  const nowIso = new Date().toISOString();

  const insertLoanSql = `
    INSERT INTO loans (
      id, user_id, title, lender_name, principal_amount,
      annual_interest_rate, installment_count, interval_months,
      start_date, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const statements = [
    env.DB.prepare(insertLoanSql).bind(
      loanId,
      userId,
      title,
      lenderName,
      principalAmount,
      annualInterestRate,
      installmentCount,
      intervalMonths,
      startDate,
      notes,
      nowIso,
      nowIso
    ),
  ];

  // If customFirstInstallmentAmount was provided, insert ONLY that single override state for installment #1
  const customFirst = Number(
    data.customFirstInstallmentAmount ??
    data.custom_first_installment_amount ??
    data.firstInstallmentAmount
  );

  if (!isNaN(customFirst) && customFirst > 0) {
    const parsedStart = parseDateParts(startDate);
    const dueDate1 = computeClampedDueDate(parsedStart, 1, intervalMonths);
    const r = annualInterestRate > 0 ? (annualInterestRate / 100) * (intervalMonths / 12) : 0;
    const interestPortion = r > 0 ? Math.round(principalAmount * r) : 0;
    let principalPortion = customFirst - interestPortion;
    if (principalPortion < 0) principalPortion = 0;
    if (principalPortion > principalAmount) principalPortion = principalAmount;
    const actualTotal = principalPortion + interestPortion;
    const remainingBalanceAfter = principalAmount - principalPortion;

    const inst1Id = generateId("inst");
    const insertStateSql = `
      INSERT INTO loan_installment_states (
        id, loan_id, user_id, installment_number, due_date,
        principal_portion, interest_portion, total_amount,
        remaining_balance_after, is_paid, paid_date, paid_amount,
        is_manual_override, created_at, updated_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 0, '', 0, 1, ?, ?)
    `;
    statements.push(
      env.DB.prepare(insertStateSql).bind(
        inst1Id,
        loanId,
        userId,
        dueDate1,
        principalPortion,
        interestPortion,
        actualTotal,
        remainingBalanceAfter,
        nowIso,
        nowIso
      )
    );
  }

  try {
    if (typeof env.DB.batch === "function") {
      await env.DB.batch(statements);
    } else {
      for (const stmt of statements) {
        await stmt.run();
      }
    }

    return await dbGetLoanById(env, userId, loanId);
  } catch (e) {
    logger.error("D1 dbCreateLoan error:", { error: e.message, userId, loanId });
    throw e;
  }
}

/**
 * Fetch all loans for a user with computed metadata (totalCount, paidCount, remainingBalance, nextDueInstallment).
 * Uses 3 targeted queries + in-memory computeEffectiveSchedule to avoid heavy SQL JOINs.
 *
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function dbGetUserLoans(env, userId) {
  if (!userId || !env || !env.DB) return [];

  await ensureD1Tables(env);

  // NOTE: real errors are left to propagate (see dbGetLoanById for why) instead of being
  // swallowed into an empty array, which would be indistinguishable from "user genuinely has
  // no loans yet".
  {
    // 1. Fetch user loans
    const loansQuery = `
      SELECT id, user_id AS userId, title, lender_name AS lenderName,
             principal_amount AS principalAmount, annual_interest_rate AS annualInterestRate,
             installment_count AS installmentCount, interval_months AS intervalMonths,
             start_date AS startDate, notes, created_at AS createdAt, updated_at AS updatedAt
      FROM loans
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    const { results: rawLoans = [] } = await env.DB.prepare(loansQuery).bind(userId).all();
    if (rawLoans.length === 0) return [];

    // 2. Fetch all installment states for this user
    const statesQuery = `
      SELECT id, loan_id AS loanId, user_id AS userId,
             installment_number AS installmentNumber, due_date AS dueDate,
             principal_portion AS principalPortion, interest_portion AS interestPortion,
             total_amount AS totalAmount, remaining_balance_after AS remainingBalanceAfter,
             is_paid AS isPaid, paid_date AS paidDate, paid_amount AS paidAmount,
             is_manual_override AS isManualOverride,
             created_at AS createdAt, updated_at AS updatedAt
      FROM loan_installment_states
      WHERE user_id = ?
      ORDER BY loan_id, installment_number ASC
    `;
    const { results: rawStates = [] } = await env.DB.prepare(statesQuery).bind(userId).all();

    const statesByLoan = new Map();
    for (const r of rawStates) {
      const lid = r.loanId || r.loan_id;
      if (!statesByLoan.has(lid)) statesByLoan.set(lid, []);
      statesByLoan.get(lid).push(formatInstallmentRow(r));
    }

    // 3. Fetch all extra payments for this user
    const epQuery = `
      SELECT id, loan_id AS loanId, user_id AS userId,
             amount, payment_date AS paymentDate, reduction_mode AS reductionMode,
             notes, anchor_installment_number AS anchorInstallmentNumber,
             resulting_balance AS resultingBalance,
             resulting_installment_count AS resultingInstallmentCount,
             created_at AS createdAt
      FROM loan_extra_payments
      WHERE user_id = ?
      ORDER BY loan_id, payment_date ASC, created_at ASC
    `;
    const { results: rawEps = [] } = await env.DB.prepare(epQuery).bind(userId).all();

    const epsByLoan = new Map();
    for (const r of rawEps) {
      const lid = r.loanId || r.loan_id;
      if (!epsByLoan.has(lid)) epsByLoan.set(lid, []);
      epsByLoan.get(lid).push({
        ...r,
        amount: Number(r.amount || 0),
        anchorInstallmentNumber: Number(r.anchor_installment_number ?? r.anchorInstallmentNumber ?? 0),
        resultingBalance: Number(r.resulting_balance ?? r.resultingBalance ?? 0),
        resultingInstallmentCount: (r.resulting_installment_count || r.resultingInstallmentCount)
          ? Number(r.resulting_installment_count || r.resultingInstallmentCount)
          : null,
      });
    }

    return rawLoans.map((row) => {
      const loan = formatLoanRow(row);
      const states = statesByLoan.get(loan.id) || [];
      const eps = epsByLoan.get(loan.id) || [];

      const installments = computeEffectiveSchedule({
        loan,
        installmentStates: states,
        extraPayments: eps,
      });

      const paidCount = installments.filter((i) => i.isPaid).length;
      const totalCount = installments.length;
      const remainingBalance = installments
        .filter((i) => !i.isPaid)
        .reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
      const nextDueInstallment = installments.find((i) => !i.isPaid) || null;

      return {
        ...loan,
        totalCount,
        paidCount,
        remainingBalance,
        nextDueInstallment,
      };
    });
  }
}

/**
 * Fetch a single loan by ID with its full calculated installment list
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} loanId
 * @returns {Promise<object|null>}
 */
export async function dbGetLoanById(env, userId, loanId) {
  if (!userId || !loanId || !env || !env.DB) return null;

  await ensureD1Tables(env);

  // NOTE: only the "loan does not exist" case returns null (a legitimate, expected outcome
  // callers rely on to throw a 404). Any other failure (bad query, computeEffectiveSchedule
  // throwing, etc.) is deliberately left to propagate instead of being swallowed here — an
  // uncaught error surfaces as a real 500 with the actual message via handleRouteError, which
  // is far more debuggable than silently returning null and having callers misreport it as
  // "loan not found" (e.g. dbCreateLoan would otherwise return { success: true, loan: null }).
  const loanQuery = `
    SELECT id, user_id AS userId, title, lender_name AS lenderName,
           principal_amount AS principalAmount, annual_interest_rate AS annualInterestRate,
           installment_count AS installmentCount, interval_months AS intervalMonths,
           start_date AS startDate, notes, created_at AS createdAt, updated_at AS updatedAt
    FROM loans
    WHERE id = ? AND user_id = ?
  `;
  const loanRow = await env.DB.prepare(loanQuery).bind(loanId, userId).first();
  if (!loanRow) return null;

  const formattedLoan = formatLoanRow(loanRow);

  const statesQuery = `
    SELECT id, loan_id AS loanId, user_id AS userId,
           installment_number AS installmentNumber, due_date AS dueDate,
           principal_portion AS principalPortion, interest_portion AS interestPortion,
           total_amount AS totalAmount, remaining_balance_after AS remainingBalanceAfter,
           is_paid AS isPaid, paid_date AS paidDate, paid_amount AS paidAmount,
           is_manual_override AS isManualOverride,
           created_at AS createdAt, updated_at AS updatedAt
    FROM loan_installment_states
    WHERE loan_id = ? AND user_id = ?
    ORDER BY installment_number ASC
  `;
  const { results: rawStates = [] } = await env.DB.prepare(statesQuery).bind(loanId, userId).all();
  const installmentStates = rawStates.map(formatInstallmentRow);

  const epQuery = `
    SELECT id, loan_id AS loanId, user_id AS userId,
           amount, payment_date AS paymentDate, reduction_mode AS reductionMode,
           notes, anchor_installment_number AS anchorInstallmentNumber,
           resulting_balance AS resultingBalance,
           resulting_installment_count AS resultingInstallmentCount,
           created_at AS createdAt
    FROM loan_extra_payments
    WHERE loan_id = ? AND user_id = ?
    ORDER BY payment_date ASC, created_at ASC
  `;
  const { results: rawEps = [] } = await env.DB.prepare(epQuery).bind(loanId, userId).all();
  const extraPayments = rawEps.map((row) => ({
    ...row,
    amount: Number(row.amount || 0),
    anchorInstallmentNumber: Number(row.anchor_installment_number ?? row.anchorInstallmentNumber ?? 0),
    resultingBalance: Number(row.resulting_balance ?? row.resultingBalance ?? 0),
    resultingInstallmentCount: (row.resulting_installment_count || row.resultingInstallmentCount)
      ? Number(row.resulting_installment_count || row.resultingInstallmentCount)
      : null,
  }));

  const installments = computeEffectiveSchedule({
    loan: formattedLoan,
    installmentStates,
    extraPayments,
  });

  const paidCount = installments.filter((i) => i.isPaid).length;
  const totalCount = installments.length;
  const remainingBalance = installments
    .filter((i) => !i.isPaid)
    .reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
  const nextDueInstallment = installments.find((i) => !i.isPaid) || null;

  return {
    ...formattedLoan,
    totalCount,
    paidCount,
    remainingBalance,
    nextDueInstallment,
    installments,
    extraPayments,
  };
}

/**
 * Update loan details.
 * If financial parameters change, clears unpaid manual override states.
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} loanId
 * @param {object} data
 * @returns {Promise<object|null>}
 */
export async function dbUpdateLoan(env, userId, loanId, data) {
  if (!userId || !loanId || !data) return null;
  if (!env || !env.DB) return null;

  await ensureD1Tables(env);

  const existingLoan = await dbGetLoanById(env, userId, loanId);
  if (!existingLoan) return null;

  const newTitle = data.title !== undefined ? String(data.title).trim() : existingLoan.title;
  const newLenderName = data.lenderName !== undefined
    ? String(data.lenderName).trim()
    : data.lender_name !== undefined
    ? String(data.lender_name).trim()
    : existingLoan.lenderName;
  const newNotes = data.notes !== undefined ? String(data.notes).trim() : existingLoan.notes;
  const nowIso = new Date().toISOString();

  const newPrincipal = data.principalAmount !== undefined
    ? Number(data.principalAmount)
    : data.principal !== undefined
    ? Number(data.principal)
    : existingLoan.principalAmount;

  const newRate = data.annualInterestRate !== undefined
    ? Number(data.annualInterestRate)
    : data.annualRatePct !== undefined
    ? Number(data.annualRatePct)
    : existingLoan.annualInterestRate;

  const newCount = data.installmentCount !== undefined
    ? parseInt(data.installmentCount, 10)
    : data.installment_count !== undefined
    ? parseInt(data.installment_count, 10)
    : existingLoan.installmentCount;

  const newInterval = data.intervalMonths !== undefined
    ? parseInt(data.intervalMonths, 10)
    : data.interval_months !== undefined
    ? parseInt(data.interval_months, 10)
    : existingLoan.intervalMonths;

  const newStartDate = data.startDate !== undefined
    ? String(data.startDate).trim()
    : data.start_date !== undefined
    ? String(data.start_date).trim()
    : existingLoan.startDate;

  const financialParamsChanged =
    newPrincipal !== existingLoan.principalAmount ||
    newRate !== existingLoan.annualInterestRate ||
    newCount !== existingLoan.installmentCount ||
    newInterval !== existingLoan.intervalMonths ||
    newStartDate !== existingLoan.startDate;

  const statements = [];

  const updateLoanSql = `
    UPDATE loans
    SET title = ?, lender_name = ?, principal_amount = ?,
        annual_interest_rate = ?, installment_count = ?,
        interval_months = ?, start_date = ?, notes = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `;
  statements.push(
    env.DB.prepare(updateLoanSql).bind(
      newTitle,
      newLenderName,
      newPrincipal,
      newRate,
      newCount,
      newInterval,
      newStartDate,
      newNotes,
      nowIso,
      loanId,
      userId
    )
  );

  if (financialParamsChanged) {
    // In the event-sourcing design, clear unpaid override states beyond paid installments
    const deletePendingStatesSql = `
      DELETE FROM loan_installment_states
      WHERE loan_id = ? AND user_id = ? AND is_paid = 0
    `;
    statements.push(env.DB.prepare(deletePendingStatesSql).bind(loanId, userId));
  }

  try {
    if (typeof env.DB.batch === "function") {
      await env.DB.batch(statements);
    } else {
      for (const stmt of statements) {
        await stmt.run();
      }
    }
    return await dbGetLoanById(env, userId, loanId);
  } catch (e) {
    logger.error("D1 dbUpdateLoan error:", { error: e.message, userId, loanId });
    throw e;
  }
}

/**
 * Delete a loan and all its installment states and extra payments.
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} loanId
 * @returns {Promise<boolean>}
 */
export async function dbDeleteLoan(env, userId, loanId) {
  if (!userId || !loanId || !env || !env.DB) return false;

  await ensureD1Tables(env);

  try {
    const deleteStatesSql = `DELETE FROM loan_installment_states WHERE loan_id = ? AND user_id = ?`;
    const deleteEpSql = `DELETE FROM loan_extra_payments WHERE loan_id = ? AND user_id = ?`;
    const deleteLoanSql = `DELETE FROM loans WHERE id = ? AND user_id = ?`;

    const statements = [
      env.DB.prepare(deleteStatesSql).bind(loanId, userId),
      env.DB.prepare(deleteEpSql).bind(loanId, userId),
      env.DB.prepare(deleteLoanSql).bind(loanId, userId),
    ];

    if (typeof env.DB.batch === "function") {
      await env.DB.batch(statements);
    } else {
      for (const stmt of statements) {
        await stmt.run();
      }
    }
    return true;
  } catch (e) {
    logger.error("D1 dbDeleteLoan error:", { error: e.message, userId, loanId });
    return false;
  }
}

/**
 * Mark an installment as paid.
 * If a state row does not exist for this installment yet, computes its financial portions
 * via computeEffectiveSchedule and INSERTs it with is_paid = 1.
 * If a state row already exists (e.g. was previously overridden), UPDATEs it with is_paid = 1.
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} installmentId
 * @param {object} [details={}]
 * @param {string} [details.paidDate]
 * @param {number} [details.paidAmount]
 * @param {string} [details.loanId]
 * @returns {Promise<object|null>} The updated installment
 */
export async function dbMarkInstallmentPaid(env, userId, installmentId, details = {}) {
  if (!userId || !installmentId || !env || !env.DB) return null;

  await ensureD1Tables(env);

  try {
    const nowIso = new Date().toISOString();
    let instNumArg = !isNaN(Number(installmentId)) ? Number(installmentId) : -1;
    if (instNumArg === -1 && typeof installmentId === "string") {
      const match = installmentId.match(/_(\d+)$/);
      if (match) {
        instNumArg = parseInt(match[1], 10);
      }
    }

    // 1. Check if a row already exists in loan_installment_states
    const existingStateQuery = `
      SELECT id, loan_id AS loanId, user_id AS userId, installment_number AS installmentNumber,
             due_date AS dueDate, principal_portion AS principalPortion, interest_portion AS interestPortion,
             total_amount AS totalAmount, remaining_balance_after AS remainingBalanceAfter,
             is_paid AS isPaid, paid_date AS paidDate, paid_amount AS paidAmount,
             is_manual_override AS isManualOverride,
             created_at AS createdAt, updated_at AS updatedAt
      FROM loan_installment_states
      WHERE (id = ? OR installment_number = ?) AND user_id = ?
    `;
    const existingRow = await env.DB.prepare(existingStateQuery).bind(installmentId, instNumArg, userId).first();

    if (existingRow) {
      const paidDate = details.paidDate || details.paid_date || nowIso.split("T")[0];
      const paidAmount = details.paidAmount !== undefined && details.paidAmount !== null
        ? Number(details.paidAmount)
        : Number(existingRow.totalAmount || existingRow.total_amount || 0);

      const updateSql = `
        UPDATE loan_installment_states
        SET is_paid = 1, paid_date = ?, paid_amount = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `;
      await env.DB.prepare(updateSql).bind(paidDate, paidAmount, nowIso, existingRow.id, userId).run();

      return formatInstallmentRow({
        ...existingRow,
        is_paid: 1,
        paid_date: paidDate,
        paid_amount: paidAmount,
        updated_at: nowIso,
      });
    }

    // 2. If no row exists yet, resolve loan and find installment via computeEffectiveSchedule
    let loanId = details.loanId || details.loan_id;
    if (!loanId && typeof installmentId === "string" && installmentId.startsWith("inst_")) {
      const parts = installmentId.split("_");
      if (parts.length >= 3) {
        loanId = parts.slice(1, parts.length - 1).join("_");
      }
    }

    let loan = null;
    if (loanId) {
      loan = await dbGetLoanById(env, userId, loanId);
    } else {
      const userLoans = await dbGetUserLoans(env, userId);
      for (const ul of userLoans) {
        const fullLoan = await dbGetLoanById(env, userId, ul.id);
        if (fullLoan?.installments?.some((i) => i.id === installmentId || String(i.installmentNumber) === String(installmentId))) {
          loan = fullLoan;
          loanId = ul.id;
          break;
        }
      }
    }

    if (!loan) {
      return null;
    }

    const targetInst = loan.installments.find(
      (i) => i.id === installmentId || String(i.installmentNumber) === String(installmentId)
    );
    if (!targetInst) {
      return null;
    }

    const paidDate = details.paidDate || details.paid_date || nowIso.split("T")[0];
    const paidAmount = details.paidAmount !== undefined && details.paidAmount !== null
      ? Number(details.paidAmount)
      : targetInst.totalAmount;

    const newInstId = installmentId.startsWith("inst_") && !installmentId.includes("loan_")
      ? installmentId
      : targetInst.id || generateId("inst");

    const insertSql = `
      INSERT INTO loan_installment_states (
        id, loan_id, user_id, installment_number, due_date,
        principal_portion, interest_portion, total_amount,
        remaining_balance_after, is_paid, paid_date, paid_amount,
        is_manual_override, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?)
    `;

    await env.DB.prepare(insertSql).bind(
      newInstId,
      loanId,
      userId,
      targetInst.installmentNumber,
      targetInst.dueDate,
      targetInst.principalPortion,
      targetInst.interestPortion,
      targetInst.totalAmount,
      targetInst.remainingBalanceAfter,
      paidDate,
      paidAmount,
      nowIso,
      nowIso
    ).run();

    return {
      ...targetInst,
      id: newInstId,
      loanId,
      userId,
      isPaid: true,
      paidDate,
      paidAmount,
      isManualOverride: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  } catch (e) {
    logger.error("D1 dbMarkInstallmentPaid error:", { error: e.message, userId, installmentId });
    return null;
  }
}

/**
 * Reset an installment back to unpaid.
 * If the row has no manual override (it was a simple payment), DELETES the row entirely
 * so it returns to being purely dynamically computed.
 * If it has a manual override, resets is_paid=0, paid_date='', paid_amount=0 while preserving the override.
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} installmentId
 * @returns {Promise<object|null>}
 */
export async function dbUnmarkInstallmentPaid(env, userId, installmentId) {
  if (!userId || !installmentId || !env || !env.DB) return null;

  await ensureD1Tables(env);

  try {
    const nowIso = new Date().toISOString();
    let instNumArg = !isNaN(Number(installmentId)) ? Number(installmentId) : -1;
    if (instNumArg === -1 && typeof installmentId === "string") {
      const match = installmentId.match(/_(\d+)$/);
      if (match) {
        instNumArg = parseInt(match[1], 10);
      }
    }

    const selectQuery = `
      SELECT id, loan_id AS loanId, user_id AS userId, installment_number AS installmentNumber,
             due_date AS dueDate, principal_portion AS principalPortion, interest_portion AS interestPortion,
             total_amount AS totalAmount, remaining_balance_after AS remainingBalanceAfter,
             is_paid AS isPaid, paid_date AS paidDate, paid_amount AS paidAmount,
             is_manual_override AS isManualOverride,
             created_at AS createdAt, updated_at AS updatedAt
      FROM loan_installment_states
      WHERE (id = ? OR installment_number = ?) AND user_id = ?
    `;
    const existing = await env.DB.prepare(selectQuery).bind(installmentId, instNumArg, userId).first();
    if (!existing) {
      return {
        id: installmentId,
        isPaid: false,
        paidDate: "",
        paidAmount: 0,
      };
    }

    const hasOverride = Boolean(existing.isManualOverride || existing.is_manual_override);

    if (hasOverride) {
      const updateSql = `
        UPDATE loan_installment_states
        SET is_paid = 0, paid_date = '', paid_amount = 0, updated_at = ?
        WHERE id = ? AND user_id = ?
      `;
      await env.DB.prepare(updateSql).bind(nowIso, existing.id, userId).run();
      return formatInstallmentRow({
        ...existing,
        is_paid: 0,
        paid_date: "",
        paid_amount: 0,
        updated_at: nowIso,
      });
    } else {
      const deleteSql = `DELETE FROM loan_installment_states WHERE id = ? AND user_id = ?`;
      await env.DB.prepare(deleteSql).bind(existing.id, userId).run();
      return formatInstallmentRow({
        ...existing,
        is_paid: 0,
        paid_date: "",
        paid_amount: 0,
        updated_at: nowIso,
      });
    }
  } catch (e) {
    logger.error("D1 dbUnmarkInstallmentPaid error:", { error: e.message, userId, installmentId });
    return null;
  }
}

/**
 * Mark an installment as paid with automatic cascading payment of all prior unpaid installments.
 * Uses computeEffectiveSchedule values for any installments without pre-existing state rows.
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} loanId
 * @param {string} installmentId
 * @param {object} [details={}]
 * @returns {Promise<{ installment: object, cascadedInstallments: Array<object>, cascadedCount: number, cascadedTotal: number }>}
 */
export async function dbMarkInstallmentPaidCascade(env, userId, loanId, installmentId, details = {}) {
  if (!userId || !loanId || !installmentId || !env || !env.DB) {
    throw AppError.badRequest("پارامترهای درخواست ناقص است.");
  }

  await ensureD1Tables(env);

  const loan = await dbGetLoanById(env, userId, loanId);
  if (!loan) {
    throw AppError.notFound("وام مورد نظر یافت نشد.");
  }

  const targetInst = loan.installments.find(
    (i) => i.id === installmentId || String(i.installmentNumber) === String(installmentId)
  );
  if (!targetInst) {
    throw AppError.notFound("قسط مورد نظر یافت نشد.");
  }
  if (targetInst.isPaid) {
    throw AppError.badRequest("این قسط قبلاً پرداخت شده است.");
  }

  const priorUnpaid = loan.installments.filter(
    (i) => i.installmentNumber < targetInst.installmentNumber && !i.isPaid
  );

  const { results: existingRows = [] } = await env.DB.prepare(
    `SELECT * FROM loan_installment_states WHERE loan_id = ? AND user_id = ?`
  ).bind(loanId, userId).all();

  const existingMap = new Map();
  for (const r of existingRows) {
    existingMap.set(r.installment_number || r.installmentNumber, r);
  }

  const nowIso = new Date().toISOString();
  const targetPaidDate = details.paidDate || details.paid_date || nowIso.split("T")[0];
  const targetPaidAmount = details.paidAmount !== undefined && details.paidAmount !== null
    ? Number(details.paidAmount)
    : targetInst.totalAmount;

  const statements = [];
  const cascadedInstallments = [];
  let cascadedTotal = 0;

  const updateSql = `
    UPDATE loan_installment_states
    SET is_paid = 1, paid_date = ?, paid_amount = ?, updated_at = ?
    WHERE id = ? AND loan_id = ? AND user_id = ?
  `;

  const insertSql = `
    INSERT INTO loan_installment_states (
      id, loan_id, user_id, installment_number, due_date,
      principal_portion, interest_portion, total_amount,
      remaining_balance_after, is_paid, paid_date, paid_amount,
      is_manual_override, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 0, ?, ?)
  `;

  // 1. Process target installment
  if (existingMap.has(targetInst.installmentNumber)) {
    const row = existingMap.get(targetInst.installmentNumber);
    statements.push(env.DB.prepare(updateSql).bind(targetPaidDate, targetPaidAmount, nowIso, row.id, loanId, userId));
  } else {
    const newId = targetInst.id && !targetInst.id.startsWith("inst_") ? targetInst.id : generateId("inst");
    statements.push(
      env.DB.prepare(insertSql).bind(
        newId,
        loanId,
        userId,
        targetInst.installmentNumber,
        targetInst.dueDate,
        targetInst.principalPortion,
        targetInst.interestPortion,
        targetInst.totalAmount,
        targetInst.remainingBalanceAfter,
        targetPaidDate,
        targetPaidAmount,
        nowIso,
        nowIso
      )
    );
  }

  // 2. Process prior unpaid installments
  for (const prior of priorUnpaid) {
    const pDate = prior.dueDate;
    const pAmount = prior.totalAmount;
    cascadedTotal += pAmount;

    if (existingMap.has(prior.installmentNumber)) {
      const row = existingMap.get(prior.installmentNumber);
      statements.push(env.DB.prepare(updateSql).bind(pDate, pAmount, nowIso, row.id, loanId, userId));
    } else {
      const newId = prior.id && !prior.id.startsWith("inst_") ? prior.id : generateId("inst");
      statements.push(
        env.DB.prepare(insertSql).bind(
          newId,
          loanId,
          userId,
          prior.installmentNumber,
          prior.dueDate,
          prior.principalPortion,
          prior.interestPortion,
          prior.totalAmount,
          prior.remainingBalanceAfter,
          pDate,
          pAmount,
          nowIso,
          nowIso
        )
      );
    }

    cascadedInstallments.push({
      ...prior,
      isPaid: true,
      paidDate: pDate,
      paidAmount: pAmount,
      updatedAt: nowIso,
    });
  }

  if (typeof env.DB.batch === "function") {
    await env.DB.batch(statements);
  } else {
    for (const stmt of statements) {
      await stmt.run();
    }
  }

  const updatedTarget = {
    ...targetInst,
    isPaid: true,
    paidDate: targetPaidDate,
    paidAmount: targetPaidAmount,
    updatedAt: nowIso,
  };

  return {
    installment: updatedTarget,
    cascadedInstallments,
    cascadedCount: cascadedInstallments.length,
    cascadedTotal,
  };
}

/**
 * Manually set the installment amount for an unpaid installment.
 * Writes ONLY the single override row in `loan_installment_states`.
 * Subsequent installments are dynamically recalculated by computeEffectiveSchedule.
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} loanId
 * @param {string} installmentId
 * @param {number} newTotalAmount
 * @returns {Promise<{ loan: object, installment: object, actualTotalAmount: number }>}
 */
export async function dbSetInstallmentAmount(env, userId, loanId, installmentId, newTotalAmount) {
  if (!userId || !loanId || !installmentId || !env || !env.DB) {
    throw AppError.badRequest("پارامترهای درخواست ناقص است.");
  }

  const targetAmount = Number(newTotalAmount);
  if (isNaN(targetAmount) || targetAmount <= 0) {
    throw AppError.badRequest("مبلغ قسط باید عددی بزرگتر از صفر باشد.");
  }

  await ensureD1Tables(env);

  const loan = await dbGetLoanById(env, userId, loanId);
  if (!loan) {
    throw AppError.notFound("وام مورد نظر یافت نشد.");
  }

  const installments = [...loan.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
  const targetIdx = installments.findIndex(
    (inst) => inst.id === installmentId || String(inst.installmentNumber) === String(installmentId)
  );

  if (targetIdx === -1) {
    throw AppError.notFound("قسط مورد نظر یافت نشد.");
  }

  const targetInst = installments[targetIdx];
  if (targetInst.isPaid) {
    throw AppError.badRequest("امکان ویرایش قسط پرداخت‌شده وجود ندارد.");
  }

  const balanceBefore = targetIdx === 0
    ? loan.principalAmount
    : installments[targetIdx - 1].remainingBalanceAfter;

  const interval = loan.intervalMonths || 1;
  const rate = loan.annualInterestRate || 0;
  const r = rate > 0 ? (rate / 100) * (interval / 12) : 0;

  const newInterestPortion = r > 0 ? Math.round(balanceBefore * r) : 0;
  let newPrincipalPortion = targetAmount - newInterestPortion;
  if (newPrincipalPortion < 0) newPrincipalPortion = 0;
  if (newPrincipalPortion > balanceBefore) newPrincipalPortion = balanceBefore;

  const actualTotalAmount = newPrincipalPortion + newInterestPortion;
  const newRemainingBalanceAfter = balanceBefore - newPrincipalPortion;
  const nowIso = new Date().toISOString();

  // Check if state row exists for this installment
  const existingState = await env.DB.prepare(
    `SELECT id FROM loan_installment_states WHERE loan_id = ? AND user_id = ? AND installment_number = ?`
  ).bind(loanId, userId, targetInst.installmentNumber).first();

  if (existingState) {
    const updateSql = `
      UPDATE loan_installment_states
      SET principal_portion = ?, interest_portion = ?, total_amount = ?,
          remaining_balance_after = ?, is_manual_override = 1, updated_at = ?
      WHERE id = ? AND loan_id = ? AND user_id = ?
    `;
    await env.DB.prepare(updateSql).bind(
      newPrincipalPortion,
      newInterestPortion,
      actualTotalAmount,
      newRemainingBalanceAfter,
      nowIso,
      existingState.id,
      loanId,
      userId
    ).run();
  } else {
    const instId = targetInst.id || generateId("inst");
    const insertSql = `
      INSERT INTO loan_installment_states (
        id, loan_id, user_id, installment_number, due_date,
        principal_portion, interest_portion, total_amount,
        remaining_balance_after, is_paid, paid_date, paid_amount,
        is_manual_override, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', 0, 1, ?, ?)
    `;
    await env.DB.prepare(insertSql).bind(
      instId,
      loanId,
      userId,
      targetInst.installmentNumber,
      targetInst.dueDate,
      newPrincipalPortion,
      newInterestPortion,
      actualTotalAmount,
      newRemainingBalanceAfter,
      nowIso,
      nowIso
    ).run();
  }

  const updatedLoan = await dbGetLoanById(env, userId, loanId);
  const updatedInst = updatedLoan?.installments?.find(
    (i) => i.id === targetInst.id || i.installmentNumber === targetInst.installmentNumber
  ) || null;

  return {
    loan: updatedLoan,
    installment: updatedInst,
    actualTotalAmount,
  };
}

/**
 * Add an extra (lump sum) payment to a loan.
 * Writes ONLY the single row in `loan_extra_payments` with cached anchor & resulting balances.
 * No subsequent installments are deleted or re-inserted.
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} loanId
 * @param {object} options
 * @param {number} options.amount
 * @param {string} options.paymentDate
 * @param {'reduce_amount'|'reduce_term'} [options.reductionMode='reduce_amount']
 * @param {string} [options.notes='']
 * @returns {Promise<{ success: boolean, fullyPaidOff: boolean, extraPayment: object, loan: object }>}
 */
export async function dbAddExtraPayment(env, userId, loanId, {
  amount,
  paymentDate,
  reductionMode = "reduce_amount",
  notes = "",
}) {
  if (!userId || !loanId || !env || !env.DB) {
    throw AppError.badRequest("پارامترهای درخواست ناقص است.");
  }

  const payAmount = Number(amount);
  if (isNaN(payAmount) || payAmount <= 0) {
    throw AppError.badRequest("مبلغ پرداخت اضافه باید عددی بزرگتر از صفر باشد.");
  }
  if (!paymentDate) {
    throw AppError.badRequest("تاریخ پرداخت اضافه الزامی است.");
  }

  const mode = reductionMode === "reduce_term" ? "reduce_term" : "reduce_amount";

  await ensureD1Tables(env);

  const loan = await dbGetLoanById(env, userId, loanId);
  if (!loan) {
    throw AppError.notFound("وام مورد نظر یافت نشد.");
  }

  const paidInstallments = loan.installments.filter((inst) => inst.isPaid);
  const paidCount = paidInstallments.length;

  let currentBalance = loan.principalAmount;
  if (paidCount > 0) {
    const lastPaid = paidInstallments[paidCount - 1];
    currentBalance = Number(lastPaid.remainingBalanceAfter) || 0;
  }

  const resultingBalance = Math.max(0, currentBalance - payAmount);
  const fullyPaidOff = resultingBalance === 0;

  let resultingInstallmentCount = null;
  if (mode === "reduce_term" && resultingBalance > 0) {
    const pendingInstallments = loan.installments.filter((inst) => !inst.isPaid);
    let fixedAmount = 0;
    if (pendingInstallments.length > 0 && pendingInstallments[0].totalAmount > 0) {
      fixedAmount = pendingInstallments[0].totalAmount;
    } else {
      fixedAmount = calculateFixedInstallmentAmount({
        principal: loan.principalAmount,
        annualRatePct: loan.annualInterestRate,
        installmentCount: loan.installmentCount,
        intervalMonths: loan.intervalMonths,
      });
    }

    const payoffSchedule = calculatePayoffScheduleFixedAmount({
      remainingBalance: resultingBalance,
      fixedInstallmentAmount: fixedAmount,
      annualRatePct: loan.annualInterestRate,
      intervalMonths: loan.intervalMonths,
      startDateIso: loan.startDate,
      anchorInstallmentNumber: paidCount,
    });
    resultingInstallmentCount = paidCount + payoffSchedule.length;
  }

  const nowIso = new Date().toISOString();
  const paymentId = generateId("epay");

  const insertPaymentSql = `
    INSERT INTO loan_extra_payments (
      id, loan_id, user_id, amount, payment_date, reduction_mode, notes,
      anchor_installment_number, resulting_balance, resulting_installment_count, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await env.DB.prepare(insertPaymentSql).bind(
    paymentId,
    loanId,
    userId,
    payAmount,
    String(paymentDate).trim(),
    mode,
    String(notes || "").trim(),
    paidCount,
    resultingBalance,
    resultingInstallmentCount,
    nowIso
  ).run();

  if (fullyPaidOff || mode === "reduce_term") {
    const newCount = fullyPaidOff ? paidCount : resultingInstallmentCount;
    const updateLoanCountSql = `UPDATE loans SET installment_count = ?, updated_at = ? WHERE id = ? AND user_id = ?`;
    await env.DB.prepare(updateLoanCountSql).bind(newCount, nowIso, loanId, userId).run();
  }

  const updatedLoan = await dbGetLoanById(env, userId, loanId);

  return {
    success: true,
    fullyPaidOff,
    extraPayment: {
      id: paymentId,
      loanId,
      userId,
      amount: payAmount,
      paymentDate: String(paymentDate).trim(),
      reductionMode: mode,
      notes: String(notes || "").trim(),
      anchorInstallmentNumber: paidCount,
      resultingBalance,
      resultingInstallmentCount,
      createdAt: nowIso,
    },
    loan: updatedLoan,
  };
}

/**
 * Fetch all extra payments recorded for a loan
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} loanId
 * @returns {Promise<Array<object>>}
 */
export async function dbGetLoanExtraPayments(env, userId, loanId) {
  if (!userId || !loanId || !env || !env.DB) return [];

  await ensureD1Tables(env);

  try {
    const query = `
      SELECT id, loan_id AS loanId, user_id AS userId,
             amount, payment_date AS paymentDate, reduction_mode AS reductionMode,
             notes, anchor_installment_number AS anchorInstallmentNumber,
             resulting_balance AS resultingBalance,
             resulting_installment_count AS resultingInstallmentCount,
             created_at AS createdAt
      FROM loan_extra_payments
      WHERE loan_id = ? AND user_id = ?
      ORDER BY payment_date DESC, created_at DESC
    `;
    const { results = [] } = await env.DB.prepare(query).bind(loanId, userId).all();
    return results.map((row) => ({
      ...row,
      amount: Number(row.amount || 0),
      anchorInstallmentNumber: Number(row.anchorInstallmentNumber || 0),
      resultingBalance: Number(row.resultingBalance || 0),
      resultingInstallmentCount: row.resultingInstallmentCount ? Number(row.resultingInstallmentCount) : null,
    }));
  } catch (e) {
    logger.error("D1 dbGetLoanExtraPayments error:", { error: e.message, userId, loanId });
    return [];
  }
}
