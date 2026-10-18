/**
 * loanDocument.js — Every loan operation, pure (storage-free), over a single loan "document"
 *
 * A loan document is everything kept for one loan:
 *   { loan, states, extraPayments }
 *   - loan:          the loan's master parameters
 *   - states:        the sparse installment state rows (paid events / manual overrides)
 *   - extraPayments: recorded lump-sum payments
 *
 * This is the one loan engine. Loans are end-to-end encrypted vault records, so the browser runs
 * these operations on the decrypted document (shared/vault/vaultLoans.js) and stores it encrypted
 * again; the server only reads the older plaintext loans through the same view
 * (repositories/loans.repository.js → buildLoanView / summarizeLoan). Shared with the web client
 * through a symlink; the rules are tested in tests/unit/loanRules.test.js.
 */

import {
  calculateFixedInstallmentAmount,
  calculatePayoffScheduleFixedAmount,
  computeEffectiveSchedule,
  distributeInstallmentAmounts,
  parseDateParts,
  computeClampedDueDate,
} from "./loanCalculator.js";
import { t } from "./i18n.js";
import { getBankById, isCustomBankId, matchBankIdByName } from "../config/banks.config.js";

/** Error raised for invalid input — `statusCode` matches what the API would have answered */
export class LoanDocumentError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "LoanDocumentError";
    this.statusCode = statusCode;
  }
}

const badRequest = (message) => new LoanDocumentError(message, 400);
const notFound = (message) => new LoanDocumentError(message, 404);

export function generateLoanDocId(prefix = "loan") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function resolveOptions(options = {}) {
  return {
    now: options.now || new Date().toISOString(),
    generateId: options.generateId || generateLoanDocId,
  };
}

/** Copy a document so operations never mutate their input */
function cloneDoc(doc) {
  return {
    loan: { ...doc.loan },
    states: (doc.states || []).map((s) => ({ ...s })),
    extraPayments: (doc.extraPayments || []).map((p) => ({ ...p })),
  };
}

function sortedStates(doc) {
  return [...(doc.states || [])].sort((a, b) => a.installmentNumber - b.installmentNumber);
}

function sortedExtraPayments(doc) {
  return [...(doc.extraPayments || [])].sort(
    (a, b) =>
      String(a.paymentDate || "").localeCompare(String(b.paymentDate || "")) ||
      String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  );
}

function makeState(fields) {
  return {
    id: fields.id,
    loanId: fields.loanId,
    installmentNumber: fields.installmentNumber,
    dueDate: fields.dueDate,
    dueDateIso: fields.dueDate,
    principalPortion: Number(fields.principalPortion) || 0,
    interestPortion: Number(fields.interestPortion) || 0,
    totalAmount: Number(fields.totalAmount) || 0,
    remainingBalanceAfter: Number(fields.remainingBalanceAfter) || 0,
    isPaid: Boolean(fields.isPaid),
    paidDate: fields.paidDate || "",
    paidAmount: Number(fields.paidAmount) || 0,
    isManualOverride: Boolean(fields.isManualOverride),
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };
}

/**
 * Full loan as the API's GET /api/loans/:id returns it: parameters, aggregates, the computed
 * installment list and the extra payments.
 */
export function buildLoanView(doc) {
  const loan = { ...doc.loan };
  const extraPayments = sortedExtraPayments(doc);
  const installments = computeEffectiveSchedule({
    loan,
    installmentStates: sortedStates(doc),
    extraPayments,
  });

  const paidCount = installments.filter((i) => i.isPaid).length;
  const totalCount = installments.length;
  const remainingBalance = installments
    .filter((i) => !i.isPaid)
    .reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
  const nextDueInstallment = installments.find((i) => !i.isPaid) || null;
  const totalRepaymentAmount = installments.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);

  return {
    ...loan,
    totalCount,
    paidCount,
    remainingBalance,
    nextDueInstallment,
    totalRepaymentAmount,
    installments,
    extraPayments,
  };
}

/** Loan as it appears in the list (GET /api/loans): aggregates without the full schedule */
export function summarizeLoan(doc) {
  const view = buildLoanView(doc);
  delete view.installments;
  delete view.extraPayments;
  return view;
}

