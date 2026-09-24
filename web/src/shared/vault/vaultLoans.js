/**
 * vaultLoans.js — Loans of an end-to-end encrypted account
 *
 * Same functions and response shapes as the loans REST API (features/loans/api/loanApi.js), but
 * each loan lives in one encrypted vault record: the whole loan document is decrypted here, the
 * operation runs locally through the shared loan engine (utils/loanDocument.js — the exact rules
 * the server applies to plaintext loans), and the new document is encrypted and stored back.
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
  LoanDocumentError,
} from '../../utils/loanDocument.js';
import { getBankById, isCustomBankId, matchBankIdByName } from '../../config/banks.config.js';
import { ensureCustomBanks } from '../banks/useCustomBanks.js';
import { listVaultRecords, putVaultRecord, deleteVaultRecord } from './vaultApi.js';
import { encryptVaultRecord, decryptVaultRecord } from './vaultStore.js';

const KIND = 'loan';

/** Decrypted documents by loan id, refreshed on every list */
let docs = new Map();

const notFound = (message = 'وام مورد نظر یافت نشد.') => new LoanDocumentError(message, 404);

/** Same rules as the server's resolveLoanBank */
async function makeBankResolver() {
  const customBanks = await ensureCustomBanks().catch(() => []);
  return ({ bankId, lenderName }) => {
    const cleanName = String(lenderName || '').trim();
    const cleanId = String(bankId || '').trim();
    if (cleanId) {
      const standard = getBankById(cleanId);
      if (standard) return { bankId: standard.id, lenderName: standard.name };
      if (isCustomBankId(cleanId)) {
        const custom = customBanks.find((b) => b.id === cleanId);
        if (custom) return { bankId: custom.id, lenderName: custom.name };
      }
      throw new LoanDocumentError('بانک انتخاب‌شده معتبر نیست.', 400);
    }
    const matched = matchBankIdByName(cleanName);
    if (matched) return { bankId: matched, lenderName: cleanName || getBankById(matched).name };
    return { bankId: '', lenderName: cleanName };
  };
}

async function loadDocs() {
  const res = await listVaultRecords(KIND);
  const next = new Map();
  for (const record of res?.records || []) {
    const doc = await decryptVaultRecord(record.payload);
    if (doc?.loan?.id) next.set(record.id, doc);
  }
  docs = next;
  return docs;
}

async function getDoc(loanId) {
  if (!docs.has(loanId)) await loadDocs();
  const doc = docs.get(loanId);
  if (!doc) throw notFound();
  return doc;
}

async function saveDoc(doc) {
  const payload = await encryptVaultRecord(doc);
  await putVaultRecord(KIND, doc.loan.id, payload);
  docs.set(doc.loan.id, doc);
  return doc;
}

/** Forget decrypted documents (lock / logout) */
export function clearVaultLoansCache() {
  docs = new Map();
}

export async function getLoans() {
  await loadDocs();
  const loans = [...docs.values()]
    .map(summarizeLoan)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { success: true, count: loans.length, loans };
}

export async function createLoan(loanData) {
  const doc = createLoanDoc(loanData, { resolveBank: await makeBankResolver() });
  await saveDoc(doc);
  return { success: true, loan: buildLoanView(doc) };
}

export async function getLoanDetail(loanId) {
  return { success: true, loan: buildLoanView(await getDoc(loanId)) };
}

export async function updateLoan(loanId, loanData) {
  const doc = updateLoanDoc(await getDoc(loanId), loanData, { resolveBank: await makeBankResolver() });
  await saveDoc(doc);
  return { success: true, loan: buildLoanView(doc) };
}

export async function deleteLoan(loanId) {
  await deleteVaultRecord(KIND, loanId);
  docs.delete(loanId);
  return { success: true, message: 'وام و اقساط مربوطه با موفقیت حذف شدند.' };
}

export async function markInstallmentPaid(loanId, installmentId, details = {}) {
  const current = await getDoc(loanId);
  if (details.cascade) {
    const res = markInstallmentPaidCascadeDoc(current, installmentId, details);
    await saveDoc(res.doc);
    return {
      success: true,
      installment: res.installment,
      cascadedCount: res.cascadedCount,
      cascadedTotal: res.cascadedTotal,
      cascadedInstallments: res.cascadedInstallments,
    };
  }
  const res = markInstallmentPaidDoc(current, installmentId, details);
  if (!res.installment) throw notFound('قسط مورد نظر یافت نشد.');
  await saveDoc(res.doc);
  return { success: true, installment: res.installment, cascadedCount: 0, cascadedTotal: 0, cascadedInstallments: [] };
}

export async function unmarkInstallmentPaid(loanId, installmentId) {
  const res = unmarkInstallmentPaidDoc(await getDoc(loanId), installmentId);
  if (res.doc !== docs.get(loanId)) await saveDoc(res.doc);
  return { success: true, installment: res.installment, cascadedCount: 0, cascadedTotal: 0, cascadedInstallments: [] };
}

export async function bulkDistributeInstallments(loanId, knownAmounts, totalRepaymentAmount) {
  const doc = bulkDistributeInstallmentsDoc(await getDoc(loanId), knownAmounts || {}, totalRepaymentAmount);
  await saveDoc(doc);
  return { success: true, loan: buildLoanView(doc) };
}

export async function addLoanExtraPayment(loanId, paymentData = {}) {
  const res = addExtraPaymentDoc(await getDoc(loanId), {
    amount: paymentData.amount,
    paymentDate: paymentData.paymentDate,
    reductionMode: paymentData.reductionMode || 'reduce_amount',
    notes: paymentData.notes || '',
  });
  await saveDoc(res.doc);
  return { success: true, fullyPaidOff: res.fullyPaidOff, extraPayment: res.extraPayment, loan: buildLoanView(res.doc) };
}

export async function getLoanExtraPayments(loanId) {
  const extraPayments = listExtraPaymentsDoc(await getDoc(loanId));
  return { success: true, count: extraPayments.length, extraPayments };
}
