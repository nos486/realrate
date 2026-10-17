// @vitest-environment happy-dom
/**
 * accountBalancesUi.test.jsx — the accounts page: the balance an account keeps, moved by its
 * records, on its card and in the total above the cards; and the form that states it
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const today = new Date().toISOString().slice(0, 10);
const long = '2020-01-01T00:00:00.000Z';
const ACCOUNTS = [
  { id: 'acc_1', name: 'ملت', type: 'bank', currencies: ['IRT'], balance: { amounts: { IRT: 3250000 }, startDate: '2020-01-01', startAt: long } },
  { id: 'acc_2', name: 'کیف پول', type: 'wallet', currencies: ['IRT'] },
];
const store = vi.hoisted(() => ({ saveAccount: vi.fn(async () => ({})) }));

vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ accounts: ACCOUNTS, vaultLocked: false, loading: false, submitting: false, deletingId: null, error: null, clearError: vi.fn(), fetchAccounts: vi.fn(), saveAccount: store.saveAccount, deleteAccount: vi.fn() }),
}));
vi.mock('../../../web/src/features/accounts/hooks/useTransfers.js', () => ({
  useTransfers: () => ({ transfers: [], saveTransfer: vi.fn(), deleteTransfer: vi.fn(), submitting: false }),
}));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'unlocked', epoch: 0 }) }));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({
  getExpenses: async () => ({ expenses: [{ id: 'e1', accountId: 'acc_1', amount: 250000, currency: 'IRT', date: today, createdAt: new Date().toISOString() }] }),
  getExpenseGroups: async () => ({ groups: [] }),
  ensureDailyGroup: vi.fn(), saveExpense: vi.fn(), deleteExpense: vi.fn(),
}));
vi.mock('../../../web/src/shared/vault/vaultTransfers.js', () => ({ getTransfers: async () => ({ transfers: [] }) }));
vi.mock('../../../web/src/shared/vault/vaultIncomes.js', () => ({ getIncomes: async () => ({ incomes: [] }) }));
vi.mock('../../../web/src/features/expenses/hooks/useDailyExpenses.js', () => ({ useDailyExpenses: () => ({ expenses: [] }) }));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }), isDemoReadOnly: () => false }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../../../web/src/shared/banks/index.js', () => ({ BankLogo: () => null, BankPicker: () => null, resolveBank: () => null, useCustomBanks: () => ({ customBanks: [] }) }));

import AccountsPage from '../../../web/src/features/accounts/components/AccountsPage.jsx';

afterEach(cleanup);

describe('accounts page: balances', () => {
  it('shows the balance moved by the records, and their total', async () => {
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    // 3,250,000 stated − 250,000 spent
    await waitFor(() => expect(document.querySelector('.account-card-balance')?.textContent).toMatch(/۳٬۰۰۰٬۰۰۰|3,000,000/));
    expect(document.querySelector('.balance-summary')?.textContent).toMatch(/۳٬۰۰۰٬۰۰۰|3,000,000/);
    // The account without a balance has none on its card
    expect(document.querySelectorAll('.account-card-balance')).toHaveLength(1);
  });

  it('states the balance of a new account from the form', async () => {
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    fireEvent.click(screen.getByText('حساب جدید').closest('button'));
    fireEvent.change(document.getElementById('account-name'), { target: { value: 'سامان' } });
    fireEvent.click(screen.getByText('نگه‌داشتن موجودی').closest('button'));
    fireEvent.change(document.getElementById('account-balance-IRT'), { target: { value: '1500000' } });
    fireEvent.submit(screen.getByText('افزودن حساب').closest('form'));
    await waitFor(() => expect(store.saveAccount).toHaveBeenCalled());
    expect(store.saveAccount.mock.calls[0][0]).toMatchObject({ name: 'سامان', balance: { amounts: { IRT: 1500000 } } });
  });

  it('offers a balance date, so earlier records can be brought in', () => {
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    fireEvent.click(screen.getByText('حساب جدید').closest('button'));
    fireEvent.click(screen.getByText('نگه‌داشتن موجودی').closest('button'));
    expect(screen.getByText('تاریخ موجودی')).toBeTruthy();
  });
});