/**
 * Create a loan document (POST /api/loans).
 * @param {object} data           Same body the API accepts
 * @param {object} [options]
 * @param {(ref: {bankId: string, lenderName: string}) => {bankId: string, lenderName: string}} [options.resolveBank]
 */
export function createLoanDoc(data = {}, options = {}) {
  const { now, generateId } = resolveOptions(options);

  const title = String(data.title || "").trim();
  const principalAmount = Number(data.principalAmount ?? data.principal ?? 0);
  const installmentCount = parseInt(data.installmentCount ?? data.installment_count ?? 0, 10);

  if (!title) throw badRequest(t("عنوان وام الزامی است."));
  if (!principalAmount || principalAmount <= 0) throw badRequest(t("مبلغ اصل وام باید مقداری بزرگتر از صفر باشد."));
  if (!installmentCount || installmentCount <= 0) throw badRequest(t("تعداد اقساط باید حداقل ۱ باشد."));

  const loanId = data.id || generateId("loan");
  const bank = (options.resolveBank || defaultResolveBank)({
    bankId: data.bankId ?? data.bank_id,
    lenderName: data.lenderName || data.lender_name,
  });
  const annualInterestRate = Number(data.annualInterestRate ?? data.annualRatePct ?? 0);
  const intervalMonths = parseInt(data.intervalMonths ?? data.interval_months ?? 1, 10);
  const startDate = String(data.startDate || data.start_date || now.split("T")[0]).trim();
  const annualFeeAmount = Math.max(0, Number(data.annualFeeAmount ?? data.annual_fee_amount ?? 0) || 0);
  const notes = String(data.notes || "").trim();

  const rawCustomInstallments = Array.isArray(data.customInstallments) ? data.customInstallments : [];
  const customInstallmentsInput = rawCustomInstallments
    .map((entry) => ({
      installmentNumber: parseInt(entry.installmentNumber ?? entry.installment_number, 10),
      totalAmount: Number(entry.totalAmount ?? entry.amount),
    }))
    .reduce((map, entry) => {
      if (!Number.isInteger(entry.installmentNumber) || entry.installmentNumber < 1 || entry.installmentNumber > installmentCount) {
        throw badRequest(t('شماره قسط سفارشی‌سازی‌شده ({installmentNumber}) خارج از بازه معتبر است.', { installmentNumber: entry.installmentNumber }));
      }
      if (isNaN(entry.totalAmount) || entry.totalAmount <= 0) {
        throw badRequest(t('مبلغ سفارشی‌سازی‌شده برای قسط {installmentNumber} باید عددی بزرگتر از صفر باشد.', { installmentNumber: entry.installmentNumber }));
      }
      map[entry.installmentNumber] = entry.totalAmount;
      return map;
    }, {});

  const totalRepaymentInput = data.totalRepaymentAmount !== undefined && data.totalRepaymentAmount !== null
    ? Number(data.totalRepaymentAmount)
    : data.total_repayment_amount !== undefined && data.total_repayment_amount !== null
    ? Number(data.total_repayment_amount)
    : null;
  if (totalRepaymentInput !== null && (isNaN(totalRepaymentInput) || totalRepaymentInput <= 0)) {
    throw badRequest(t("مبلغ کل بازپرداخت باید عددی بزرگتر از صفر باشد."));
  }

  let distributedSchedule = [];
  if (Object.keys(customInstallmentsInput).length > 0 || totalRepaymentInput) {
    try {
      distributedSchedule = distributeInstallmentAmounts({
        loan: { id: loanId, principalAmount, annualInterestRate, installmentCount, intervalMonths, startDate },
        knownAmounts: customInstallmentsInput,
        totalRepaymentOverride: totalRepaymentInput || undefined,
      });
    } catch (e) {
      throw badRequest(e.message);
    }
  }

  const doc = {
    loan: {
      id: loanId,
      title,
      lenderName: bank.lenderName,
      bankId: bank.bankId,
      principalAmount,
      annualInterestRate,
      installmentCount,
      intervalMonths,
      startDate,
      annualFeeAmount,
      scheduleMode: distributedSchedule.length > 0 ? "distributed" : "formula",
      notes,
      ...(data.remindersMuted ? { remindersMuted: true } : {}),
      createdAt: now,
      updatedAt: now,
    },
    states: [],
    extraPayments: [],
  };

  const customFirst = Number(
    data.customFirstInstallmentAmount ??
    data.custom_first_installment_amount ??
    data.firstInstallmentAmount
  );

  if (distributedSchedule.length === 0 && !isNaN(customFirst) && customFirst > 0) {
    const dueDate1 = computeClampedDueDate(parseDateParts(startDate), 1, intervalMonths);
    const r = annualInterestRate > 0 ? (annualInterestRate / 100) * (intervalMonths / 12) : 0;
    const interestPortion = r > 0 ? Math.round(principalAmount * r) : 0;
    let principalPortion = customFirst - interestPortion;
    if (principalPortion < 0) principalPortion = 0;
    if (principalPortion > principalAmount) principalPortion = principalAmount;
    doc.states.push(makeState({
      id: generateId("inst"),
      loanId,
      installmentNumber: 1,
      dueDate: dueDate1,
      principalPortion,
      interestPortion,
      totalAmount: principalPortion + interestPortion,
      remainingBalanceAfter: principalAmount - principalPortion,
      isManualOverride: true,
      createdAt: now,
      updatedAt: now,
    }));
  }

  for (const inst of distributedSchedule) {
    doc.states.push(makeState({
      id: inst.id || generateId("inst"),
      loanId,
      installmentNumber: inst.installmentNumber,
      dueDate: inst.dueDate,
      principalPortion: inst.principalPortion,
      interestPortion: inst.interestPortion,
      totalAmount: inst.totalAmount,
      remainingBalanceAfter: inst.remainingBalanceAfter,
      isManualOverride: true,
      createdAt: now,
      updatedAt: now,
    }));
  }

  return doc;
}

