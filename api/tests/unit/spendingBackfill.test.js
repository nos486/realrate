// @vitest-environment happy-dom
/**
 * spendingBackfill.test.js — ONE-TIME: payments made before «همه‌ی خرج‌ها در هزینه‌ها» are put in
 * the expenses and incomes once per user on a device (web/src/shared/vault/spendingBackfill.js):
 * paid installments and extra payments, cleared cheques without their record, and every renewal
 * of a subscription that renews by itself
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  recordInstallmentPayments: vi.fn(async () => {}),
  recordExtraPayment: vi.fn(async () => {}),
  recordSubscriptionPayments: vi.fn(async () => null),
  settleCheque: vi.fn(async () => 'income'),
}));

vi.mock('../../../web/src/shared/vault/spendingRecords.js', () => ({
  recordInstallmentPayments: m.recordInstallmentPayments,
  recordExtraPayment: m.recordExtraPayment,
  recordSubscriptionPayments: m.recordSubscriptionPayments,
}));
vi.mock('../../../web/src/shared/vault/recordLinks.js', () => ({ settleCheque: m.settleCheque }));
vi.mock('../../../web/src/shared/refresh/pageRefresh.js', () => ({ refreshScopes: async () => {} }));
vi.mock('../../../web/src/shared/utils/dates.js', () => ({ todayIso: () => '2026-04-01' }));
vi.mock('../../../web/src/features/cheques/api/chequeApi.js', () => ({
  getCheques: async () => ({
    cheques: [
      { id: 'c1', category: 'freelance', status: 'cleared', settlement: null, dueDate: '2026-01-01', history: [{ status: 'pending', date: '2025-12-01' }, { status: 'cleared', date: '2026-01-03' }] },
      { id: 'c2', status: 'cleared', settlement: { side: 'income', id: 'inc_1' }, dueDate: '2026-01-01', history: [] },
      { id: 'c3', status: 'pending', settlement: null, dueDate: '2026-05-01', history: [] },
    ],
  }),
}));
vi.mock('../../../web/src/features/loans/api/loanApi.js', () => ({
  getLoans: async () => ({ loans: [{ id: 'loan_1' }] }),
  getLoanDetail: async () => ({
    loan: {
      id: 'loan_1', title: 'وام',
      installments: [
        { id: 'i1', isPaid: true, paidDate: '2026-01-05', paidAmount: 100, totalAmount: 100 },
        { id: 'i2', isPaid: true, paidDate: '2026-02-05', totalAmount: 120 },
        { id: 'i3', isPaid: false, totalAmount: 120 },
      ],
    },
  }),
  getLoanExtraPayments: async () => ({ extraPayments: [{ id: 'x1', amount: 500, paymentDate: '2026-03-01' }] }),
}));
const old = vi.hoisted(() => ({ updateIncome: vi.fn(async () => ({})), saveExpense: vi.fn(async () => ({})) }));
vi.mock('../../../web/src/features/incomes/api/incomeApi.js', () => ({
  getIncomes: async () => ({ incomes: [
    { id: 'inc_1', title: 'چک شرکت', amount: 9, incomeDate: '2026-01-03', category: 'cheques', chequeId: 'c1', createdAt: 'x', updatedAt: 'y' },
    { id: 'inc_2', title: 'حقوق', amount: 1, incomeDate: '2026-01-03', category: 'salary' },
  ] }),
  updateIncome: old.updateIncome,
}));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({
  getExpenses: async () => ({ expenses: [{ id: 'exp_1', category: 'cheques', chequeId: 'c3' }, { id: 'exp_2', category: 'groceries' }] }),
  saveExpense: old.saveExpense,
}));
vi.mock('../../../web/src/shared/vault/vaultSubscriptions.js', () => ({
  getSubscriptions: async () => ({ subscriptions: [
    { id: 's1', autoRenew: true, startDate: '2025-10-12', lastPaidOn: '2026-03-12' },
    { id: 's2', autoRenew: false, startDate: '2025-10-12' },
  ] }),
  saveSubscription: async (input, existing) => ({ subscription: { ...existing, ...input } }),
}));

const { runSpendingBackfill, runChequeCategoryMigration } = await import('../../../web/src/shared/vault/spendingBackfill.js');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('the one-time backfill', () => {
  it('records past payments, then never runs again for that user on this device', async () => {
    expect(await runSpendingBackfill({ userId: 'u1', expenses: true })).toBe(true);
    // A cleared cheque without its record, on the day it cleared
    expect(m.settleCheque).toHaveBeenCalledTimes(1);
    expect(m.settleCheque).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), { date: '2026-01-03', expenses: true });
    // Every paid installment (at what was paid, else its amount), every extra payment
    expect(m.recordInstallmentPayments).toHaveBeenCalledWith(expect.objectContaining({ id: 'loan_1' }), [
      { id: 'i1', paidDate: '2026-01-05', paidAmount: 100 },
      { id: 'i2', paidDate: '2026-02-05', paidAmount: 120 },
    ]);
    expect(m.recordExtraPayment).toHaveBeenCalledWith(expect.objectContaining({ id: 'loan_1' }), expect.objectContaining({ id: 'x1' }));
    // A subscription that renews by itself: from its start
    expect(m.recordSubscriptionPayments).toHaveBeenCalledTimes(1);
    expect(m.recordSubscriptionPayments.mock.calls[0][0]).toMatchObject({ id: 's1', lastPaidOn: '2025-10-11' });

    vi.clearAllMocks();
    expect(await runSpendingBackfill({ userId: 'u1', expenses: true })).toBe(false);
    expect(m.settleCheque).not.toHaveBeenCalled();
  });

  it('without the expenses feature only cheques are settled (their income)', async () => {
    await runSpendingBackfill({ userId: 'u2', expenses: false });
    expect(m.settleCheque).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), { date: '2026-01-03', expenses: false });
    expect(m.recordInstallmentPayments).not.toHaveBeenCalled();
    expect(m.recordSubscriptionPayments).not.toHaveBeenCalled();
  });

  it('a step that fails doesn\'t stop the others, and it runs again next time', async () => {
    m.settleCheque.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await runSpendingBackfill({ userId: 'u3', expenses: true })).toBe(false);
    expect(m.recordInstallmentPayments).toHaveBeenCalled();
    expect(await runSpendingBackfill({ userId: 'u3', expenses: true })).toBe(true);
    warn.mockRestore();
  });
});

describe('the retired cheque categories (v2)', () => {
  it('records saved in them take their cheque\'s own category, once', async () => {
    expect(await runChequeCategoryMigration({ userId: 'u9', expenses: true })).toBe(true);
    expect(old.updateIncome).toHaveBeenCalledTimes(1);
    expect(old.updateIncome).toHaveBeenCalledWith('inc_1', expect.objectContaining({ category: 'freelance', chequeId: 'c1', title: 'چک شرکت' }));
    // A cheque with no category of its own: «سایر»
    expect(old.saveExpense).toHaveBeenCalledWith({ category: 'other' }, expect.objectContaining({ id: 'exp_1' }), { syncLinks: false });
    expect(old.saveExpense).toHaveBeenCalledTimes(1);
    expect(await runChequeCategoryMigration({ userId: 'u9', expenses: true })).toBe(false);
  });
});
