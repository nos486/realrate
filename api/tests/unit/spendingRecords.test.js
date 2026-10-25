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
  spendingExpenseId, recordSpending, recordSubscriptionPayments, followSubscriptionEdit, recordInstallmentPayments, removeInstallmentPayment, recordExtraPayment, installmentNumberOf, removeLoanPayments, renameLoanPayments, dropDuplicateInstallmentPayments, sameInstallment,
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

describe('a subscription payment already recorded under another day', () => {
  // Yearly, its start date moved from 1405/07/28 to 1405/07/27 after the first payment was recorded
  const sub = {
    id: 'sub_2', name: 'Suno', amount: 100, currency: 'USD', cycleMonths: 12, startDate: '2026-10-19',
    autoRenew: true, status: 'active', accountId: 'acc_1', lastPaidOn: '',
  };
  const saveSubscription = vi.fn(async (input, existing) => ({ ...existing, ...input }));

  it('is not recorded again, even when its last payment was lost (a stale copy)', async () => {
    m.dayExpenses = [{ id: spendingExpenseId('sub:sub_2:2026-10-20'), date: '2026-10-20', subscriptionId: 'sub_2', recordedBy: 'subscription' }];
    const saved = await recordSubscriptionPayments(sub, '2026-10-25', { saveSubscription });
    expect(m.saveExpense).not.toHaveBeenCalled();
    expect(saved.lastPaidOn).toBe('2026-10-19');
  });

  it('another subscription\'s expense doesn\'t count', async () => {
    m.dayExpenses = [{ id: 'exp_x', date: '2026-10-19', subscriptionId: 'sub_9' }];
    await recordSubscriptionPayments(sub, '2026-10-25', { saveSubscription });
    expect(m.saveExpense).toHaveBeenCalledTimes(1);
  });
});

describe('a subscription edited', () => {
  const before = {
    id: 'sub_2', name: 'Suno', amount: 100, currency: 'USD', cycleMonths: 12, startDate: '2026-10-20',
    autoRenew: true, status: 'active', accountId: 'acc_1', lastPaidOn: '2026-10-20', category: 'software',
  };
  const own = { id: 'exp_s1', title: 'Suno', amount: 100, currency: 'USD', date: '2026-10-20', subscriptionId: 'sub_2', recordedBy: 'subscription', accountId: 'acc_1' };
  const users = { id: 'exp_u', title: 'Suno', amount: 100, currency: 'USD', date: '2026-10-20', subscriptionId: 'sub_2', accountId: 'acc_1' };

  it('its payments move with its start date and take its new name; the user\'s own stay', async () => {
    m.dayExpenses = [own, users];
    const changed = await followSubscriptionEdit({ ...before, startDate: '2026-10-19', name: 'Suno Pro', category: 'music' }, before, '2026-10-25');
    expect(changed).toBe(1);
    expect(m.saveExpense).toHaveBeenCalledWith({ title: 'Suno Pro', date: '2026-10-19' }, own, { syncLinks: false, asOwner: true });
  });

  it('the latest payment takes its new price and account', async () => {
    const older = { ...own, id: 'exp_s0', date: '2025-10-20' };
    m.dayExpenses = [older, own];
    await followSubscriptionEdit({ ...before, amount: 120, accountId: 'acc_2' }, before, '2026-10-25');
    expect(m.saveExpense).toHaveBeenCalledTimes(1);
    expect(m.saveExpense).toHaveBeenCalledWith({ amount: 120, currency: 'USD', accountId: 'acc_2' }, own, { syncLinks: false, asOwner: true });
  });

  it('nothing for a change its payments don\'t carry (its category)', async () => {
    m.dayExpenses = [own];
    expect(await followSubscriptionEdit({ ...before, category: 'music' }, before, '2026-10-25')).toBe(0);
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
    expect(m.saved.get(spendingExpenseId('loan:loan_1:n3'))).toMatchObject({
      title: 'قسط ۳ وام مسکن', amount: 4_000_000, currency: 'IRT', date: '2026-02-05', category: 'installments',
      loanInstallment: { loanId: 'loan_1', installmentId: 'inst_3' },
    });
  });

  it('the account a payment was paid from goes on its expense (installment and extra payment)', async () => {
    await recordInstallmentPayments(loan, [{ id: 'inst_3', paidDate: '2026-02-05', paidAmount: 4_000_000 }], { accountId: 'acc_9' });
    expect(m.saved.get(spendingExpenseId('loan:loan_1:n3'))).toMatchObject({ accountId: 'acc_9' });
    await recordExtraPayment(loan, { id: 'xp_1', amount: 10_000_000, paymentDate: '2026-02-06' }, { accountId: 'acc_9' });
    expect(m.saved.get(spendingExpenseId('loanx:loan_1:xp_1'))).toMatchObject({ accountId: 'acc_9' });
  });

  it('an installment unpaid removes its expense — recorded here or by the user, naming it', async () => {
    m.dayExpenses = [
      { id: 'exp_user', loanInstallment: { loanId: 'loan_1', installmentId: 'inst_3' } },
      { id: 'exp_other', loanInstallment: { loanId: 'loan_1', installmentId: 'inst_4' } },
    ];
    await removeInstallmentPayment('loan_1', 'inst_3', '2026-02-05');
    expect(m.deleted.sort()).toEqual([spendingExpenseId('loan:loan_1:n3'), spendingExpenseId('loan:loan_1:inst_3'), 'exp_user'].sort());
  });

  it('an extra payment is an expense too', async () => {
    await recordExtraPayment(loan, { id: 'xp_1', amount: 10_000_000, paymentDate: '2026-02-06' });
    expect(m.saved.get(spendingExpenseId('loanx:loan_1:xp_1'))).toMatchObject({ title: 'پرداخت اضافه وام مسکن', amount: 10_000_000, date: '2026-02-06', category: 'installments' });
  });
});

