/**
 * spendingRecords.test.js — All spending is in the expenses (web/src/shared/vault/spendingRecords.js):
 * a subscription's due payments, a loan installment paid (or unpaid) on the loans page and an
 * extra payment are recorded as everyday expenses, each under an id made from what it records,
 * so recording it again never makes a second one
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  saved: new Map(),
  deleted: [],
  dayExpenses: [],
  saveExpense: null,
}));
m.saveExpense = vi.fn(async (input, existing, { id } = {}) => {
  const expense = { id, ...input };
  m.saved.set(id, expense);
  return { success: true, expense };
});

vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({
  ensureDailyGroup: async () => ({ id: 'grp_daily' }),
  getExpenseGroups: async () => ({ groups: [] }),
  saveExpense: m.saveExpense,
  getExpenses: async () => ({ success: true, expenses: m.dayExpenses }),
  deleteExpense: async (id) => {
    m.deleted.push(id);
    return { success: true };
  },
}));

const {
  spendingExpenseId, matchingRecord, recordSpending, recordSubscriptionPayments, recordInstallmentPayments, removeInstallmentPayment, recordExtraPayment,
} = await import('../../../web/src/shared/vault/spendingRecords.js');

beforeEach(() => {
  vi.clearAllMocks();
  m.saved = new Map();
  m.deleted = [];
  m.dayExpenses = [];
});

describe('the id of a recorded outflow', () => {
  it('is the same for the same outflow, and a valid record id', () => {
    expect(spendingExpenseId('sub:sub_1:2026-02-11')).toBe(spendingExpenseId('sub:sub_1:2026-02-11'));
    expect(spendingExpenseId('sub:sub_1:2026-02-11')).not.toBe(spendingExpenseId('sub:sub_1:2026-03-13'));
    expect(spendingExpenseId('loan:l:i')).toMatch(/^exp_s[0-9a-f]{16}$/);
  });
});

describe('subscriptions', () => {
  const sub = {
    id: 'sub_1', name: 'ChatGPT', amount: 20, currency: 'USD', cycleMonths: 1, startDate: '2026-01-12',
    autoRenew: true, status: 'active', accountId: 'acc_1', lastPaidOn: '2026-01-12',
  };
  const saveSubscription = vi.fn(async (input, existing) => ({ ...existing, ...input }));

  it('records each renewal due as an expense, and moves its last payment on', async () => {
    const saved = await recordSubscriptionPayments(sub, '2026-04-01', { saveSubscription });
    expect([...m.saved.values()].map((e) => e.date)).toEqual(['2026-02-11', '2026-03-13']);
    expect(m.saved.get(spendingExpenseId('sub:sub_1:2026-02-11'))).toMatchObject({
      groupId: 'grp_daily', title: 'ChatGPT', amount: 20, currency: 'USD', category: 'subscriptions', subscriptionId: 'sub_1', accountId: 'acc_1',
    });
    // The subscription was already moved on: saving the expense doesn't do it again
    expect(m.saveExpense.mock.calls[0][2]).toMatchObject({ syncLinks: false });
    expect(saveSubscription).toHaveBeenCalledWith({ lastPaidOn: '2026-03-13' }, sub);
    expect(saved.lastPaidOn).toBe('2026-03-13');
  });

  it('records nothing when it has every payment', async () => {
    expect(await recordSubscriptionPayments({ ...sub, lastPaidOn: '2026-03-13' }, '2026-04-01', { saveSubscription })).toBeNull();
    expect(m.saveExpense).not.toHaveBeenCalled();
  });
});

describe('loans', () => {
  const loan = { id: 'loan_1', title: 'وام مسکن' };

  it('an installment paid (and the earlier ones paid with it) becomes an expense each', async () => {
    await recordInstallmentPayments(loan, [
      { id: 'inst_3', paidDate: '2026-02-05', paidAmount: 4_000_000 },
      { id: 'inst_2', paidDate: '2026-02-05', paidAmount: 4_000_000 },
      { id: 'inst_x', paidDate: '', paidAmount: 0 },
    ]);
    expect(m.saved.size).toBe(2);
    expect(m.saved.get(spendingExpenseId('loan:loan_1:inst_3'))).toMatchObject({
      title: 'قسط وام مسکن', amount: 4_000_000, currency: 'IRT', date: '2026-02-05', category: 'installments',
      loanInstallment: { loanId: 'loan_1', installmentId: 'inst_3' },
    });
  });

  it('an installment unpaid removes its expense — recorded here or by the user, naming it', async () => {
    m.dayExpenses = [
      { id: 'exp_user', loanInstallment: { loanId: 'loan_1', installmentId: 'inst_3' } },
      { id: 'exp_other', loanInstallment: { loanId: 'loan_1', installmentId: 'inst_4' } },
    ];
    await removeInstallmentPayment('loan_1', 'inst_3', '2026-02-05');
    expect(m.deleted.sort()).toEqual([spendingExpenseId('loan:loan_1:inst_3'), 'exp_user'].sort());
  });

  it('an extra payment is an expense too', async () => {
    await recordExtraPayment(loan, { id: 'xp_1', amount: 10_000_000, paymentDate: '2026-02-06' });
    expect(m.saved.get(spendingExpenseId('loanx:loan_1:xp_1'))).toMatchObject({ title: 'پرداخت اضافه وام مسکن', amount: 10_000_000, date: '2026-02-06', category: 'installments' });
  });
});

describe('a payment already recorded by hand', () => {
  it('is linked instead of recorded twice: same day, amount and currency, naming nothing', async () => {
    m.dayExpenses = [
      { id: 'exp_hand', date: '2026-02-11', amount: 20, currency: 'USD', category: 'software', title: 'ChatGPT Plus', accountId: '' },
    ];
    await recordSpending('sub:sub_1:2026-02-11', { title: 'ChatGPT', amount: 20, currency: 'USD', date: '2026-02-11', category: 'subscriptions', subscriptionId: 'sub_1', accountId: 'acc_1' });
    expect(m.saveExpense).toHaveBeenCalledTimes(1);
    const [input, existing] = m.saveExpense.mock.calls[0];
    expect(existing.id).toBe('exp_hand');
    // Its own title stays; the category and the link are the payment's
    expect(input).toEqual({ category: 'subscriptions', subscriptionId: 'sub_1', accountId: 'acc_1' });
  });

  it('a record of another amount or currency, already linked, or recorded here is not taken', () => {
    const day = [
      { id: 'a', amount: 21, currency: 'USD' },
      { id: 'b', amount: 20, currency: 'IRT' },
      { id: 'c', amount: 20, currency: 'USD', chequeId: 'chq_1' },
      { id: spendingExpenseId('x'), amount: 20, currency: 'USD' },
    ];
    expect(matchingRecord('expense', day, { amount: 20, currency: 'USD' })).toBeNull();
    expect(matchingRecord('expense', [...day, { id: 'd', amount: 20, currency: 'USD' }], { amount: 20, currency: 'USD' }).id).toBe('d');
  });

  it('the same outflow recorded again rewrites its own expense', async () => {
    const id = spendingExpenseId('loan:loan_1:inst_3');
    m.dayExpenses = [{ id, date: '2026-02-05', amount: 4_000_000, currency: 'IRT', groupId: 'grp_daily', loanInstallment: { loanId: 'loan_1', installmentId: 'inst_3' } }];
    await recordInstallmentPayments({ id: 'loan_1', title: 'وام' }, [{ id: 'inst_3', paidDate: '2026-02-05', paidAmount: 4_000_000 }]);
    expect(m.saveExpense.mock.calls[0][1].id).toBe(id);
    expect(m.saveExpense.mock.calls[0][2]).toMatchObject({ id });
  });
});
