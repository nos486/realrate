// @vitest-environment happy-dom
/**
 * currencyUi.test.jsx — Money in euros, lira and dirhams on screen: the expense and income forms
 * offer every currency and show that currency's rate on the day (read from its own history —
 * nothing to type, nothing stored); the expense form lists only the accounts holding it; a foreign
 * income has no cheque; an account's card sums this month's spending in each currency it was paid
 * in, with about how much in tomans
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pickCurrency, openRow, pickRow, setDay } from '../helpers/entryForm.js';

const history = vi.hoisted(() => ({ priceOnDay: vi.fn(async () => 60_000) }));
const month = vi.hoisted(() => ({ expenses: [], projectExpenses: [] }));

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  CURRENCY_ASSET: { USD: 'usd', EUR: 'eur', TRY: 'try', AED: 'aed' },
  newSpendTxId: () => 'txs_1',
  newLinkTxId: () => 'txl_1',
}));
vi.mock('../../../web/src/features/market/dailyHistory.js', async (importOriginal) => ({
  ...(await importOriginal()),
  priceOnDay: history.priceOnDay,
}));
vi.mock('../../../web/src/features/cheques/context/ChequesContext.jsx', () => ({ useOptionalCheques: () => [] }));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));
// The euro's rate: 60,000 tomans on any day
vi.mock('../../../web/src/features/market/useFxRates.js', () => ({
  useFxRates: () => ({ rateToday: () => 65_000, rateAt: () => 60_000 }),
}));

// The accounts page
const ACCOUNTS = [
  { id: 'acc_eur', name: 'وایز', type: 'bank', currencies: ['IRT', 'EUR'] },
  { id: 'acc_irt', name: 'ملت', type: 'bank', currencies: ['IRT'] },
];
vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ accounts: ACCOUNTS, vaultLocked: false, loading: false, submitting: false, deletingId: null, error: null, clearError: vi.fn(), fetchAccounts: vi.fn(), saveAccount: vi.fn(), deleteAccount: vi.fn() }),
}));
vi.mock('../../../web/src/features/accounts/hooks/useTransfers.js', () => ({
  useTransfers: () => ({ transfers: [], saveTransfer: vi.fn(), deleteTransfer: vi.fn(), submitting: false }),
}));
vi.mock('../../../web/src/features/expenses/hooks/useDailyExpenses.js', () => ({ useDailyExpenses: () => month }));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }), isDemoReadOnly: () => false }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../../../web/src/shared/banks/index.js', () => ({ BankLogo: () => null, resolveBank: () => null, useCustomBanks: () => ({ customBanks: [] }) }));

const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');
const { default: AccountsPage } = await import('../../../web/src/features/accounts/components/AccountsPage.jsx');
const { default: IncomeForm } = await import('../../../web/src/features/incomes/components/IncomeForm.jsx');

afterEach(() => {
  cleanup();
  localStorage.clear();
  month.expenses = [];
  month.projectExpenses = [];
});
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));
const fa = (n) => n.toLocaleString('fa-IR');

describe('an expense in euros', () => {
  it('shows the euro\'s rate of the day, offers only the accounts holding euros, and stores no rate', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm daily accounts={ACCOUNTS} usdToman={100_000} onSubmit={onSubmit} onClose={() => {}} />);
    // Every currency of the table
    expect([...screen.getByLabelText('ارز').options].map((o) => o.textContent)).toEqual(['تومان', 'دلار', 'یورو', 'لیر', 'درهم']);
    pickCurrency('یورو');
    expect(screen.getByText(/مبلغ \(یورو\)/)).toBeTruthy();

    // Only the account holding euros
    const from = openRow('پرداخت از');
    expect(from.getByRole('radio', { name: 'وایز' })).toBeTruthy();
    expect(from.queryByRole('radio', { name: 'ملت' })).toBeNull();
    // A past day: that day's euro rate from its history
    setDay('1404/12/10');
    await waitFor(() => expect(history.priceOnDay).toHaveBeenCalledWith('eur', expect.any(String)));
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '100' } });
    await waitFor(() => expect(document.body.textContent).toMatch(new RegExp(`نرخ یورو همان روز.*${fa(60_000)}`)));
    expect(document.body.textContent).toMatch(new RegExp(fa(6_000_000)));
    expect(document.getElementById('expense-usd-rate')).toBeNull();
    pickRow('پرداخت از', 'وایز');
    fireEvent.submit(document.getElementById('expense-amount').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const sent = onSubmit.mock.calls[0][0];
    expect(sent).toMatchObject({ currency: 'EUR', amount: 100, accountId: 'acc_eur', chequeId: '' });
    expect(sent).not.toHaveProperty('rate');
    expect(sent).not.toHaveProperty('usdRate');
  });
});

describe('an income in euros', () => {
  it('is saved in its currency, shows the day\'s rate and its tomans, and has no cheque', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<IncomeForm onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.change(document.getElementById('income-title'), { target: { value: 'پروژه' } });
    expect(screen.getByRole('tab', { name: 'چک' })).toBeTruthy();
    pickCurrency('یورو');
    // A cheque is in tomans
    expect(screen.queryByRole('tab', { name: 'چک' })).toBeNull();
    expect(screen.getByText(/مبلغ \(یورو\)/)).toBeTruthy();
    fireEvent.change(document.getElementById('income-amount'), { target: { value: '2500' } });
    setDay('1404/12/10');
    await waitFor(() => expect(document.body.textContent).toMatch(new RegExp(fa(150_000_000))));
    fireEvent.submit(document.getElementById('income-title').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ currency: 'EUR', amount: 2500, chequeId: '' });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('rate');
  });
});

describe('an account\'s card', () => {
  it('sums this month\'s spending in each currency it was paid in, with about how much in tomans', () => {
    const today = new Date().toISOString().slice(0, 10);
    month.expenses = [
      { id: 'e1', groupId: 'g', title: 'هتل', amount: 100, currency: 'EUR', date: today, accountId: 'acc_eur' },
      { id: 'e2', groupId: 'g', title: 'نان', amount: 500_000, currency: 'IRT', date: today, accountId: 'acc_eur' },
      { id: 'e3', groupId: 'g', title: 'بنزین', amount: 300_000, currency: 'IRT', date: today, accountId: 'acc_irt' },
    ];
    // A project's expense from the same account counts too
    month.projectExpenses = [{ id: 'p1', groupId: 'p', title: 'کاشی', amount: 20, currency: 'EUR', date: today, accountId: 'acc_eur' }];
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    const text = document.body.textContent;
    expect(text).toMatch(new RegExp(`${fa(120)} یورو`));
    expect(text).toMatch(new RegExp(`${fa(500_000)} تومان`));
    // 120 € × 60,000 + 500,000
    expect(text).toMatch(new RegExp(`≈ ${fa(7_700_000)} تومان`));
    // A toman-only account: no «≈»
    expect(text).toMatch(new RegExp(`${fa(300_000)} تومان`));
    expect(text).toMatch(/تومانی و یورویی/);
  });
});