describe('a payment already recorded by hand', () => {
  it('is never taken by its amount: the payment gets its own expense', async () => {
    m.dayExpenses = [
      { id: 'exp_hand', date: '2026-02-11', amount: 20, currency: 'USD', category: 'software', title: 'ChatGPT Plus', accountId: '' },
    ];
    await recordSpending('sub:sub_1:2026-02-11', { title: 'ChatGPT', amount: 20, currency: 'USD', date: '2026-02-11', category: 'subscriptions', subscriptionId: 'sub_1', accountId: 'acc_1' });
    expect(m.saveExpense).toHaveBeenCalledTimes(1);
    const [input, existing, options] = m.saveExpense.mock.calls[0];
    expect(existing).toBeNull();
    expect(options.id).toBe(spendingExpenseId('sub:sub_1:2026-02-11'));
    expect(input).toMatchObject({ title: 'ChatGPT', subscriptionId: 'sub_1' });
  });

  it('the same outflow recorded again rewrites its own expense', async () => {
    const id = spendingExpenseId('loan:loan_1:n3');
    m.dayExpenses = [{ id, date: '2026-02-05', amount: 4_000_000, currency: 'IRT', groupId: 'grp_daily', loanInstallment: { loanId: 'loan_1', installmentId: 'inst_3' } }];
    await recordInstallmentPayments({ id: 'loan_1', title: 'وام' }, [{ id: 'inst_3', paidDate: '2026-02-05', paidAmount: 4_000_000 }]);
    expect(m.saveExpense.mock.calls[0][1].id).toBe(id);
    expect(m.saveExpense.mock.calls[0][2]).toMatchObject({ id });
  });
});

describe('a cheque payment', () => {
  it('gets its own expense, not a same-amount one of the user\'s', async () => {
    m.dayExpenses = [{ id: 'exp_rent', date: '2026-02-01', amount: 5_000_000, currency: 'IRT', category: 'housing', title: 'اجاره' }];
    await recordSpending('cheque:chq_1', { title: 'چک علی', amount: 5_000_000, currency: 'IRT', date: '2026-02-01', category: 'other', chequeId: 'chq_1' });
    expect(m.saveExpense.mock.calls[0][1]).toBeNull();
    expect(m.saveExpense.mock.calls[0][0]).toMatchObject({ chequeId: 'chq_1', category: 'other' });
  });
});

describe('an installment whose id changes', () => {
  it('is recorded under the same expense whatever id it has', async () => {
    const loan = { id: 'loan_1', title: 'وام' };
    const pay = (id) => recordInstallmentPayments(loan, [{ id, installmentNumber: 3, paidDate: '2026-02-05', paidAmount: 4_000_000 }]);
    await pay('inst_loan_1_3');
    await pay('inst_abc123');
    await pay('3');
    expect(new Set([...m.saved.keys()]).size).toBe(1);
  });

  it('reads the number from an id when the installment has none', () => {
    expect(installmentNumberOf({ id: 'inst_loan_1_7' })).toBe(7);
    expect(installmentNumberOf({ id: '7' })).toBe(7);
    expect(installmentNumberOf({ id: 'inst_abc' })).toBe(0);
  });

  it('unpaying removes the expense under any of its keys', async () => {
    await removeInstallmentPayment('loan_1', 'inst_abc', '', 3);
    expect(m.deleted).toContain(spendingExpenseId('loan:loan_1:n3'));
    expect(m.deleted).toContain(spendingExpenseId('loan:loan_1:inst_abc'));
  });
});

