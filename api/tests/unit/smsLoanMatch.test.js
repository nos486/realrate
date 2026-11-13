/**
 * smsLoanMatch.test.js — A withdrawal equal to a loan's next installment is suggested as its payment
 */

import { describe, it, expect } from 'vitest';
import { matchSmsLoanInstallment } from '../../../web/src/features/sms-inbox/smsLoanMatch.js';
import { smsExpenseDraft } from '../../../web/src/features/sms-inbox/smsDrafts.js';

const loan = (id, bankId, totalAmount, extra = {}) => ({ id, title: `loan ${id}`, bankId, nextDueInstallment: { id: `${id}_3`, installmentNumber: 3, totalAmount }, ...extra });
const tx = { direction: 'debit', amount: 3125000, bankId: 'mellat', description: 'بدهی ش.ق 1402243881821', date: '2026-11-13' };

describe('matchSmsLoanInstallment', () => {
  it('matches the loan whose next installment has the amount', () => {
    const hit = matchSmsLoanInstallment(tx, [loan('a', 'mellat', 3125000), loan('b', 'melli', 900000)]);
    expect(hit.loan.id).toBe('a');
  });

  it('no match for another amount, a deposit, or no loans', () => {
    expect(matchSmsLoanInstallment(tx, [loan('a', 'mellat', 3000000)])).toBeNull();
    expect(matchSmsLoanInstallment({ ...tx, direction: 'credit' }, [loan('a', 'mellat', 3125000)])).toBeNull();
    expect(matchSmsLoanInstallment(tx, [])).toBeNull();
    expect(matchSmsLoanInstallment(tx, [{ id: 'x', nextDueInstallment: null }])).toBeNull();
  });

  it('same amount in several loans: the message bank decides, else none', () => {
    expect(matchSmsLoanInstallment(tx, [loan('a', 'melli', 3125000), loan('b', 'mellat', 3125000)]).loan.id).toBe('b');
    expect(matchSmsLoanInstallment(tx, [loan('a', 'melli', 3125000), loan('b', 'parsian', 3125000)])).toBeNull();
  });
});

describe('smsExpenseDraft with a loan match', () => {
  it('is the installment payment linked to the loan', () => {
    const match = matchSmsLoanInstallment(tx, [loan('a', 'mellat', 3125000)]);
    const draft = smsExpenseDraft(tx, [], match);
    expect(draft.category).toBe('installments');
    expect(draft.loanInstallment).toEqual({ loanId: 'a', installmentId: 'a_3' });
    expect(draft.amount).toBe(3125000);
  });

  it('without a match, an installment message still starts in the installments category', () => {
    const draft = smsExpenseDraft(tx, []);
    expect(draft.category).toBe('installments');
    expect(draft.loanInstallment).toBeUndefined();
  });
});
