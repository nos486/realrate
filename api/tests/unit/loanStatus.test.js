/**
 * loanStatus.test.js — A loan is settled when nothing is left to pay
 * (web/src/features/loans/utils/loanStatus.js), which is what the loans list hides by default
 */
import { describe, it, expect } from 'vitest';
import { isLoanCompleted } from '../../../web/src/features/loans/utils/loanStatus.js';

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
