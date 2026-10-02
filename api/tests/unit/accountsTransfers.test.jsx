// @vitest-environment happy-dom
/**
 * accountsTransfers.test.jsx — the accounts page: transfers between the user's own accounts,
 * listed for the month, with what moved in and out of each account, and recorded from a form
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const ACCOUNTS = [
  { id: 'acc_1', name: 'بلو', type: 'cash' },
  { id: 'acc_2', name: 'کیف پول', type: 'wallet' },
];
const today = new Date().toISOString().slice(0, 10);
const store = vi.hoisted(() => ({ saveTransfer: vi.fn(async (input) => ({ id: 'trf_new', ...input })) }));

vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ accounts: ACCOUNTS, vaultLocked: false, loading: false, submitting: false, deletingId: null, error: null, clearError: vi.fn(), fetchAccounts: vi.fn(), saveAccount: vi.fn(), deleteAccount: vi.fn() }),
}));
vi.mock('../../../web/src/features/accounts/hooks/useTransfers.js', () => ({
  useTransfers: () => ({
    transfers: [{ id: 'trf_1', fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 3_000_000, fee: 0, date: today, notes: 'شارژ کیف پول' }],
    saveTransfer: store.saveTransfer,
    deleteTransfer: vi.fn(),
    submitting: false,
  }),
}));
vi.mock('../../../web/src/features/expenses/hooks/useDailyExpenses.js', () => ({ useDailyExpenses: () => ({ expenses: [] }) }));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }), isDemoReadOnly: () => false }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../../../web/src/shared/banks/index.js', () => ({ BankLogo: () => null, resolveBank: () => null, useCustomBanks: () => ({ customBanks: [] }) }));

import AccountsPage from '../../../web/src/features/accounts/components/AccountsPage.jsx';

afterEach(cleanup);

describe('accounts page: transfers', () => {
  it('lists the month\'s transfers and what moved in and out of each account', () => {
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    expect(screen.getByText('شارژ کیف پول')).toBeTruthy();
    expect(document.querySelector('.account-card-moved .is-out').textContent).toMatch(/۳٬۰۰۰٬۰۰۰|3,000,000|۳,۰۰۰,۰۰۰/);
    expect(document.querySelector('.account-card-moved .is-in')).toBeTruthy();
    expect(document.body.textContent).toMatch(/هزینه یا درآمد نیست/);
  });

  it('records a new transfer from the form', async () => {
    render(<MemoryRouter><AccountsPage /></MemoryRouter>);
    fireEvent.click(screen.getAllByText('انتقال بین حساب‌ها').map((el) => el.closest('button')).find(Boolean));
    const group = (label) => screen.getByText(label).closest('.ui-input-group');
    fireEvent.click([...group('از حساب *').querySelectorAll('button')].find((b) => b.textContent.includes('کیف پول')));
    fireEvent.click([...group('به حساب *').querySelectorAll('button')].find((b) => b.textContent.includes('بلو')));
    fireEvent.change(document.getElementById('transfer-amount'), { target: { value: '500000' } });
    fireEvent.submit(screen.getByText('ثبت انتقال').closest('form'));
    await waitFor(() => expect(store.saveTransfer).toHaveBeenCalled());
    expect(store.saveTransfer.mock.calls[0][0]).toMatchObject({ fromAccountId: 'acc_2', toAccountId: 'acc_1', amount: 500000 });
  });
});
