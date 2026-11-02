// @vitest-environment happy-dom
/**
 * multiSourceExpenseForm.test.jsx — «چند منبع» in the expense form: a big purchase split between an
 * account, a bank credit and a loan, «بقیه» filling a row, the rows having to add up to the
 * amount, and an edit opening on its parts
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({
  useOptionalLoans: () => [{ id: 'loan_1', title: 'وام مسکن', principalAmount: 100_000_000, installmentCount: 12, paidCount: 0 }],
}));
vi.mock('../../../web/src/shared/features/useFeature.js', () => ({ useFeature: () => true }));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));
vi.mock('../../../web/src/features/market/context/PricingContext.jsx', () => ({ usePricing: () => null }));

const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');

afterEach(cleanup);

const accounts = [
  { id: 'acc_bank', type: 'bank', name: 'ملت', currencies: ['IRT'] },
  { id: 'acc_credit', type: 'credit', name: 'بلو', currencies: ['IRT'], credit: { limit: 100_000_000 } },
];
const submit = () => fireEvent.submit(document.getElementById('expense-amount').closest('form'));
const rows = () => [...document.querySelectorAll('.payment-split-row')];
const pickSource = (row, name) => {
  fireEvent.click(row.querySelector('.picker-row'));
  fireEvent.click(within(row).getByRole('radio', { name }));
};
const setPart = (row, value) => fireEvent.change(row.querySelector('input'), { target: { value } });

describe('paying from several sources', () => {
  it('splits the amount between an account, a bank credit and a loan', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm daily accounts={accounts} onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '90000000' } });
    fireEvent.click(screen.getByRole('tab', { name: 'چند منبع' }));
    expect(rows()).toHaveLength(2);

    setPart(rows()[0], '30000000');
    pickSource(rows()[0], 'ملت');
    setPart(rows()[1], '40000000');
    pickSource(rows()[1], 'بلو');
    fireEvent.click(screen.getByRole('button', { name: /منبع دیگر/ }));
    pickSource(rows()[2], 'وام «وام مسکن»');
    // Not yet adding up: saving waits
    expect(document.querySelector('.payment-split .is-warning')).not.toBeNull();
    fireEvent.click(within(rows()[2]).getByRole('button', { name: /بقیه/ }));
    expect(document.querySelector('.payment-split .is-warning')).toBeNull();

    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const sent = onSubmit.mock.calls[0][0];
    expect(sent).toMatchObject({ amount: 90_000_000, accountId: '', loanId: '', paidFrom: null });
    expect(sent.payments.map(({ id, ...p }) => p)).toEqual([
      { amount: 30_000_000, accountId: 'acc_bank' },
      { amount: 40_000_000, accountId: 'acc_credit' },
      { amount: 20_000_000, loanId: 'loan_1' },
    ]);
  });

  it('an edit opens on its parts; back to one account sends no parts', async () => {
    const onSubmit = vi.fn(async () => {});
    const expense = {
      id: 'exp_1', groupId: '', title: 'لپ‌تاپ', amount: 50, currency: 'IRT', date: '2026-10-20', category: 'shopping',
      accountId: '', loanId: '', payments: [{ id: 'p1', amount: 20, accountId: 'acc_bank' }, { id: 'p2', amount: 30, accountId: 'acc_credit' }],
    };
    render(<ExpenseForm daily accounts={accounts} expense={expense} onSubmit={onSubmit} onClose={() => {}} />);
    expect(rows()).toHaveLength(2);
    expect(rows()[1].querySelector('.picker-row-value').textContent).toMatch(/بلو/);
    fireEvent.click(screen.getByRole('tab', { name: 'حساب یا نقد' }));
    fireEvent.click(document.querySelector('.picker-row'));
    fireEvent.click(screen.getByRole('radio', { name: /ملت/ }));
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ payments: null, accountId: 'acc_bank' });
  });
});
