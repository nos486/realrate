/**
 * loanDocument.test.js — The loan document itself: what a new loan needs, and that no operation
 * changes the document it is given (the rules are in loanRules.test.js)
 */
import { describe, it, expect } from 'vitest';
import {
  createLoanDoc,
  buildLoanView,
  markInstallmentPaidDoc,
  markInstallmentPaidCascadeDoc,
  addExtraPaymentDoc,
  updateLoanDoc,
} from '../../src/domain/loanDocument.js';

describe('loan document', () => {
  it('an extra payment that clears the balance closes the loan', () => {
    let doc = createLoanDoc({ id: 'loan_e', title: 'کوچک', principalAmount: 10_000_000, annualInterestRate: 12, installmentCount: 5, startDate: '1404-01-01' });
    doc = markInstallmentPaidDoc(doc, '1').doc;
    const res = addExtraPaymentDoc(doc, { amount: 50_000_000, paymentDate: '1404-02-10' });
    expect(res.fullyPaidOff).toBe(true);
    expect(buildLoanView(res.doc).remainingBalance).toBe(0);
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

  it('an edited total repayment re-plans the pending installments and keeps paid ones', () => {
    let doc = createLoanDoc({ id: 'loan_t', title: 'x', principalAmount: 12_000_000, annualInterestRate: 12, installmentCount: 6, startDate: '1404-01-01' });
    doc = markInstallmentPaidDoc(doc, '1').doc;
    const before = buildLoanView(doc);
    const paidAmount = before.installments[0].totalAmount;
    const total = Math.round(before.totalRepaymentAmount) + 600_000;
    const view = buildLoanView(updateLoanDoc(doc, { totalRepaymentAmount: total }));
    expect(view.scheduleMode).toBe('distributed');
    expect(view.totalRepaymentAmount).toBe(total);
    expect(view.installments[0].isPaid).toBe(true);
    expect(view.installments[0].totalAmount).toBe(paidAmount);
  });

  it('an unchanged total leaves the schedule untouched; a bad total is refused', () => {
    const doc = createLoanDoc({ id: 'loan_u', title: 'x', principalAmount: 6_000_000, annualInterestRate: 0, installmentCount: 3, startDate: '1404-01-01' });
    const total = buildLoanView(doc).totalRepaymentAmount;
    expect(buildLoanView(updateLoanDoc(doc, { totalRepaymentAmount: total })).scheduleMode).toBe('formula');
    expect(() => updateLoanDoc(doc, { totalRepaymentAmount: 0 })).toThrow('مبلغ کل بازپرداخت');
  });
});