/**
 * How a loan names its bank, given the user's custom banks: a standard or custom bank id wins
 * (its display name with it, so the two never disagree); without an id, a lender name matching a
 * standard bank links to it, anything else stays a plain name. An unknown id is refused.
 * @param {Array<{ id: string, name: string }>} [customBanks]
 * @returns {(ref: { bankId?: string, lenderName?: string }) => { bankId: string, lenderName: string }}
 */
export function loanBankResolver(customBanks = []) {
  return ({ bankId, lenderName }) => {
    const cleanName = String(lenderName || "").trim();
    const cleanId = String(bankId || "").trim();
    if (cleanId) {
      const standard = getBankById(cleanId);
      if (standard) return { bankId: standard.id, lenderName: standard.name };
      if (isCustomBankId(cleanId)) {
        const custom = customBanks.find((b) => b.id === cleanId);
        if (custom) return { bankId: custom.id, lenderName: custom.name };
      }
      throw badRequest(t("بانک انتخاب‌شده معتبر نیست."));
    }
    const matched = matchBankIdByName(cleanName);
    if (matched) return { bankId: matched, lenderName: cleanName || getBankById(matched).name };
    return { bankId: "", lenderName: cleanName };
  };
}

function defaultResolveBank({ bankId, lenderName }) {
  return { bankId: String(bankId || "").trim(), lenderName: String(lenderName || "").trim() };
}

/**
 * Update a loan's parameters (PUT /api/loans/:id). Changing financial terms drops every
 * pending state row, exactly like the repository. An optional `totalRepaymentAmount` then
 * re-plans the pending installments to that total.
 */
