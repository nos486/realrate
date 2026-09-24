/**
 * Parity: every loanDocument operation must give the same result as the loans repository, since
 * end-to-end encrypted accounts run the document engine in the browser instead of the server.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  dbCreateLoan,
  dbGetLoanById,
  dbGetUserLoans,
  dbUpdateLoan,
  dbMarkInstallmentPaid,
  dbMarkInstallmentPaidCascade,
  dbUnmarkInstallmentPaid,
  dbBulkDistributeInstallments,
  dbAddExtraPayment,
  dbGetLoanDocument,
} from '../../src/repositories/loans.repository.js';
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
} from '../../src/domain/loanDocument.js';
import { getBankById, matchBankIdByName } from '../../src/config/banks.config.js';
import { createMockD1 } from '../helpers/mockLoansD1.js';

const USER = 'user_1';

// Same standard-bank rules as the repository's resolveLoanBank (custom banks aside)
function resolveBank({ bankId, lenderName }) {
  const cleanName = String(lenderName || '').trim();
  const standard = getBankById(String(bankId || '').trim());
  if (standard) return { bankId: standard.id, lenderName: standard.name };
  const matched = matchBankIdByName(cleanName);
  if (matched) return { bankId: matched, lenderName: cleanName || getBankById(matched).name };
  return { bankId: '', lenderName: cleanName };
}

// Ids of generated rows are random on both sides; everything else must match exactly
const VOLATILE = new Set(['id', 'userId', 'user_id', 'loanId', 'loan_id', 'createdAt', 'updatedAt', 'dueDateIso']);
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (!VOLATILE.has(key)) out[key] = normalize(value[key]);
    }
    return out;
  }
  return value;
}

// The mock D1 ignores SQL aliases and returns snake_case columns, where real D1 returns the
// camelCase aliases — fold them together before comparing
const camelize = (row) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));

function normalizeView(view) {
  const copy = { ...view };
  // The mock D1 also returns extra payments newest-first regardless of the query's ORDER BY
  if (copy.extraPayments) {
    copy.extraPayments = copy.extraPayments.map(camelize).sort((a, b) =>
      String(a.paymentDate).localeCompare(String(b.paymentDate)) || Number(a.amount) - Number(b.amount));
  }
  return normalize(copy);
}

/** Runs each step against both the repository and the document engine */
function createHarness() {
  const env = { DB: createMockD1() };
  let doc = null;
  let loanId = null;

  const compare = async () => {
    const repoView = await dbGetLoanById(env, USER, loanId);
    expect(normalizeView(buildLoanView(doc))).toEqual(normalizeView(repoView));
    const [repoSummary] = (await dbGetUserLoans(env, USER)).filter((l) => l.id === loanId);
    expect(normalize(summarizeLoan(doc))).toEqual(normalize(repoSummary));
  };

  return {
    env,
    get doc() { return doc; },
    async create(data) {
      loanId = data.id;
      await dbCreateLoan(env, USER, data);
      doc = createLoanDoc(data, { resolveBank });
      await compare();
    },
    async update(data) {
      await dbUpdateLoan(env, USER, loanId, data);
      doc = updateLoanDoc(doc, data, { resolveBank });
      await compare();
    },
    async markPaid(installmentId, details = {}) {
      const repoInst = await dbMarkInstallmentPaid(env, USER, installmentId, { ...details, loanId });
      const res = markInstallmentPaidDoc(doc, installmentId, details);
      doc = res.doc;
      expect(normalize(res.installment)).toEqual(normalize(repoInst));
      await compare();
    },
    async cascade(installmentId, details = {}) {
      const repoRes = await dbMarkInstallmentPaidCascade(env, USER, loanId, installmentId, details);
      const res = markInstallmentPaidCascadeDoc(doc, installmentId, details);
      doc = res.doc;
      expect(normalize({ ...res, doc: undefined })).toEqual(normalize({ ...repoRes, doc: undefined }));
      await compare();
    },
    async unmark(installmentId) {
      await dbUnmarkInstallmentPaid(env, USER, installmentId, loanId);
      doc = unmarkInstallmentPaidDoc(doc, installmentId).doc;
      await compare();
    },
    async bulk(knownAmounts, total) {
      await dbBulkDistributeInstallments(env, USER, loanId, knownAmounts, total);
      doc = bulkDistributeInstallmentsDoc(doc, knownAmounts, total);
      await compare();
    },
    async extra(payment) {
      const repoRes = await dbAddExtraPayment(env, USER, loanId, payment);
      const res = addExtraPaymentDoc(doc, payment);
      doc = res.doc;
      expect(res.fullyPaidOff).toBe(repoRes.fullyPaidOff);
      expect(normalize(res.extraPayment)).toEqual(normalize(repoRes.extraPayment));
      await compare();
    },
    /** Both sides must reject with the same message */
    async expectBothReject(repoCall, docCall) {
      let repoError = null;
      let docError = null;
      try { await repoCall(env); } catch (e) { repoError = e; }
      try { docCall(doc); } catch (e) { docError = e; }
      expect(repoError).toBeTruthy();
      expect(docError).toBeInstanceOf(LoanDocumentError);
      expect(docError.message).toBe(repoError.message);
      expect(docError.statusCode).toBe(repoError.statusCode);
      await compare();
    },
  };
}

