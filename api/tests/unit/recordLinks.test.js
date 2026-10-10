/**
 * recordLinks.test.js — What saving or deleting an income or an expense linked by its category does
 * to the record it names (web/src/shared/vault/recordLinks.js): a cheque is cleared and points
 * back, a loan installment is paid, a subscription moves on — and undone when unlinked; a cheque
 * cleared on the cheques page records its money, and taking that back removes it
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  cheques: [],
  updateCheque: vi.fn(async (id, input) => ({ success: true, cheque: { id, ...input } })),
  markInstallmentPaid: vi.fn(async () => ({ success: true })),
  unmarkInstallmentPaid: vi.fn(async () => ({ success: true })),
  subscriptions: [],
  saveSubscription: vi.fn(async (input, existing) => ({ success: true, subscription: { ...existing, ...input } })),
  createIncome: vi.fn(async (input) => ({ success: true, income: { id: 'inc_new', ...input } })),
  deleteIncome: vi.fn(async () => ({ success: true })),
  saveExpense: vi.fn(async (input) => ({ success: true, expense: { id: 'exp_new', ...input } })),
  deleteExpense: vi.fn(async () => ({ success: true })),
  refreshScopes: vi.fn(async () => {}),
}));

vi.mock('../../../web/src/features/cheques/api/chequeApi.js', () => ({
  getCheques: async () => ({ success: true, cheques: mocks.cheques }),
  updateCheque: mocks.updateCheque,
}));
vi.mock('../../../web/src/features/loans/api/loanApi.js', () => ({
  markInstallmentPaid: mocks.markInstallmentPaid,
  unmarkInstallmentPaid: mocks.unmarkInstallmentPaid,
}));
vi.mock('../../../web/src/shared/vault/vaultSubscriptions.js', () => ({
  getSubscriptions: async () => ({ success: true, subscriptions: mocks.subscriptions }),
  saveSubscription: mocks.saveSubscription,
}));
vi.mock('../../../web/src/features/incomes/api/incomeApi.js', () => ({ createIncome: mocks.createIncome, deleteIncome: mocks.deleteIncome }));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({
  ensureDailyGroup: async () => ({ id: 'grp_daily' }),
  getExpenseGroups: async () => ({ groups: [] }),
  saveExpense: mocks.saveExpense,
  deleteExpense: mocks.deleteExpense,
}));
vi.mock('../../../web/src/shared/refresh/pageRefresh.js', () => ({ refreshScopes: mocks.refreshScopes }));
vi.mock('../../../web/src/shared/utils/dates.js', () => ({ todayIso: () => '2026-02-10' }));

const { syncRecordLinks, releaseRecordLinks, settleCheque, unsettleCheque } = await import('../../../web/src/shared/vault/recordLinks.js');

const issued = {
  id: 'chq_out', direction: 'issued', status: 'pending', amount: 5_000_000, dueDate: '2026-02-01', counterparty: 'علی',
  history: [{ status: 'pending', date: '2026-01-01', note: '' }], settlement: null,
};
const received = { ...issued, id: 'chq_in', direction: 'received', counterparty: 'شرکت' };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cheques = [issued, received];
  mocks.subscriptions = [];
});

describe('cheque links', () => {
  it('an expense paying an issued cheque clears it on its day and points it back at the expense', async () => {
    await syncRecordLinks('expense', { id: 'exp_1', category: 'cheques', chequeId: 'chq_out', date: '2026-02-03', amount: 5_000_000 }, null);
    expect(mocks.updateCheque).toHaveBeenCalledTimes(1);
    const [id, input] = mocks.updateCheque.mock.calls[0];
    expect(id).toBe('chq_out');
    expect(input).toMatchObject({ status: 'cleared', settlement: { side: 'expense', id: 'exp_1' } });
    expect(input.history.at(-1)).toMatchObject({ status: 'cleared', date: '2026-02-03' });
    await flush();
    expect(mocks.refreshScopes).toHaveBeenCalledWith({ scopes: ['cheques'] });
  });

  it('never links a cheque of the other direction', async () => {
    await syncRecordLinks('income', { id: 'inc_1', category: 'cheques', chequeId: 'chq_out', incomeDate: '2026-02-03' }, null);
    expect(mocks.updateCheque).not.toHaveBeenCalled();
  });

  it('unlinking or deleting the record puts the cheque back where it was', async () => {
    const cleared = { ...received, status: 'cleared', settlement: { side: 'income', id: 'inc_1' }, history: [...received.history, { status: 'cleared', date: '2026-02-03', note: '' }] };
    mocks.cheques = [cleared];
    const income = { id: 'inc_1', category: 'cheques', chequeId: 'chq_in', incomeDate: '2026-02-03' };
    await syncRecordLinks('income', { ...income, category: 'salary', chequeId: '' }, income);
    expect(mocks.updateCheque.mock.calls[0][1]).toMatchObject({ status: 'pending', settlement: null });

    mocks.updateCheque.mockClear();
    await releaseRecordLinks('income', income);
    expect(mocks.updateCheque.mock.calls[0][1]).toMatchObject({ status: 'pending', settlement: null });
  });

  it('a cheque cleared on the cheques page records its money once, and taking it back removes it', async () => {
    const clearedIn = { ...received, status: 'cleared' };
    expect(await settleCheque(clearedIn, { date: '2026-02-04' })).toBe('income');
    expect(mocks.createIncome).toHaveBeenCalledWith(expect.objectContaining({ amount: 5_000_000, incomeDate: '2026-02-04', category: 'cheques', chequeId: 'chq_in' }));

    const clearedOut = { ...issued, status: 'cleared' };
    expect(await settleCheque(clearedOut, { date: '2026-02-04', expenses: false })).toBeNull();
    expect(await settleCheque(clearedOut, { date: '2026-02-04' })).toBe('expense');
    expect(mocks.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ groupId: 'grp_daily', currency: 'IRT', category: 'cheques', chequeId: 'chq_out' }));
    // Already recorded: nothing more
    expect(await settleCheque({ ...clearedIn, settlement: { side: 'income', id: 'inc_9' } }, { date: '2026-02-04' })).toBeNull();

    await unsettleCheque({ ...received, settlement: { side: 'income', id: 'inc_9' } });
    expect(mocks.deleteIncome).toHaveBeenCalledWith('inc_9');
    await unsettleCheque({ ...issued, settlement: { side: 'expense', id: 'exp_9' } });
    expect(mocks.deleteExpense).toHaveBeenCalledWith('exp_9', { id: 'exp_9', chequeId: 'chq_out' });
  });
});

describe('loan installment links', () => {
  it('pays the installment on the expense\'s day, and unpays it when the expense goes', async () => {
    const expense = { id: 'exp_2', category: 'installments', loanInstallment: { loanId: 'loan_1', installmentId: 'inst_3' }, date: '2026-02-05', amount: 2_000_000 };
    await syncRecordLinks('expense', expense, null);
    expect(mocks.markInstallmentPaid).toHaveBeenCalledWith('loan_1', 'inst_3', { paidDate: '2026-02-05', paidAmount: 2_000_000 });
    // Saved again unchanged: nothing
    await syncRecordLinks('expense', { ...expense, notes: 'x' }, expense);
    expect(mocks.markInstallmentPaid).toHaveBeenCalledTimes(1);
    await releaseRecordLinks('expense', expense);
    expect(mocks.unmarkInstallmentPaid).toHaveBeenCalledWith('loan_1', 'inst_3');
  });
});

describe('subscription links', () => {
  const manual = { id: 'sub_m', autoRenew: false, cycleMonths: 1, startDate: '2026-01-12', renewOn: '2026-02-11', lastPaidOn: '2026-01-12' };

  it('a payment moves a subscription on, unless it was already paid through that day', async () => {
    mocks.subscriptions = [manual];
    await syncRecordLinks('expense', { id: 'exp_3', category: 'subscriptions', subscriptionId: 'sub_m', date: '2026-02-10' }, null);
    expect(mocks.saveSubscription).toHaveBeenCalledWith({ renewOn: '2026-03-13', lastPaidOn: '2026-02-10' }, manual);

    mocks.saveSubscription.mockClear();
    // Its first payment (the day it was saved as paid through), or an older one recorded late
    await syncRecordLinks('expense', { id: 'exp_4', category: 'subscriptions', subscriptionId: 'sub_m', date: '2026-01-12' }, null);
    expect(mocks.saveSubscription).not.toHaveBeenCalled();
  });

  it('a failing effect never throws: the record stays saved', async () => {
    mocks.markInstallmentPaid.mockRejectedValueOnce(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(syncRecordLinks('expense', { id: 'e', category: 'installments', loanInstallment: { loanId: 'l', installmentId: 'i' }, date: '2026-02-01' }, null)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
