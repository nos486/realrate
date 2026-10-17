/**
 * loanStatus.test.js — A loan is settled when nothing is left to pay
 * (web/src/features/loans/utils/loanStatus.js), which is what the loans list hides by default
 */
import { describe, it, expect } from 'vitest';
import { isLoanCompleted, loanDueTone } from '../../../web/src/features/loans/utils/loanStatus.js';

describe('isLoanCompleted', () => {
  it('is true with no balance left or every installment paid', () => {
    expect(isLoanCompleted({ remainingBalance: 0, totalCount: 12, paidCount: 12 })).toBe(true);
    expect(isLoanCompleted({ remainingBalance: 5, installmentCount: 3, paidCount: 3 })).toBe(true);
  });
  it('is false while something is owed', () => {
    expect(isLoanCompleted({ remainingBalance: 100, totalCount: 12, paidCount: 5 })).toBe(false);
    expect(isLoanCompleted({ remainingBalance: 100 })).toBe(false);
  });
});

describe('loanDueTone', () => {
  const loan = (dueDate) => ({ remainingBalance: 100, totalCount: 12, paidCount: 5, nextDueInstallment: { dueDate } });
  it('is red when the next installment is near or overdue', () => {
    expect(loanDueTone(loan('2026-10-17'), '2026-10-17')).toBe('negative');
    expect(loanDueTone(loan('2026-10-24'), '2026-10-17')).toBe('negative');
    expect(loanDueTone(loan('2026-10-01'), '2026-10-17')).toBe('negative');
  });
  it('is amber in between and green when far', () => {
    expect(loanDueTone(loan('2026-10-25'), '2026-10-17')).toBe('warning');
    expect(loanDueTone(loan('2026-11-06'), '2026-10-17')).toBe('warning');
    expect(loanDueTone(loan('2026-11-07'), '2026-10-17')).toBe('positive');
  });
  it('is green for a settled loan or one with no due installment', () => {
    expect(loanDueTone({ remainingBalance: 0, totalCount: 3, paidCount: 3 }, '2026-10-17')).toBe('positive');
    expect(loanDueTone({ remainingBalance: 100 }, '2026-10-17')).toBe('positive');
  });
});
