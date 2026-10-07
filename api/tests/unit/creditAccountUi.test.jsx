// @vitest-environment happy-dom
/**
 * creditAccountUi.test.jsx — A bank credit on the accounts page, all by hand: its card shows the
 * limit and debt; «تسویه بدهی» records what was paid as a transfer into the credit with the fee
 * (worked out from the debt settled and what was paid) on it, and the fee as an expense;
 * «تبدیل به قسط» takes the installments row by row and records their fee; an installment is paid
 * from its row; the account form takes only the limit, the debt and the start day
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { addDaysIso, validateCreditTerms } from '../../src/domain/creditAccount.js';

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const store = vi.hoisted(() => ({ expenses: [], transfers: [], saveTransfer: null, saveExpense: null, saveAccount: null, deleteExpense: null }));
store.saveTransfer = vi.fn(async (input) => ({ id: 'trf_new', ...input }));
store.saveExpense = vi.fn(async (input) => ({ expense: { id: 'exp_fee', ...input } }));
store.saveAccount = vi.fn(async () => ({}));
store.deleteExpense = vi.fn(async () => ({}));

const credit = (patch = {}) => validateCreditTerms({ limit: 100_000_000, startDate: addDaysIso(today, -60), ...patch }).value;
const ACCOUNTS = [
  { id: 'bank_1', name: 'ملت', type: 'bank' },
  { id: 'cr_1', name: 'اوانو', type: 'credit', credit: credit() },
];

vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ accounts: ACCOUNTS, vaultLocked: false, loading: false, submitting: false, deletingId: null, error: null, clearError: vi.fn(), fetchAccounts: vi.fn(), saveAccount: store.saveAccount, deleteAccount: vi.fn() }),
}));
vi.mock('../../../web/src/features/accounts/hooks/useTransfers.js', () => ({
  useTransfers: () => ({ transfers: [], saveTransfer: store.saveTransfer, deleteTransfer: vi.fn(), submitting: false }),
}));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({
  getExpenses: vi.fn(async () => ({ expenses: store.expenses })),
  getExpenseGroups: vi.fn(async () => ({ groups: [{ id: 'g_daily', type: 'daily' }] })),
  ensureDailyGroup: vi.fn(async (groups) => groups[0]),
  saveExpense: (...a) => store.saveExpense(...a),
  deleteExpense: (...a) => store.deleteExpense(...a),
}));
vi.mock('../../../web/src/shared/vault/vaultTransfers.js', () => ({
  getTransfers: vi.fn(async () => ({ transfers: store.transfers })),
}));
vi.mock('../../../web/src/shared/vault/vaultIncomes.js', () => ({
  getIncomes: vi.fn(async () => ({ incomes: [] })),
}));
vi.mock('../../../web/src/features/expenses/hooks/useDailyExpenses.js', () => ({ useDailyExpenses: () => ({ expenses: [] }) }));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }), isDemoReadOnly: () => false }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../../../web/src/shared/banks/index.js', () => ({ BankLogo: () => null, resolveBank: () => null, useCustomBanks: () => ({ customBanks: [] }), BankPicker: () => null }));

import AccountsPage from '../../../web/src/features/accounts/components/AccountsPage.jsx';
import AccountForm from '../../../web/src/features/accounts/components/AccountForm.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPage = () => render(<MemoryRouter><AccountsPage /></MemoryRouter>);
const card = () => screen.getByText('اوانو').closest('article');
const spent = (amount) => [{ id: 'e1', accountId: 'cr_1', date: addDaysIso(today, -10), amount, currency: 'IRT' }];

describe('a bank credit on the accounts page', () => {
  it('shows the debt, what is free, and the debt outside installments with its two actions', async () => {
    ACCOUNTS[1].credit = credit();
    store.expenses = spent(10_000_000);
    store.transfers = [];
    renderPage();
    await waitFor(() => expect(within(card()).getByText('۱۰٬۰۰۰٬۰۰۰ تومان', { selector: 'strong' })).toBeTruthy());
    expect(within(card()).getByText(/آزاد: ۹۰٬۰۰۰٬۰۰۰/)).toBeTruthy();
    expect(within(card()).getByText('بدهی خارج از اقساط')).toBeTruthy();
    expect(within(card()).getByText(/تسویه بدهی/)).toBeTruthy();
    expect(within(card()).getByText(/تبدیل به قسط/)).toBeTruthy();
  });

  it('«تسویه بدهی»: 10M of debt, 10.2M paid — the transfer carries the 2% fee, and the fee is an expense', async () => {
    ACCOUNTS[1].credit = credit();
    store.expenses = spent(10_000_000);
    store.transfers = [];
    renderPage();
    await waitFor(() => expect(within(card()).getByText(/تسویه بدهی/)).toBeTruthy());
    fireEvent.click(within(card()).getByText(/تسویه بدهی/));
    const form = (await screen.findByLabelText('مبلغ پرداختی (تومان) *')).closest('form');
    expect(form.querySelector('#credit-pay-settled').value).toBe('10,000,000');
    fireEvent.change(form.querySelector('#credit-pay-paid'), { target: { value: '10200000' } });
    expect(within(form).getByText(/کارمزد تسویه: ۲۰۰٬۰۰۰ تومان \(۲٪\)/)).toBeTruthy();
    fireEvent.submit(form);
    await waitFor(() => expect(store.saveExpense).toHaveBeenCalled());
    expect(store.saveTransfer.mock.calls[0][0]).toMatchObject({ fromAccountId: 'bank_1', toAccountId: 'cr_1', amount: 10_200_000, fee: 200_000, date: today });
    expect(store.saveExpense.mock.calls[0][0]).toMatchObject({ amount: 200_000, category: 'credit_fees', accountId: 'bank_1', creditAccountId: 'cr_1' });
  });

  it('«تبدیل به قسط»: rows filled monthly, one changed by hand; the fee recorded with the plan', async () => {
    ACCOUNTS[1].credit = credit();
    store.expenses = spent(10_000_000);
    store.transfers = [];
    renderPage();
    await waitFor(() => expect(within(card()).getByText(/تبدیل به قسط/)).toBeTruthy());
    fireEvent.click(within(card()).getByText(/تبدیل به قسط/));
    const form = (await screen.findByLabelText('تعداد اقساط')).closest('form');
    fireEvent.change(form.querySelector('#conversion-fill-count'), { target: { value: '3' } });
    fireEvent.change(form.querySelector('#conversion-fill-amount'), { target: { value: '3700000' } });
    const fill = within(form).getByText('ساخت سریع ردیف‌ها (اختیاری)').closest('fieldset');
    fireEvent.change(fill.querySelector('input.date-text-input'), { target: { value: '1405/08/10' } });
    fireEvent.click(within(form).getByText('ساخت ردیف‌ها (ماهانه)'));
    const rows = form.querySelectorAll('.credit-row');
    expect(rows).toHaveLength(3);
    // The bank's last installment is a little different
    fireEvent.change(rows[2].querySelector('input[id^="conversion-row-"]'), { target: { value: '3800000' } });
    expect(within(form).getByText(/۳ قسط، جمع ۱۱٬۲۰۰٬۰۰۰ تومان؛ کارمزد قسط‌بندی ۱٬۲۰۰٬۰۰۰ تومان \(۱۲٪\)/)).toBeTruthy();
    fireEvent.submit(form);
    await waitFor(() => expect(store.saveAccount).toHaveBeenCalled());
    // The fee: an expense charged to the credit itself
    expect(store.saveExpense.mock.calls[0][0]).toMatchObject({ amount: 1_200_000, category: 'credit_fees', accountId: 'cr_1', creditAccountId: 'cr_1' });
    const [conversion] = store.saveAccount.mock.calls[0][0].credit.conversions;
    expect(conversion).toMatchObject({ principal: 10_000_000, feeExpenseId: 'exp_fee' });
    expect(conversion.installments.map((i) => i.amount)).toEqual([3_700_000, 3_700_000, 3_800_000]);
    expect(conversion.installments[0].dueDate).toBe('2026-11-01');
  });

  it('an installment is paid from its row and marked paid; a plan can be undone with its fee', async () => {
    const conversion = { id: 'cnv_1', date: addDaysIso(today, -9), principal: 10_000_000, feeExpenseId: 'exp_old', installments: [
      { dueDate: addDaysIso(today, -2), amount: 3_700_000 },
      { dueDate: addDaysIso(today, 28), amount: 3_700_000 },
      { dueDate: addDaysIso(today, 58), amount: 3_700_000 },
    ] };
    ACCOUNTS[1].credit = credit({ conversions: [conversion] });
    store.expenses = [...spent(10_000_000), { id: 'exp_old', accountId: 'cr_1', creditAccountId: 'cr_1', date: addDaysIso(today, -9), amount: 1_100_000, currency: 'IRT' }];
    store.transfers = [];
    renderPage();
    await waitFor(() => expect(within(card()).getByText(/۱ قسط معوق/)).toBeTruthy());
    expect(within(card()).getByText(/کارمزد قسط‌بندی ۱٬۱۰۰٬۰۰۰ \(۱۱٪\)/)).toBeTruthy();
    expect(within(card()).queryByText('بدهی خارج از اقساط')).toBeNull();

    fireEvent.click(within(card()).getAllByText('پرداخت')[0]);
    const form = (await screen.findByLabelText('مبلغ قسط (تومان) *')).closest('form');
    fireEvent.submit(form);
    await waitFor(() => expect(store.saveAccount).toHaveBeenCalled());
    expect(store.saveTransfer.mock.calls[0][0]).toMatchObject({ toAccountId: 'cr_1', amount: 3_700_000, fee: 0 });
    expect(store.saveExpense).not.toHaveBeenCalled();
    const saved = store.saveAccount.mock.calls[0][0].credit.conversions[0];
    expect(saved.installments[0]).toMatchObject({ paidOn: today, transferId: 'trf_new' });
    expect(saved.installments[1].paidOn).toBeUndefined();

    store.saveAccount.mockClear();
    fireEvent.click(within(card()).getByText('حذف'));
    await waitFor(() => expect(store.saveAccount).toHaveBeenCalled());
    expect(store.deleteExpense).toHaveBeenCalledWith('exp_old');
    expect(store.saveAccount.mock.calls[0][0].credit.conversions).toEqual([]);
  });
});

describe('the account form', () => {
  it('a bank credit takes only its limit, the debt already owed and the day to count from', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<AccountForm onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('اعتبار بانکی'));
    fireEvent.change(screen.getByLabelText('نام حساب (اختیاری)'), { target: { value: 'اوانو' } });
    fireEvent.change(screen.getByLabelText('سقف اعتبار (تومان) *'), { target: { value: '100000000' } });
    fireEvent.change(screen.getByLabelText('بدهی فعلی هنگام ثبت (تومان، اختیاری)'), { target: { value: '2000000' } });
    expect(screen.queryByText('ارز حساب')).toBeNull();
    expect(screen.queryByText(/روز بستن صورت‌حساب/)).toBeNull();
    fireEvent.submit(screen.getByText('افزودن حساب').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      type: 'credit',
      name: 'اوانو',
      currency: 'IRT',
      credit: { limit: 100_000_000, openingDebt: 2_000_000, conversions: [] },
    });
    expect(onSubmit.mock.calls[0][0].credit.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
