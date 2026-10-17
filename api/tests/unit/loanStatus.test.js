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
  const tone = (dueDate) => loanDueTone(loan(dueDate), '2026-10-17');
  it('is red when the next installment is 7 days away or less, overdue included', () => {
    expect(tone('2026-10-01')).toBe('negative');
    expect(tone('2026-10-17')).toBe('negative');
    expect(tone('2026-10-24')).toBe('negative');
  });
  it('is amber from 8 to 14 days', () => {
    expect(tone('2026-10-25')).toBe('warning');
    expect(tone('2026-10-31')).toBe('warning');
  });
  it('has no tone from 15 to 25 days and is green beyond', () => {
    expect(tone('2026-11-01')).toBe('');
    expect(tone('2026-11-11')).toBe('');
    expect(tone('2026-11-12')).toBe('positive');
  });
  it('is green for a settled loan or one with no due installment', () => {
    expect(loanDueTone({ remainingBalance: 0, totalCount: 3, paidCount: 3 }, '2026-10-17')).toBe('positive');
    expect(loanDueTone({ remainingBalance: 100 }, '2026-10-17')).toBe('positive');
  });
});
