// @vitest-environment happy-dom
/**
 * accountRequired.test.jsx — every income and expense is tied to an account: an account made from
 * a bank SMS (smsAccounts.js), the income's own `accountId`, and the expense/income forms that
 * ask for one (or make one) before saving
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { pickRow } from '../helpers/entryForm.js';

const accountsApi = vi.hoisted(() => ({
  saveAccount: vi.fn(async (input) => ({ account: { id: `acc_${input.name}_${input.cardLast4 || input.accountNumber}`, ...input } })),
}));
vi.mock('../../../web/src/shared/vault/vaultAccounts.js', () => accountsApi);
vi.mock('../../../web/src/shared/vault/vaultStore.js', async (importOriginal) => ({ ...(await importOriginal()), bumpVaultEpoch: vi.fn() }));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ enabled: true, accounts: [], activeAccounts: [] }),
}));
vi.mock('../../../web/src/shared/banks/bankApi.js', () => ({ listCustomBanks: vi.fn(async () => ({ banks: [] })), createCustomBank: vi.fn(), deleteCustomBank: vi.fn() }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: vi.fn(), toast: { success: vi.fn(), error: vi.fn() } }) }));
vi.mock('../../../web/src/features/market/context/PricingContext.jsx', () => ({ usePricing: () => null }));

import { ensureSmsAccount, smsAccountInput } from '../../../web/src/features/sms-inbox/smsAccounts.js';
import { validateIncome } from '../../src/domain/incomeDocument.js';
import ExpenseForm from '../../../web/src/features/expenses/components/ExpenseForm.jsx';
import IncomeForm from '../../../web/src/features/incomes/components/IncomeForm.jsx';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const tx = (extra = {}) => ({ bankId: 'mellat', direction: 'debit', amount: 1000, date: '2026-09-28', ...extra });

describe('ensureSmsAccount', () => {
  it('makes a toman bank account from the message when none matches, then matches it', async () => {
    const accounts = [];
    const id = await ensureSmsAccount(tx({ accountLast4: '4556' }), accounts);
    expect(accountsApi.saveAccount).toHaveBeenCalledTimes(1);
    expect(accountsApi.saveAccount.mock.calls[0][0]).toMatchObject({ type: 'bank', bankId: 'mellat', accountNumber: '4556', currencies: ['IRT'] });
    expect(accounts.map((a) => a.id)).toEqual([id]);
    // The next message of the same account finds it
    expect(await ensureSmsAccount(tx({ accountLast4: '4556' }), accounts)).toBe(id);
    expect(accountsApi.saveAccount).toHaveBeenCalledTimes(1);
  });

  it('a card names the card digits; a card the bank\'s accounts do not know is a new account', async () => {
    const accounts = [{ id: 'acc_a', bankId: 'mellat', type: 'bank', currencies: ['IRT'], cardLast4: '1111' }, { id: 'acc_b', bankId: 'mellat', type: 'bank', currencies: ['IRT'], cardLast4: '2222' }];
    expect(await ensureSmsAccount(tx({ cardLast4: '2222' }), accounts)).toBe('acc_b');
    const c = await ensureSmsAccount(tx({ cardLast4: '3333' }), accounts);
    expect(accounts.map((a) => a.id)).toContain(c);
    expect(accountsApi.saveAccount).toHaveBeenCalledTimes(1);
    expect(smsAccountInput(tx({ cardLast4: '1111' }))).toMatchObject({ cardLast4: '1111', accountNumber: '' });
  });

  it('two messages arriving together make one account', async () => {
    const accounts = [];
    const ids = await Promise.all([ensureSmsAccount(tx(), accounts), ensureSmsAccount(tx(), accounts)]);
    expect(ids[0]).toBe(ids[1]);
    expect(accountsApi.saveAccount).toHaveBeenCalledTimes(1);
  });

  it('a message with no digits goes to the bank\'s existing account', async () => {
    const accounts = [{ id: 'acc_m', bankId: 'mellat', type: 'bank', currencies: ['IRT'] }, { id: 'acc_n', bankId: 'mellat', type: 'bank', currencies: ['IRT'], cardLast4: '9999' }];
    expect(await ensureSmsAccount(tx(), accounts)).toBe('acc_m');
    expect(accountsApi.saveAccount).not.toHaveBeenCalled();
  });

  it('gives up quietly when the account cannot be saved', async () => {
    accountsApi.saveAccount.mockRejectedValueOnce(new Error('offline'));
    expect(await ensureSmsAccount(tx(), [])).toBe('');
  });
});

describe('an income names its account', () => {
  const base = { title: 'حقوق', amount: 100, incomeDate: '2026-09-28' };
  it('keeps a valid account id and drops a malformed one', () => {
    expect(validateIncome({ ...base, accountId: 'acc_1' }).value.accountId).toBe('acc_1');
    expect(validateIncome({ ...base, accountId: 'a b!' }).value.accountId).toBe('');
    expect(validateIncome(base).value.accountId).toBe('');
  });
});

describe('the forms ask for an account', () => {
  it('a new expense cannot be saved before an account is picked; one can be made on the spot', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm daily accounts={[]} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '5000' } });
    const submit = screen.getAllByText('ثبت هزینه').map((el) => el.closest('button')).find(Boolean);
    expect(submit.disabled).toBe(true);
    pickRow('پرداخت از', '+ حساب جدید');
    fireEvent.change(await screen.findByLabelText(/نام حساب/), { target: { value: 'ملت' } });
    fireEvent.submit(screen.getByText('افزودن حساب').closest('form'));
    await waitFor(() => expect(accountsApi.saveAccount).toHaveBeenCalled());
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.submit(submit.closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ accountId: 'acc_ملت_' });
  });

  it('an income is saved into the picked account', async () => {
    const onSubmit = vi.fn(async () => {});
    const accounts = [{ id: 'acc_1', name: 'ملت', type: 'bank', currencies: ['IRT'] }];
    render(<IncomeForm accounts={accounts} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.change(document.getElementById('income-amount'), { target: { value: '9000' } });
    fireEvent.change(document.getElementById('income-title'), { target: { value: 'حقوق' } });
    const form = screen.getByText('ثبت درآمد').closest('form');
    expect(screen.getByText('ثبت درآمد').closest('button').disabled).toBe(true);
    pickRow('واریز به', 'ملت');
    await waitFor(() => expect(screen.getByText('ثبت درآمد').closest('button').disabled).toBe(false));
    fireEvent.submit(form);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ accountId: 'acc_1', amount: 9000 });
  });
});