export function updateLoanDoc(doc, data = {}, options = {}) {
  const { now } = resolveOptions(options);
  const existing = buildLoanView(doc);
  const next = cloneDoc(doc);

  const incomingBankId = data.bankId !== undefined ? data.bankId : data.bank_id;
  const incomingLenderName = data.lenderName !== undefined ? data.lenderName : data.lender_name;
  const bank = incomingBankId !== undefined || incomingLenderName !== undefined
    ? (options.resolveBank || defaultResolveBank)({
        bankId: incomingBankId,
        lenderName: incomingLenderName !== undefined ? incomingLenderName : existing.lenderName,
      })
    : { bankId: existing.bankId || "", lenderName: existing.lenderName };

  const pick = (camel, snake, fallback, parse) =>
    data[camel] !== undefined ? parse(data[camel]) : snake && data[snake] !== undefined ? parse(data[snake]) : fallback;

  const newTitle = data.title !== undefined ? String(data.title).trim() : existing.title;
  const newNotes = data.notes !== undefined ? String(data.notes).trim() : existing.notes;
  const newPrincipal = data.principalAmount !== undefined
    ? Number(data.principalAmount)
    : data.principal !== undefined ? Number(data.principal) : existing.principalAmount;
  const newRate = data.annualInterestRate !== undefined
    ? Number(data.annualInterestRate)
    : data.annualRatePct !== undefined ? Number(data.annualRatePct) : existing.annualInterestRate;
  const newCount = pick("installmentCount", "installment_count", existing.installmentCount, (v) => parseInt(v, 10));
  const newInterval = pick("intervalMonths", "interval_months", existing.intervalMonths, (v) => parseInt(v, 10));
  const newStartDate = pick("startDate", "start_date", existing.startDate, (v) => String(v).trim());
  const newAnnualFeeAmount = pick("annualFeeAmount", "annual_fee_amount", existing.annualFeeAmount, (v) => Math.max(0, Number(v) || 0));

  const financialParamsChanged =
    newPrincipal !== existing.principalAmount ||
    newRate !== existing.annualInterestRate ||
    newCount !== existing.installmentCount ||
    newInterval !== existing.intervalMonths ||
    newStartDate !== existing.startDate;

  if (financialParamsChanged) {
    const paidInstallments = (existing.installments || []).filter((i) => i.isPaid);
    const paidCount = paidInstallments.length;
    const alreadyPaidPrincipal = paidInstallments.reduce((sum, i) => sum + (Number(i.principalPortion) || 0), 0);

    if (paidCount > 0) {
      if (newCount < paidCount) {
        throw badRequest(t('تعداد اقساط جدید ({newCount}) نمی‌تواند از تعداد اقساط پرداخت‌شده ({paidCount}) کمتر باشد.', { newCount, paidCount }));
      }
      if (newPrincipal < alreadyPaidPrincipal) {
        throw badRequest(
          t('مبلغ اصل وام جدید نمی‌تواند کمتر از مبلغ اصلِ قبلاً پرداخت‌شده ({amount} تومان) باشد.', { amount: Math.round(alreadyPaidPrincipal).toLocaleString("en-US") })
        );
      }
      if (newStartDate !== existing.startDate) {
        throw badRequest(t("پس از پرداخت حداقل یک قسط، امکان تغییر تاریخ شروع وام وجود ندارد."));
      }
    }
  }

  next.loan = {
    ...next.loan,
    title: newTitle,
    lenderName: bank.lenderName,
    bankId: bank.bankId,
    principalAmount: newPrincipal,
    annualInterestRate: newRate,
    installmentCount: newCount,
    intervalMonths: newInterval,
    startDate: newStartDate,
    annualFeeAmount: newAnnualFeeAmount,
    scheduleMode: financialParamsChanged ? "formula" : (existing.scheduleMode || "formula"),
    notes: newNotes,
    ...(data.remindersMuted !== undefined ? (data.remindersMuted ? { remindersMuted: true } : {}) : (existing.remindersMuted ? { remindersMuted: true } : {})),
    updatedAt: now,
  };

  if (financialParamsChanged) {
    next.states = next.states.filter((s) => s.isPaid);
  }

  // An edited total repayment re-plans the pending installments to sum to it (paid ones stay),
  // exactly like "ویرایش گروهی اقساط"; an unchanged total leaves the schedule alone.
  const totalInput = data.totalRepaymentAmount ?? data.total_repayment_amount;
  if (totalInput !== undefined && totalInput !== null) {
    const total = Number(totalInput);
    if (isNaN(total) || total <= 0) throw badRequest(t("مبلغ کل بازپرداخت باید عددی بزرگتر از صفر باشد."));
    if (total !== buildLoanView(next).totalRepaymentAmount) {
      return bulkDistributeInstallmentsDoc(next, {}, total, options);
    }
  }
  return next;
}