describe('a loan deleted', () => {
  it('removes its installment and extra-payment expenses, and nothing the user made', async () => {
    m.dayExpenses = [
      { id: 'exp_sa', recordedBy: 'loan', loanInstallment: { loanId: 'loan_1', installmentId: 'i1' } },
      { id: 'exp_sb', recordedBy: 'loan', loanInstallment: { loanId: 'loan_2', installmentId: 'i1' } },
      { id: 'exp_taken', recordedBy: 'loan', loanInstallment: { loanId: 'loan_1', installmentId: 'i3' } },
      { id: 'exp_user', loanInstallment: { loanId: 'loan_1', installmentId: 'i2' } },
      { id: spendingExpenseId('loanx:loan_1:epay_1') },
      { id: spendingExpenseId('loanx:loan_2:epay_9') },
    ];
    await removeLoanPayments('loan_1', ['epay_1']);
    expect(m.deleted.sort()).toEqual(['exp_sa', spendingExpenseId('loanx:loan_1:epay_1')].sort());
  });
});

describe('an installment paid by the user\'s own expense (a bank SMS)', () => {
  const loan = { id: 'loan_1', title: 'وام' };
  const link = { loanId: 'loan_1', installmentId: 'inst_loan_1_3' };

  it('is not recorded again by the loans page, whatever the amount', async () => {
    m.dayExpenses = [{ id: 'exp_sms', date: '2026-02-05', amount: 4_005_000, currency: 'IRT', loanInstallment: link }];
    await recordInstallmentPayments(loan, [{ id: 'inst_abc', installmentNumber: 3, paidDate: '2026-02-05', paidAmount: 4_000_000 }]);
    expect(m.saveExpense).not.toHaveBeenCalled();
  });

  it('an unlinked expense of the same amount is not taken as it: the payment gets its own', async () => {
    m.dayExpenses = [
      { id: 'same', date: '2026-02-05', amount: 4_000_000, currency: 'IRT' },
      { id: 'near', date: '2026-02-05', amount: 4_005_000, currency: 'IRT' },
    ];
    await recordInstallmentPayments(loan, [{ id: 'inst_loan_1_3', paidDate: '2026-02-05', paidAmount: 4_000_000 }]);
    expect(m.saveExpense).toHaveBeenCalledTimes(1);
    expect(m.saveExpense.mock.calls[0][1]).toBeNull();
    expect(m.saveExpense.mock.calls[0][2].id).toBe(spendingExpenseId('loan:loan_1:n3'));
  });

  it('an extra payment gets its own expense too', async () => {
    m.dayExpenses = [{ id: 'same', date: '2026-02-05', amount: 1_000_000, currency: 'IRT' }];
    await recordExtraPayment(loan, { id: 'epay_1', amount: 1_000_000, paymentDate: '2026-02-05' });
    expect(m.saveExpense.mock.calls[0][1]).toBeNull();
  });

  it('the expense the loans page recorded earlier is dropped, the user\'s kept', async () => {
    m.dayExpenses = [
      { id: 'exp_old', recordedBy: 'loan', loanInstallment: link },
      { id: 'exp_sms', loanInstallment: link },
    ];
    await dropDuplicateInstallmentPayments(link, 'exp_sms', ['2026-02-01'], 3);
    expect(m.deleted).toContain('exp_old');
    expect(m.deleted).toContain(spendingExpenseId('loan:loan_1:n3'));
    expect(m.deleted).not.toContain('exp_sms');
  });

  it('names the same installment by its place in the schedule', () => {
    expect(sameInstallment(link, { loanId: 'loan_1', installmentId: '3' })).toBe(true);
    expect(sameInstallment(link, { loanId: 'loan_1', installmentId: '4' })).toBe(false);
    expect(sameInstallment(link, { loanId: 'loan_2', installmentId: 'inst_loan_1_3' })).toBe(false);
  });
});

describe('a loan renamed', () => {
  it('renames its installment and extra-payment expenses, and nothing else', async () => {
    const extra = spendingExpenseId('loanx:loan_1:epay_1');
    m.dayExpenses = [
      { id: 'exp_sa', title: 'قسط ۱ خودرو', recordedBy: 'loan', loanInstallment: { loanId: 'loan_1', installmentId: 'i1' } },
      { id: 'exp_sb', title: 'قسط ۱ خودرو', recordedBy: 'loan', loanInstallment: { loanId: 'loan_2', installmentId: 'i1' } },
      { id: 'exp_user', title: 'قسط ۲ خودرو', loanInstallment: { loanId: 'loan_1', installmentId: 'i2' } },
      { id: extra, title: 'پرداخت اضافه خودرو' },
    ];
    await renameLoanPayments('loan_1', 'خودرو', 'ماشین', ['epay_1']);
    const titles = m.saveExpense.mock.calls.map(([input, existing]) => [existing.id, input.title]);
    expect(titles).toEqual([['exp_sa', 'قسط ۱ ماشین'], [extra, 'پرداخت اضافه ماشین']]);
  });
});
