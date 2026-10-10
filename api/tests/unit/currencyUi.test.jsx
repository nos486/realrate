// @vitest-environment happy-dom
/**
 * currencyUi.test.jsx — Money in euros, lira and dirhams on screen: the expense form offers every
 * currency, asks for that currency's rate (read from its own history), lists only the accounts
 * holding it, and saves its own rate as `rate`; an account's card sums this month's spending in
 * each currency it was paid in, with about how much in tomans
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const funds = vi.hoisted(() => ({ rateOnDay: vi.fn(async () => 60_000) }));
const month = vi.hoisted(() => ({ expenses: [], projectExpenses: [] }));

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  CURRENCY_ASSET: { USD: 'usd', EUR: 'eur', TRY: 'try', AED: 'aed' },
  newSpendTxId: () => 'txs_1',
  newLinkTxId: () => 'txl_1',
  rateOnDay: funds.rateOnDay,
}));
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

afterEach(() => {
  cleanup();
  month.expenses = [];
  month.projectExpenses = [];
});
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));
const fa = (n) => n.toLocaleString('fa-IR');

describe('an expense in euros', () => {
  it('asks for the euro\'s rate, offers only the accounts holding euros, and saves its own rate as `rate`', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm daily accounts={ACCOUNTS} usdToman={100_000} onSubmit={onSubmit} onClose={() => {}} />);
    // Every currency of the table
    for (const name of ['تومان', 'دلار', 'یورو', 'لیر', 'درهم']) expect(screen.getByRole('tab', { name })).toBeTruthy();
    tab('یورو');
    expect(screen.getByText(/مبلغ \(یورو\)/)).toBeTruthy();
    expect(screen.getByText(/نرخ یورو در روز هزینه/)).toBeTruthy();
    // Only the account holding euros
    expect(screen.getByRole('tab', { name: 'وایز' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'ملت' })).toBeNull();
    // A past day: that day's euro rate from its history
    fireEvent.change(document.querySelector('.date-text-input'), { target: { value: '1404/12/10' } });
    await waitFor(() => expect(funds.rateOnDay).toHaveBeenCalledWith('eur', expect.any(String)));
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '100' } });
    fireEvent.change(document.getElementById('expense-usd-rate'), { target: { value: '62000' } });
    tab('وایز');
    fireEvent.submit(document.getElementById('expense-amount').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ currency: 'EUR', amount: 100, rate: 62_000, usdRate: null, accountId: 'acc_eur', chequeId: '' });
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
