// @vitest-environment happy-dom
/**
 * cashMoveTransfer.test.jsx — «مدیریت نقدینگی» in a new income or everyday expense: money moved
 * between the user's own accounts is offered as a transfer between them, with the amount, day and
 * note carried over; recording it as an (excluded) income or expense stays possible
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

const store = vi.hoisted(() => ({ saveTransfer: null }));
store.saveTransfer = vi.fn(async (input) => ({ transfer: { id: 'trf_1', ...input } }));

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({ CURRENCY_ASSET: { USD: 'usd' }, newSpendTxId: () => 'txs', newLinkTxId: () => 'tx', rateOnDay: async () => 0 }));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));
vi.mock('../../../web/src/shared/categories/useCategories.js', async () => {
  const { categoryIcon } = await import('../../../web/src/shared/categories/categoryIcons.js');
  const { BUILTIN_CATEGORIES } = await import('../../src/domain/categoryDocument.js');
  return { useCategories: (kind) => BUILTIN_CATEGORIES[kind].map((c) => ({ ...c, Icon: categoryIcon(c.icon) })) };
});
vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ loading: false, accounts: [{ id: 'acc_a', name: 'ملت', type: 'bank' }, { id: 'acc_b', name: 'بلو', type: 'bank' }] }),
}));
vi.mock('../../../web/src/shared/vault/vaultTransfers.js', () => ({ saveTransfer: (...a) => store.saveTransfer(...a) }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ toast: { success: vi.fn(), error: vi.fn() } }) }));

const { default: IncomeForm } = await import('../../../web/src/features/incomes/components/IncomeForm.jsx');
const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');
const { default: CashMoveTransferForm } = await import('../../../web/src/features/accounts/components/CashMoveTransferForm.jsx');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOTICE = 'ثبت به‌صورت انتقال';

describe('a new income in «مدیریت نقدینگی»', () => {
  it('is offered as a transfer, with its amount, day and note', () => {
    const onCashMove = vi.fn();
    render(<IncomeForm onSubmit={vi.fn()} onClose={vi.fn()} onCashMove={onCashMove} draft={{ title: 'واریز از بلو', amount: 3_000_000, incomeDate: '2026-10-05', notes: '' }} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
    fireEvent.click(screen.getByText('مدیریت نقدینگی'));
    fireEvent.click(screen.getByText(NOTICE));
    expect(onCashMove).toHaveBeenCalledWith({ amount: 3_000_000, date: '2026-10-05', notes: 'واریز از بلو' });
  });

  it('not when editing a recorded income', () => {
    render(<IncomeForm onSubmit={vi.fn()} onClose={vi.fn()} onCashMove={vi.fn()} editingIncome={{ id: 'inc_1', title: 'x', category: 'cash_management', amount: 1, incomeDate: '2026-10-05' }} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});

describe('a new everyday expense in «مدیریت نقدینگی»', () => {
  const accounts = [{ id: 'acc_a', name: 'ملت', type: 'bank' }, { id: 'acc_b', name: 'بلو', type: 'bank' }];

  it('is offered as a transfer from the account it was paid from', () => {
    const onCashMove = vi.fn();
    render(<ExpenseForm daily accounts={accounts} onSubmit={vi.fn()} onClose={vi.fn()} onCashMove={onCashMove} draft={{ amount: 2_000_000, date: '2026-10-05', accountId: 'acc_a', notes: 'شارژ کیف پول' }} />);
    expect(screen.queryByText(NOTICE)).toBeNull();
    fireEvent.click(screen.getByText('مدیریت نقدینگی'));
    fireEvent.click(screen.getByText(NOTICE));
    expect(onCashMove).toHaveBeenCalledWith(expect.objectContaining({ amount: 2_000_000, date: '2026-10-05', fromAccountId: 'acc_a', notes: 'شارژ کیف پول' }));
  });
});

describe('the transfer it becomes', () => {
  it('opens filled in, asks for the accounts, and is saved as a transfer', async () => {
    const onClose = vi.fn();
    render(<CashMoveTransferForm draft={{ amount: 3_000_000, date: '2026-10-05', notes: 'واریز از بلو' }} onClose={onClose} />);
    const form = screen.getByText('ثبت انتقال').closest('form');
    expect(form.querySelector('#transfer-amount').value).toBe('3,000,000');
    fireEvent.click(screen.getAllByText('بلو')[0]);
    fireEvent.click(screen.getAllByText('ملت')[1]);
    fireEvent.submit(form);
    await waitFor(() => expect(store.saveTransfer).toHaveBeenCalled());
    expect(store.saveTransfer.mock.calls[0][0]).toMatchObject({ fromAccountId: 'acc_b', toAccountId: 'acc_a', amount: 3_000_000, date: '2026-10-05', notes: 'واریز از بلو' });
    expect(onClose).toHaveBeenCalled();
  });
});
