import { describe, it, expect } from 'vitest';
import { summarizeLoanFunding, fundingLoanOptions, isLoanSettled, isoDayOf } from '../../src/domain/loanFunding.js';
import { validateExpense } from '../../src/domain/expenseDocument.js';

const loan = { id: 'loan_a', principalAmount: 100_000_000, installmentCount: 12, paidCount: 2, remainingBalance: 90_000_000 };

describe('loanFunding', () => {
  it('sums only the expenses funded by the loan, dollars at their rate', () => {
    const usage = summarizeLoanFunding(loan, [
      { id: '1', loanId: 'loan_a', amount: 30_000_000, currency: 'IRT', date: '2026-09-01' },
      { id: '2', loanId: 'loan_a', amount: 100, currency: 'USD', usdRate: 100_000, date: '2026-09-05' },
      { id: '3', loanId: 'loan_b', amount: 5_000_000, currency: 'IRT', date: '2026-09-02' },
      { id: '4', amount: 7_000_000, currency: 'IRT', date: '2026-09-03' },
    ]);
    expect(usage.spent).toBe(40_000_000);
    expect(usage.remaining).toBe(60_000_000);
    expect(usage.overspent).toBe(0);
    expect(usage.count).toBe(2);
    expect(usage.items.map((e) => e.id)).toEqual(['2', '1']);
  });

  it('counts portfolio holdings bought with the loan (Shamsi buy date), newest first', () => {
    const usage = summarizeLoanFunding(loan, [
      { id: 'e1', loanId: 'loan_a', amount: 10_000_000, currency: 'IRT', date: '2026-09-01' },
    ], {
      holdings: [
        { id: 'h1', loanId: 'loan_a', amount: 2, buyPrice: 20_000_000, buyDate: '1405/07/08' },
        { id: 'h2', loanId: 'loan_b', amount: 1, buyPrice: 5_000_000, buyDate: '1405/07/01' },
        { id: 'h3', amount: 1, buyPrice: 5_000_000, buyDate: '1405/07/01' },
      ],
    });
    expect(usage.spent).toBe(50_000_000);
    expect(usage.count).toBe(2);
    expect(usage.items.map((i) => [i.kind, i.id, i.date])).toEqual([
      ['holding', 'h1', '2026-09-30'],
      ['expense', 'e1', '2026-09-01'],
    ]);
  });

  it('reads Shamsi, Persian-digit and Gregorian days', () => {
    expect(isoDayOf('1405/07/08')).toBe('2026-09-30');
    expect(isoDayOf('۱۴۰۵/۰۱/۰۱')).toBe('2026-03-21');
    expect(isoDayOf('2026-09-30')).toBe('2026-09-30');
    expect(isoDayOf('')).toBe('');
  });

  it('reports spending beyond the principal', () => {
    const usage = summarizeLoanFunding(loan, [{ id: '1', loanId: 'loan_a', amount: 120_000_000, currency: 'IRT', date: '2026-09-01' }]);
    expect(usage.remaining).toBe(0);
    expect(usage.overspent).toBe(20_000_000);
  });

  it('offers loans not yet settled, plus the one already chosen', () => {
    const settled = { id: 'loan_s', installmentCount: 6, paidCount: 6, remainingBalance: 0 };
    expect(isLoanSettled(settled)).toBe(true);
    expect(fundingLoanOptions([loan, settled]).map((l) => l.id)).toEqual(['loan_a']);
    expect(fundingLoanOptions([loan, settled], 'loan_s').map((l) => l.id)).toEqual(['loan_a', 'loan_s']);
  });

  it('keeps a valid loanId on an expense and drops anything else', () => {
    const base = { groupId: 'exg_1', title: 'کاشی', amount: 1000, date: '2026-09-01' };
    expect(validateExpense({ ...base, loanId: 'loan_a' }).value.loanId).toBe('loan_a');
    expect(validateExpense({ ...base, loanId: 'bad id!' }).value.loanId).toBe('');
    expect(validateExpense(base).value.loanId).toBe('');
  });
});