/** Installment number encoded in an id: a plain number, or the `_N` suffix of `inst_<loan>_N` */
function installmentNumberFromId(installmentId) {
  let num = !isNaN(Number(installmentId)) ? Number(installmentId) : -1;
  if (num === -1 && typeof installmentId === "string") {
    const match = installmentId.match(/_(\d+)$/);
    if (match) num = parseInt(match[1], 10);
  }
  return num;
}

function findStateIndex(doc, installmentId) {
  const num = installmentNumberFromId(installmentId);
  return doc.states.findIndex((s) => s.id === installmentId || s.installmentNumber === num);
}

/**
 * Mark one installment as paid (PUT .../installments/:id with isPaid, no cascade).
 * @returns {{ doc: object, installment: object|null }}
 */
export function markInstallmentPaidDoc(doc, installmentId, details = {}, options = {}) {
  const { now, generateId } = resolveOptions(options);
  const next = cloneDoc(doc);
  const today = now.split("T")[0];

  const idx = findStateIndex(next, installmentId);
  if (idx !== -1) {
    const row = next.states[idx];
    const paidDate = details.paidDate || details.paid_date || today;
    const paidAmount = details.paidAmount !== undefined && details.paidAmount !== null
      ? Number(details.paidAmount)
      : Number(row.totalAmount || 0);
    next.states[idx] = { ...row, isPaid: true, paidDate, paidAmount, updatedAt: now };
    return { doc: next, installment: next.states[idx] };
  }

  const view = buildLoanView(next);
  const targetInst = view.installments.find(
    (i) => i.id === installmentId || String(i.installmentNumber) === String(installmentId)
  );
  if (!targetInst) return { doc, installment: null };

  const paidDate = details.paidDate || details.paid_date || today;
  const paidAmount = details.paidAmount !== undefined && details.paidAmount !== null
    ? Number(details.paidAmount)
    : targetInst.totalAmount;
  const newInstId = String(installmentId).startsWith("inst_") && !String(installmentId).includes("loan_")
    ? installmentId
    : targetInst.id || generateId("inst");

  const state = makeState({
    ...targetInst,
    id: newInstId,
    loanId: next.loan.id,
    isPaid: true,
    paidDate,
    paidAmount,
    isManualOverride: false,
    createdAt: now,
    updatedAt: now,
  });
  next.states.push(state);
  return {
    doc: next,
    installment: {
      ...targetInst,
      id: newInstId,
      loanId: next.loan.id,
      isPaid: true,
      paidDate,
      paidAmount,
      isManualOverride: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * Mark an installment paid together with every earlier unpaid one (cascade mode).
 * @returns {{ doc: object, installment: object, cascadedInstallments: object[], cascadedCount: number, cascadedTotal: number }}
 */
export function markInstallmentPaidCascadeDoc(doc, installmentId, details = {}, options = {}) {
  const { now, generateId } = resolveOptions(options);
  const next = cloneDoc(doc);
  const view = buildLoanView(next);

  const targetInst = view.installments.find(
    (i) => i.id === installmentId || String(i.installmentNumber) === String(installmentId)
  );
  if (!targetInst) throw notFound(t("قسط مورد نظر یافت نشد."));
  if (targetInst.isPaid) throw badRequest(t("این قسط قبلاً پرداخت شده است."));

  const priorUnpaid = view.installments.filter(
    (i) => i.installmentNumber < targetInst.installmentNumber && !i.isPaid
  );

  const targetPaidDate = details.paidDate || details.paid_date || now.split("T")[0];
  const targetPaidAmount = details.paidAmount !== undefined && details.paidAmount !== null
    ? Number(details.paidAmount)
    : targetInst.totalAmount;

  const markPaid = (inst, paidDate, paidAmount) => {
    const idx = next.states.findIndex((s) => s.installmentNumber === inst.installmentNumber);
    if (idx !== -1) {
      next.states[idx] = { ...next.states[idx], isPaid: true, paidDate, paidAmount, updatedAt: now };
    } else {
      next.states.push(makeState({
        ...inst,
        id: inst.id && !inst.id.startsWith("inst_") ? inst.id : generateId("inst"),
        loanId: next.loan.id,
        isPaid: true,
        paidDate,
        paidAmount,
        isManualOverride: false,
        createdAt: now,
        updatedAt: now,
      }));
    }
  };

  markPaid(targetInst, targetPaidDate, targetPaidAmount);

  const cascadedInstallments = [];
  let cascadedTotal = 0;
  for (const prior of priorUnpaid) {
    cascadedTotal += prior.totalAmount;
    markPaid(prior, prior.dueDate, prior.totalAmount);
    cascadedInstallments.push({ ...prior, isPaid: true, paidDate: prior.dueDate, paidAmount: prior.totalAmount, updatedAt: now });
  }

  return {
    doc: next,
    installment: { ...targetInst, isPaid: true, paidDate: targetPaidDate, paidAmount: targetPaidAmount, updatedAt: now },
    cascadedInstallments,
    cascadedCount: cascadedInstallments.length,
    cascadedTotal,
  };
}

/**
 * Reset an installment to unpaid. A plain payment row is dropped (the installment goes back to
 * being computed); a manual override keeps its amounts and only loses the payment.
 * @returns {{ doc: object, installment: object }}
 */
export function unmarkInstallmentPaidDoc(doc, installmentId, options = {}) {
  const { now } = resolveOptions(options);
  const next = cloneDoc(doc);
  const idx = findStateIndex(next, installmentId);
  if (idx === -1) {
    return { doc, installment: { id: installmentId, isPaid: false, paidDate: "", paidAmount: 0 } };
  }

  const row = next.states[idx];
  const reset = { ...row, isPaid: false, paidDate: "", paidAmount: 0, updatedAt: now };
  if (row.isManualOverride) {
    next.states[idx] = reset;
  } else {
    next.states.splice(idx, 1);
  }
  return { doc: next, installment: reset };
}

/** Re-plan every pending installment's amount at once ("ویرایش گروهی اقساط") */
export function bulkDistributeInstallmentsDoc(doc, knownAmounts = {}, totalRepaymentAmount, options = {}) {
  const { now, generateId } = resolveOptions(options);
  if (totalRepaymentAmount !== undefined && totalRepaymentAmount !== null) {
    const total = Number(totalRepaymentAmount);
    if (isNaN(total) || total <= 0) throw badRequest(t("مبلغ کل بازپرداخت باید عددی بزرگتر از صفر باشد."));
  }

  const view = buildLoanView(doc);
  const paidInstallments = view.installments.filter((inst) => inst.isPaid);
  const effectiveTotalRepaymentOverride = totalRepaymentAmount !== undefined && totalRepaymentAmount !== null
    ? Number(totalRepaymentAmount)
    : view.installments.reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);
  const effectivePrincipalOverride = view.installments.reduce((sum, i) => sum + Number(i.principalPortion || 0), 0);

  const cleanKnownAmounts = {};
  for (const [num, amt] of Object.entries(knownAmounts || {})) {
    const n = parseInt(num, 10);
    const a = Number(amt);
    if (!Number.isInteger(n) || n < 1 || n > view.installmentCount) {
      throw badRequest(t('شماره قسط سفارشی‌سازی‌شده ({n}) خارج از بازه معتبر است.', { n }));
    }
    if (isNaN(a) || a <= 0) {
      throw badRequest(t('مبلغ سفارشی‌سازی‌شده برای قسط {n} باید عددی بزرگتر از صفر باشد.', { n }));
    }
    if (paidInstallments.some((p) => p.installmentNumber === n)) {
      throw badRequest(t('قسط {n} قبلاً پرداخت شده و قابل ویرایش نیست.', { n }));
    }
    cleanKnownAmounts[n] = a;
  }

  let distributedSchedule;
  try {
    distributedSchedule = distributeInstallmentAmounts({
      loan: view,
      paidInstallments,
      knownAmounts: cleanKnownAmounts,
      totalRepaymentOverride: effectiveTotalRepaymentOverride,
      principalOverride: effectivePrincipalOverride,
    });
  } catch (e) {
    throw badRequest(e.message);
  }

  const next = cloneDoc(doc);
  next.loan = { ...next.loan, scheduleMode: "distributed", updatedAt: now };
  next.states = next.states.filter((s) => s.isPaid);
  for (const inst of distributedSchedule.filter((i) => !i.isPaid)) {
    next.states.push(makeState({
      id: inst.id || generateId("inst"),
      loanId: next.loan.id,
      installmentNumber: inst.installmentNumber,
      dueDate: inst.dueDate,
      principalPortion: inst.principalPortion,
      interestPortion: inst.interestPortion,
      totalAmount: inst.totalAmount,
      remainingBalanceAfter: inst.remainingBalanceAfter,
      isManualOverride: true,
      createdAt: now,
      updatedAt: now,
    }));
  }
  return next;
}

/**
 * Record an extra (lump-sum) payment.
 * @returns {{ doc: object, fullyPaidOff: boolean, extraPayment: object }}
 */
export function addExtraPaymentDoc(doc, { amount, paymentDate, reductionMode = "reduce_amount", notes = "" } = {}, options = {}) {
  const { now, generateId } = resolveOptions(options);
  const payAmount = Number(amount);
  if (isNaN(payAmount) || payAmount <= 0) throw badRequest(t("مبلغ پرداخت اضافه باید عددی بزرگتر از صفر باشد."));
  if (!paymentDate) throw badRequest(t("تاریخ پرداخت اضافه الزامی است."));

  const mode = reductionMode === "reduce_term" ? "reduce_term" : "reduce_amount";
  const view = buildLoanView(doc);
  if (view.scheduleMode === "distributed") {
    throw badRequest(t("ثبت پرداخت اضافه برای وام‌هایی با حالت «سفارشی‌سازی و تقسیم مساوی اقساط» پشتیبانی نمی‌شود."));
  }

  const paidInstallments = view.installments.filter((inst) => inst.isPaid);
  const paidCount = paidInstallments.length;
  // After the last paid installment, less the extra payments already made since it (the smallest
  // balance they left, whatever the order of their dates)
  const sinceLastPaid = (doc.extraPayments || []).filter((e) => e.anchorInstallmentNumber === paidCount);
  const currentBalance = sinceLastPaid.length
    ? Math.min(...sinceLastPaid.map((e) => Number(e.resultingBalance) || 0))
    : paidCount > 0
      ? Number(paidInstallments[paidCount - 1].remainingBalanceAfter) || 0
      : view.principalAmount;

  const resultingBalance = Math.max(0, currentBalance - payAmount);
  const fullyPaidOff = resultingBalance === 0;

  let resultingInstallmentCount = null;
  if (mode === "reduce_term" && resultingBalance > 0) {
    const pendingInstallments = view.installments.filter((inst) => !inst.isPaid);
    const fixedAmount = pendingInstallments.length > 0 && pendingInstallments[0].totalAmount > 0
      ? pendingInstallments[0].totalAmount
      : calculateFixedInstallmentAmount({
          principal: view.principalAmount,
          annualRatePct: view.annualInterestRate,
          installmentCount: view.installmentCount,
          intervalMonths: view.intervalMonths,
        });
    const payoffSchedule = calculatePayoffScheduleFixedAmount({
      remainingBalance: resultingBalance,
      fixedInstallmentAmount: fixedAmount,
      annualRatePct: view.annualInterestRate,
      intervalMonths: view.intervalMonths,
      startDateIso: view.startDate,
      anchorInstallmentNumber: paidCount,
    });
    resultingInstallmentCount = paidCount + payoffSchedule.length;
  }

  const extraPayment = {
    id: generateId("epay"),
    loanId: view.id,
    amount: payAmount,
    paymentDate: String(paymentDate).trim(),
    reductionMode: mode,
    notes: String(notes || "").trim(),
    anchorInstallmentNumber: paidCount,
    resultingBalance,
    resultingInstallmentCount,
    createdAt: now,
  };

  const next = cloneDoc(doc);
  next.extraPayments.push(extraPayment);
  if (fullyPaidOff || mode === "reduce_term") {
    next.loan = {
      ...next.loan,
      installmentCount: fullyPaidOff ? paidCount : resultingInstallmentCount,
      updatedAt: now,
    };
  }
  return { doc: next, fullyPaidOff, extraPayment };
}

/** Extra payments, newest first (GET .../extra-payments) */
export function listExtraPaymentsDoc(doc) {
  return sortedExtraPayments(doc).reverse();
}
