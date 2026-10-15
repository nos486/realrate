/**
 * loanDocStore.js — The loan engine (domain/loanDocument.js) over an in-memory set of loan
 * documents, for the loan rules tests
 *
 * Each call takes the store and a user and works like a request does in the browser
 * (shared/vault/vaultLoans.js): find the user's document, run the engine on it, keep the result.
 * The answers have the shapes the loans page reads (loan views, installments, extra payments),
 * as promises, the way the page gets them.
 */

import {
  createLoanDoc,
  buildLoanView,
  summarizeLoan,
  updateLoanDoc,
  markInstallmentPaidDoc,
  markInstallmentPaidCascadeDoc,
  unmarkInstallmentPaidDoc,
  bulkDistributeInstallmentsDoc,
  addExtraPaymentDoc,
  listExtraPaymentsDoc,
  loanBankResolver,
} from '../../src/domain/loanDocument.js';

/** Standard banks only (the user has no custom bank) */
const resolveBank = loanBankResolver([]);

/** An empty store: documents by `${userId}:${loanId}` */
export function createLoanStore() {
  return { docs: new Map() };
}

const keyOf = (userId, loanId) => `${userId}:${loanId}`;
const userDocs = (store, userId) => [...store.docs.entries()]
  .filter(([key]) => key.startsWith(`${userId}:`))
  .map(([, doc]) => doc);

function docOf(store, userId, loanId) {
  return store.docs.get(keyOf(userId, loanId)) || null;
}

function save(store, userId, doc) {
  store.docs.set(keyOf(userId, doc.loan.id), doc);
  return doc;
}

/** The loan an installment id names (`inst_<loanId>_<n>`), else the user's only loan */
function loanOfInstallment(store, userId, installmentId, loanId) {
  if (loanId) return docOf(store, userId, loanId);
  const docs = userDocs(store, userId);
  return docs.find((d) => String(installmentId).startsWith(`inst_${d.loan.id}_`)) || (docs.length === 1 ? docs[0] : null);
}

/** Every stored loan document (all users) */
export const loanCount = (store) => store.docs.size;
/** Every stored installment state row (paid events, manual overrides), all loans */
export const stateRows = (store) => [...store.docs.values()].flatMap((d) => d.states);
/** Every stored extra payment, all loans */
export const extraPaymentCount = (store) => [...store.docs.values()].reduce((n, d) => n + d.extraPayments.length, 0);

export async function createLoan(store, userId, data) {
  return buildLoanView(save(store, userId, createLoanDoc(data, { resolveBank })));
}

/** The user's loans with their totals, newest first */
export async function getUserLoans(store, userId) {
  return userDocs(store, userId)
    .map(summarizeLoan)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export async function getLoanById(store, userId, loanId) {
  const doc = docOf(store, userId, loanId);
  return doc ? buildLoanView(doc) : null;
}

export async function updateLoan(store, userId, loanId, data) {
  const doc = docOf(store, userId, loanId);
  if (!doc) return null;
  return buildLoanView(save(store, userId, updateLoanDoc(doc, data, { resolveBank })));
}

export async function deleteLoan(store, userId, loanId) {
  return store.docs.delete(keyOf(userId, loanId));
}

export async function markInstallmentPaid(store, userId, installmentId, details = {}) {
  const doc = loanOfInstallment(store, userId, installmentId, details.loanId);
  if (!doc) return null;
  const res = markInstallmentPaidDoc(doc, installmentId, details);
  save(store, userId, res.doc);
  return res.installment;
}

export async function markInstallmentPaidCascade(store, userId, loanId, installmentId, details = {}) {
  const res = markInstallmentPaidCascadeDoc(docOf(store, userId, loanId), installmentId, details);
  save(store, userId, res.doc);
  const { doc: _doc, ...result } = res;
  return result;
}

export async function unmarkInstallmentPaid(store, userId, installmentId, loanId) {
  const doc = loanOfInstallment(store, userId, installmentId, loanId);
  if (!doc) return null;
  const res = unmarkInstallmentPaidDoc(doc, installmentId);
  save(store, userId, res.doc);
  return res.installment;
}

export async function bulkDistributeInstallments(store, userId, loanId, knownAmounts, totalRepaymentAmount) {
  const doc = docOf(store, userId, loanId);
  if (!doc) return null;
  return buildLoanView(save(store, userId, bulkDistributeInstallmentsDoc(doc, knownAmounts, totalRepaymentAmount)));
}

export async function addExtraPayment(store, userId, loanId, payment) {
  const res = addExtraPaymentDoc(docOf(store, userId, loanId), payment);
  save(store, userId, res.doc);
  return { success: true, fullyPaidOff: res.fullyPaidOff, extraPayment: res.extraPayment, loan: buildLoanView(res.doc) };
}

export async function getLoanExtraPayments(store, userId, loanId) {
  const doc = docOf(store, userId, loanId);
  return doc ? listExtraPaymentsDoc(doc) : [];
}

/**
 * Put a manual override on a pending installment, as older loans may still carry one (the app no
 * longer edits a single installment): its amount is fixed, the engine works its split from the balance
 * @returns {{ installment: object }}
 */
export function seedManualOverride(store, userId, loanId, installmentId, totalAmount) {
  const doc = docOf(store, userId, loanId);
  const target = buildLoanView(doc).installments.find((i) => i.id === installmentId);
  const now = new Date().toISOString();
  const row = {
    id: `inst_${loanId}_${target.installmentNumber}`,
    loanId,
    installmentNumber: target.installmentNumber,
    dueDate: target.dueDate,
    dueDateIso: target.dueDate,
    principalPortion: target.principalPortion,
    interestPortion: target.interestPortion,
    totalAmount,
    remainingBalanceAfter: target.remainingBalanceAfter,
    isPaid: false,
    paidDate: '',
    paidAmount: 0,
    isManualOverride: true,
    createdAt: now,
    updatedAt: now,
  };
  save(store, userId, { ...doc, states: [...doc.states.filter((s) => s.installmentNumber !== row.installmentNumber), row] });
  return { installment: row };
}