describe('loan document ↔ repository parity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T10:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('formula loan: payments, cascade, unmark, extra payments and edits', async () => {
    const h = createHarness();
    await h.create({
      id: 'loan_a', title: 'وام مسکن', bankId: 'maskan', principalAmount: 120_000_000,
      annualInterestRate: 18, installmentCount: 24, intervalMonths: 1, startDate: '1404-01-15',
      annualFeeAmount: 500_000, notes: 'یادداشت',
    });
    await h.markPaid('1');
    await h.markPaid('inst_loan_a_2', { paidDate: '1404-03-15', paidAmount: 6_500_000 });
    await h.unmark('2');
    await h.cascade('5', { paidDate: '1404-06-10' });
    await h.extra({ amount: 10_000_000, paymentDate: '1404-06-20', reductionMode: 'reduce_amount', notes: 'پاداش' });
    await h.extra({ amount: 5_000_000, paymentDate: '1404-07-01', reductionMode: 'reduce_term' });
    await h.update({ title: 'وام خانه', lenderName: 'ملت' });
    await h.update({ notes: '' });
    expect(listExtraPaymentsDoc(h.doc).map((p) => p.amount)).toEqual([5_000_000, 10_000_000]);

    // Moving the stored loan into an encrypted document must not change a single number
    const exported = await dbGetLoanDocument(h.env, USER, 'loan_a');
    expect(normalizeView(buildLoanView(exported))).toEqual(normalizeView(await dbGetLoanById(h.env, USER, 'loan_a')));
    expect(exported.loan.userId).toBeUndefined();
  });

  it('exported documents of distributed loans reproduce the stored schedule', async () => {
    const h = createHarness();
    await h.create({ id: 'loan_x', title: 'x', principalAmount: 9_000_000, installmentCount: 4, startDate: '1404-01-01', totalRepaymentAmount: 10_000_000 });
    await h.markPaid('2');
    await h.bulk({ 3: 1_000_000 });
    const exported = await dbGetLoanDocument(h.env, USER, 'loan_x');
    expect(normalizeView(buildLoanView(exported))).toEqual(normalizeView(await dbGetLoanById(h.env, USER, 'loan_x')));
    expect(await dbGetLoanDocument(h.env, USER, 'missing')).toBeNull();
  });

  it('financial edits drop pending overrides and respect paid history', async () => {
    const h = createHarness();
    await h.create({
      id: 'loan_b', title: 'خودرو', lenderName: 'صندوق فامیل', principalAmount: 50_000_000,
      annualInterestRate: 0, installmentCount: 10, startDate: '1404-02-01',
      customFirstInstallmentAmount: 8_000_000,
    });
    await h.markPaid('2');
    await h.update({ principalAmount: 60_000_000, installmentCount: 12 });
    await h.expectBothReject(
      (env) => dbUpdateLoan(env, USER, 'loan_b', { installmentCount: 0 }),
      (doc) => updateLoanDoc(doc, { installmentCount: 0 })
    );
    await h.expectBothReject(
      (env) => dbUpdateLoan(env, USER, 'loan_b', { startDate: '1404-05-01' }),
      (doc) => updateLoanDoc(doc, { startDate: '1404-05-01' })
    );
    await h.expectBothReject(
      (env) => dbMarkInstallmentPaidCascade(env, USER, 'loan_b', '2', {}),
      (doc) => markInstallmentPaidCascadeDoc(doc, '2')
    );
  });

  it('distributed loans: total repayment basis, bulk re-plan, and no extra payments', async () => {
    const h = createHarness();
    await h.create({
      id: 'loan_c', title: 'قرض', principalAmount: 30_000_000, installmentCount: 6,
      startDate: '1404-01-31', totalRepaymentAmount: 36_000_000,
    });
    await h.markPaid('1');
    await h.bulk({ 3: 9_000_000 });
    await h.bulk({ 4: 5_000_000, 6: 4_000_000 }, 34_000_000);
    await h.expectBothReject(
      (env) => dbBulkDistributeInstallments(env, USER, 'loan_c', { 1: 1_000_000 }),
      (doc) => bulkDistributeInstallmentsDoc(doc, { 1: 1_000_000 })
    );
    await h.expectBothReject(
      (env) => dbAddExtraPayment(env, USER, 'loan_c', { amount: 1_000_000, paymentDate: '1404-03-01' }),
      (doc) => addExtraPaymentDoc(doc, { amount: 1_000_000, paymentDate: '1404-03-01' })
    );
  });

  it('custom per-installment amounts at creation', async () => {
    const h = createHarness();
    await h.create({
      id: 'loan_d', title: 'اقساط سفارشی', principalAmount: 40_000_000, annualInterestRate: 20,
      installmentCount: 8, intervalMonths: 3, startDate: '1403-11-30',
      customInstallments: [{ installmentNumber: 2, totalAmount: 7_000_000 }, { installmentNumber: 5, totalAmount: 3_000_000 }],
    });
    await h.cascade('3');
    await h.unmark('3');
  });

  it('an extra payment that clears the balance closes the loan', async () => {
    const h = createHarness();
    await h.create({ id: 'loan_e', title: 'کوچک', principalAmount: 10_000_000, annualInterestRate: 12, installmentCount: 5, startDate: '1404-01-01' });
    await h.markPaid('1');
    await h.extra({ amount: 50_000_000, paymentDate: '1404-02-10' });
    expect(buildLoanView(h.doc).remainingBalance).toBe(0);
  });

  it('create validation matches the API', () => {
    expect(() => createLoanDoc({ principalAmount: 1, installmentCount: 1 })).toThrow('عنوان وام الزامی است.');
    expect(() => createLoanDoc({ title: 'x', installmentCount: 1 })).toThrow('مبلغ اصل وام');
    expect(() => createLoanDoc({ title: 'x', principalAmount: 1 })).toThrow('تعداد اقساط');
  });

  it('never mutates the input document', () => {
    const doc = createLoanDoc({ title: 'x', principalAmount: 1_000_000, installmentCount: 3, startDate: '1404-01-01' });
    const snapshot = JSON.stringify(doc);
    markInstallmentPaidDoc(doc, '1');
    markInstallmentPaidCascadeDoc(doc, '3');
    addExtraPaymentDoc(doc, { amount: 100_000, paymentDate: '1404-01-20' });
    updateLoanDoc(doc, { principalAmount: 2_000_000 });
    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});
