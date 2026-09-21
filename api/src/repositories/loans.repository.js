/**
 * loans.repository.js — Cloudflare D1 Data Access Layer for Loans & Installments
 *
 * Implements:
 * - dbCreateLoan: creates loan + batch inserts all installments via generateAmortizationSchedule
 * - dbGetUserLoans: lists user loans with aggregate totals (paidCount, totalCount, remainingBalance, nextDueInstallment)
 * - dbGetLoanById: retrieves loan details and its full installment list
 * - dbUpdateLoan: updates loan info; if financial parameters change, rebuilds ONLY pending installments (is_paid=0)
 * - dbDeleteLoan: cascades deletion of loan and its installments
 * - dbMarkInstallmentPaid: marks an installment as paid with paidDate and paidAmount
 * - dbUnmarkInstallmentPaid: resets an installment back to unpaid (is_paid=0)
 */

import { ensureD1Tables } from "./migration.repository.js";
import { logger } from "../lib/logger.js";
import {
  generateAmortizationSchedule,
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
 * Format raw SQL installment row into camelCase object
 */
function formatInstallmentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    loanId: row.loan_id || row.loanId,
    userId: row.user_id || row.userId,
    installmentNumber: parseInt(row.installment_number ?? row.installmentNumber ?? 0, 10),
    dueDate: row.due_date || row.dueDate,
    principalPortion: Number(row.principal_portion ?? row.principalPortion ?? 0),
    interestPortion: Number(row.interest_portion ?? row.interestPortion ?? 0),
    totalAmount: Number(row.total_amount ?? row.totalAmount ?? 0),
    remainingBalanceAfter: Number(row.remaining_balance_after ?? row.remainingBalanceAfter ?? 0),
    isPaid: Boolean(row.is_paid ?? row.isPaid),
    paidDate: row.paid_date || row.paidDate || "",
    paidAmount: Number(row.paid_amount ?? row.paidAmount ?? 0),
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

/**
 * Create a new loan and batch-insert all its installments.
 *
 * @param {object} env
 * @param {string} userId
 * @param {object} data
 * @returns {Promise<object>} The created loan with its installments
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

  // Generate initial amortization schedule
  const schedule = generateAmortizationSchedule({
    principal: principalAmount,
    annualRatePct: annualInterestRate,
    installmentCount,
    startDateIso: startDate,
    intervalMonths,
  });

  const insertLoanSql = `
    INSERT INTO loans (
      id, user_id, title, lender_name, principal_amount,
      annual_interest_rate, installment_count, interval_months,
      start_date, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const insertInstallmentSql = `
    INSERT INTO loan_installments (
      id, loan_id, user_id, installment_number, due_date,
      principal_portion, interest_portion, total_amount,
      remaining_balance_after, is_paid, paid_date, paid_amount,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const statements = [];
  statements.push(
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
    )
  );

  const installments = [];
  for (const item of schedule) {
    const instId = generateId("inst");
    const instRecord = {
      id: instId,
      loanId,
      userId,
      installmentNumber: item.installmentNumber,
      dueDate: item.dueDateIso,
      principalPortion: item.principalPortion,
      interestPortion: item.interestPortion,
      totalAmount: item.totalAmount,
      remainingBalanceAfter: item.remainingBalanceAfter,
      isPaid: false,
      paidDate: "",
      paidAmount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    installments.push(instRecord);

    statements.push(
      env.DB.prepare(insertInstallmentSql).bind(
        instId,
        loanId,
        userId,
        item.installmentNumber,
        item.dueDateIso,
        item.principalPortion,
        item.interestPortion,
        item.totalAmount,
        item.remainingBalanceAfter,
        0,
        "",
        0,
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

    return {
      id: loanId,
      userId,
      title,
      lenderName,
      principalAmount,
      annualInterestRate,
      installmentCount,
      intervalMonths,
      startDate,
      notes,
      createdAt: nowIso,
      updatedAt: nowIso,
      installments,
    };
  } catch (e) {
    logger.error("D1 dbCreateLoan error:", { error: e.message, userId, loanId });
    throw e;
  }
}

/**
 * Fetch all loans for a user with aggregated metadata (totalCount, paidCount, remainingBalance, nextDueInstallment)
 * to prevent N+1 queries.
 *
 * @param {object} env
 * @param {string} userId
 * @returns {Promise<Array<object>>}
 */
export async function dbGetUserLoans(env, userId) {
  if (!userId || !env || !env.DB) return [];

  await ensureD1Tables(env);

  try {
    // 1. Fetch loans with aggregated counts and remaining unpaid balance
    const aggregateQuery = `
      SELECT
        l.id,
        l.user_id AS userId,
        l.title,
        l.lender_name AS lenderName,
        l.principal_amount AS principalAmount,
        l.annual_interest_rate AS annualInterestRate,
        l.installment_count AS installmentCount,
        l.interval_months AS intervalMonths,
        l.start_date AS startDate,
        l.notes,
        l.created_at AS createdAt,
        l.updated_at AS updatedAt,
        COUNT(i.id) AS totalCount,
        SUM(CASE WHEN i.is_paid = 1 THEN 1 ELSE 0 END) AS paidCount,
        COALESCE(SUM(CASE WHEN i.is_paid = 0 THEN i.total_amount ELSE 0 END), 0) AS remainingBalance
      FROM loans l
      LEFT JOIN loan_installments i ON l.id = i.loan_id
      WHERE l.user_id = ?
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `;

    const { results: rawLoans } = await env.DB.prepare(aggregateQuery).bind(userId).all();
    if (!Array.isArray(rawLoans) || rawLoans.length === 0) {
      return [];
    }

    // 2. Efficiently fetch next upcoming unpaid installment for all user's loans (single query, no N+1)
    const nextDueQuery = `
      SELECT id, loan_id AS loanId, installment_number AS installmentNumber,
             due_date AS dueDate, total_amount AS totalAmount,
             principal_portion AS principalPortion, interest_portion AS interestPortion
      FROM loan_installments
      WHERE user_id = ? AND is_paid = 0
      ORDER BY installment_number ASC
    `;

    const { results: rawUnpaid } = await env.DB.prepare(nextDueQuery).bind(userId).all();
    const nextDueMap = new Map();
    if (Array.isArray(rawUnpaid)) {
      for (const item of rawUnpaid) {
        const lId = item.loanId || item.loan_id;
        if (!nextDueMap.has(lId)) {
          nextDueMap.set(lId, {
            id: item.id,
            installmentNumber: parseInt(item.installmentNumber || item.installment_number || 0, 10),
            dueDate: item.dueDate || item.due_date,
            totalAmount: Number(item.totalAmount || item.total_amount || 0),
            principalPortion: Number(item.principalPortion || item.principal_portion || 0),
            interestPortion: Number(item.interestPortion || item.interest_portion || 0),
          });
        }
      }
    }

    return rawLoans.map((row) => {
      const loan = formatLoanRow(row);
      const totalCount = parseInt(row.totalCount ?? 0, 10);
      const paidCount = parseInt(row.paidCount ?? 0, 10);
      const remainingBalance = Number(row.remainingBalance ?? 0);
      const nextDueInstallment = nextDueMap.get(loan.id) || null;

      return {
        ...loan,
        totalCount,
        paidCount,
        remainingBalance,
        nextDueInstallment,
      };
    });
  } catch (e) {
    logger.error("D1 dbGetUserLoans error:", { error: e.message, userId });
    return [];
  }
}

/**
 * Fetch a single loan by ID with its full installment list
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} loanId
 * @returns {Promise<object|null>}
 */
export async function dbGetLoanById(env, userId, loanId) {
  if (!userId || !loanId || !env || !env.DB) return null;

  await ensureD1Tables(env);

  try {
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

    const installmentsQuery = `
      SELECT id, loan_id AS loanId, user_id AS userId,
             installment_number AS installmentNumber, due_date AS dueDate,
             principal_portion AS principalPortion, interest_portion AS interestPortion,
             total_amount AS totalAmount, remaining_balance_after AS remainingBalanceAfter,
             is_paid AS isPaid, paid_date AS paidDate, paid_amount AS paidAmount,
             created_at AS createdAt, updated_at AS updatedAt
      FROM loan_installments
      WHERE loan_id = ? AND user_id = ?
      ORDER BY installment_number ASC
    `;
    const { results: instRows } = await env.DB.prepare(installmentsQuery).bind(loanId, userId).all();
    const installments = (instRows || []).map(formatInstallmentRow);

    return {
      ...formatLoanRow(loanRow),
      installments,
    };
  } catch (e) {
    logger.error("D1 dbGetLoanById error:", { error: e.message, userId, loanId });
    return null;
  }
}

/**
 * Update a loan.
 * CRITICAL REQUIREMENT:
 * If financial parameters (principal, rate, count, interval, or start date) change,
 * ONLY pending installments (is_paid = 0) are rebuilt.
 * Paid installments (is_paid = 1) remain strictly untouched.
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} loanId
 * @param {object} data
 * @returns {Promise<object|null>} The updated loan with its full installments
 */
export async function dbUpdateLoan(env, userId, loanId, data) {
  if (!userId || !loanId || !data || !env || !env.DB) return null;

  await ensureD1Tables(env);

  const existingLoan = await dbGetLoanById(env, userId, loanId);
  if (!existingLoan) return null;

  const nowIso = new Date().toISOString();

  const newTitle = data.title !== undefined ? String(data.title).trim() : existingLoan.title;
  const newLenderName =
    data.lenderName !== undefined
      ? String(data.lenderName).trim()
      : data.lender_name !== undefined
      ? String(data.lender_name).trim()
      : existingLoan.lenderName;
  const newNotes = data.notes !== undefined ? String(data.notes).trim() : existingLoan.notes;

  const newPrincipal =
    data.principalAmount !== undefined
      ? Number(data.principalAmount)
      : data.principal !== undefined
      ? Number(data.principal)
      : existingLoan.principalAmount;

  const newRate =
    data.annualInterestRate !== undefined
      ? Number(data.annualInterestRate)
      : data.annualRatePct !== undefined
      ? Number(data.annualRatePct)
      : existingLoan.annualInterestRate;

  const newCount =
    data.installmentCount !== undefined
      ? parseInt(data.installmentCount, 10)
      : data.installment_count !== undefined
      ? parseInt(data.installment_count, 10)
      : existingLoan.installmentCount;

  const newInterval =
    data.intervalMonths !== undefined
      ? parseInt(data.intervalMonths, 10)
      : data.interval_months !== undefined
      ? parseInt(data.interval_months, 10)
      : existingLoan.intervalMonths;

  const newStartDate =
    data.startDate !== undefined
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

  // Update loan record
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
    // Separate existing installments into paid vs pending
    const paidInstallments = existingLoan.installments.filter((inst) => inst.isPaid);
    const paidCount = paidInstallments.length;

    // Sum of principal portions already paid
    const alreadyPaidPrincipal = paidInstallments.reduce(
      (sum, inst) => sum + (Number(inst.principalPortion) || 0),
      0
    );

    // Remaining principal and installment count to amortize
    const remainingPrincipal = Math.max(0, newPrincipal - alreadyPaidPrincipal);
    const remainingCount = Math.max(0, newCount - paidCount);

    // Delete ONLY pending installments (is_paid = 0)
    const deletePendingSql = `
      DELETE FROM loan_installments
      WHERE loan_id = ? AND user_id = ? AND is_paid = 0
    `;
    statements.push(env.DB.prepare(deletePendingSql).bind(loanId, userId));

    if (remainingCount > 0 && remainingPrincipal > 0) {
      // Generate amortization schedule for remaining principal over remaining count
      const remainingSchedule = generateAmortizationSchedule({
        principal: remainingPrincipal,
        annualRatePct: newRate,
        installmentCount: remainingCount,
        startDateIso: newStartDate,
        intervalMonths: newInterval,
      });

      const parsedStart = parseDateParts(newStartDate);
      const insertPendingSql = `
        INSERT INTO loan_installments (
          id, loan_id, user_id, installment_number, due_date,
          principal_portion, interest_portion, total_amount,
          remaining_balance_after, is_paid, paid_date, paid_amount,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (let j = 0; j < remainingSchedule.length; j++) {
        const item = remainingSchedule[j];
        const installmentNumber = paidCount + j + 1;
        // Compute clamped due date relative to the loan start date at the correct installment offset
        const dueDate = computeClampedDueDate(parsedStart, installmentNumber, newInterval);
        const instId = generateId("inst");

        statements.push(
          env.DB.prepare(insertPendingSql).bind(
            instId,
            loanId,
            userId,
            installmentNumber,
            dueDate,
            item.principalPortion,
            item.interestPortion,
            item.totalAmount,
            item.remainingBalanceAfter,
            0,
            "",
            0,
            nowIso,
            nowIso
          )
        );
      }
    }
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
 * Delete a loan and all its installments.
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
    const deleteInstallmentsSql = `DELETE FROM loan_installments WHERE loan_id = ? AND user_id = ?`;
    const deleteLoanSql = `DELETE FROM loans WHERE id = ? AND user_id = ?`;

    if (typeof env.DB.batch === "function") {
      await env.DB.batch([
        env.DB.prepare(deleteInstallmentsSql).bind(loanId, userId),
        env.DB.prepare(deleteLoanSql).bind(loanId, userId),
      ]);
    } else {
      await env.DB.prepare(deleteInstallmentsSql).bind(loanId, userId).run();
      await env.DB.prepare(deleteLoanSql).bind(loanId, userId).run();
    }
    return true;
  } catch (e) {
    logger.error("D1 dbDeleteLoan error:", { error: e.message, userId, loanId });
    return false;
  }
}

/**
 * Mark an installment as paid.
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} installmentId
 * @param {object} [details={}]
 * @param {string} [details.paidDate]
 * @param {number} [details.paidAmount]
 * @returns {Promise<object|null>} The updated installment
 */
export async function dbMarkInstallmentPaid(env, userId, installmentId, details = {}) {
  if (!userId || !installmentId || !env || !env.DB) return null;

  await ensureD1Tables(env);

  try {
    const selectQuery = `
      SELECT id, loan_id AS loanId, user_id AS userId, installment_number AS installmentNumber,
             due_date AS dueDate, principal_portion AS principalPortion, interest_portion AS interestPortion,
             total_amount AS totalAmount, remaining_balance_after AS remainingBalanceAfter,
             is_paid AS isPaid, paid_date AS paidDate, paid_amount AS paidAmount,
             created_at AS createdAt, updated_at AS updatedAt
      FROM loan_installments
      WHERE id = ? AND user_id = ?
    `;
    const row = await env.DB.prepare(selectQuery).bind(installmentId, userId).first();
    if (!row) return null;

    const nowIso = new Date().toISOString();
    const paidDate = String(details.paidDate || details.paid_date || nowIso.split("T")[0]).trim();
    const paidAmount =
      details.paidAmount !== undefined && details.paidAmount !== null
        ? Number(details.paidAmount)
        : details.paid_amount !== undefined && details.paid_amount !== null
        ? Number(details.paid_amount)
        : Number(row.totalAmount || row.total_amount || 0);

    const updateQuery = `
      UPDATE loan_installments
      SET is_paid = 1, paid_date = ?, paid_amount = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `;
    await env.DB.prepare(updateQuery).bind(paidDate, paidAmount, nowIso, installmentId, userId).run();

    return {
      ...formatInstallmentRow(row),
      isPaid: true,
      paidDate,
      paidAmount,
      updatedAt: nowIso,
    };
  } catch (e) {
    logger.error("D1 dbMarkInstallmentPaid error:", { error: e.message, userId, installmentId });
    return null;
  }
}

/**
 * Reset an installment back to unpaid (is_paid = 0).
 *
 * @param {object} env
 * @param {string} userId
 * @param {string} installmentId
 * @returns {Promise<object|null>} The updated installment
 */
export async function dbUnmarkInstallmentPaid(env, userId, installmentId) {
  if (!userId || !installmentId || !env || !env.DB) return null;

  await ensureD1Tables(env);

  try {
    const selectQuery = `
      SELECT id, loan_id AS loanId, user_id AS userId, installment_number AS installmentNumber,
             due_date AS dueDate, principal_portion AS principalPortion, interest_portion AS interestPortion,
             total_amount AS totalAmount, remaining_balance_after AS remainingBalanceAfter,
             is_paid AS isPaid, paid_date AS paidDate, paid_amount AS paidAmount,
             created_at AS createdAt, updated_at AS updatedAt
      FROM loan_installments
      WHERE id = ? AND user_id = ?
    `;
    const row = await env.DB.prepare(selectQuery).bind(installmentId, userId).first();
    if (!row) return null;

    const nowIso = new Date().toISOString();
    const updateQuery = `
      UPDATE loan_installments
      SET is_paid = 0, paid_date = '', paid_amount = 0, updated_at = ?
      WHERE id = ? AND user_id = ?
    `;
    await env.DB.prepare(updateQuery).bind(nowIso, installmentId, userId).run();

    return {
      ...formatInstallmentRow(row),
      isPaid: false,
      paidDate: "",
      paidAmount: 0,
      updatedAt: nowIso,
    };
  } catch (e) {
    logger.error("D1 dbUnmarkInstallmentPaid error:", { error: e.message, userId, installmentId });
    return null;
  }
}
