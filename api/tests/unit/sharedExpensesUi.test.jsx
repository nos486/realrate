// @vitest-environment happy-dom
/**
 * sharedExpensesUi.test.jsx — «دنگ» in the expense form (only «سهم من» is the user's expense)
 * and «دریافتی‌ها» (what came back, in pieces and into accounts)
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { openDetails } from '../helpers/entryForm.js';

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));

const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');
const { default: ReimbursementsModal } = await import('../../../web/src/features/expenses/components/ReimbursementsModal.jsx');

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const setValue = (el, value) => fireEvent.change(el, { target: { value } });

describe('ExpenseForm — دنگ', () => {
  it('sends the share with the whole amount', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm daily onSubmit={onSubmit} onClose={() => {}} />);
    setValue(document.getElementById('expense-amount'), '10000000');
    openDetails();
    fireEvent.click(screen.getByText('با دیگران (دنگ)'));
    setValue(document.getElementById('expense-my-share'), '3000000');
    expect(screen.getByText(/طلب از دیگران است/)).toBeTruthy();
    fireEvent.submit(screen.getByText('ثبت هزینه').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ amount: 10_000_000, myShare: 3_000_000 });
  });

  it('an ordinary expense has no share', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm daily onSubmit={onSubmit} onClose={() => {}} />);
    setValue(document.getElementById('expense-amount'), '500000');
    fireEvent.submit(screen.getByText('ثبت هزینه').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].myShare).toBeNull();
  });
});

describe('ReimbursementsModal', () => {
  const expense = {
    id: 'exp_1', title: 'شام', amount: 10_000_000, currency: 'IRT', myShare: 3_000_000, date: '2026-09-20',
    reimbursements: [{ id: 'rmb_1', amount: 2_000_000, date: '2026-09-21', accountId: 'acc_1' }],
  };
  const accounts = [{ id: 'acc_1', name: 'ملت', type: 'bank' }, { id: 'acc_2', name: 'نقد', type: 'cash' }];

  it('adds what came back, into an account, starting from what is left', async () => {
    const onSave = vi.fn(async (input, existing) => ({ ...existing, ...input }));
    render(<ReimbursementsModal expense={expense} accounts={accounts} onSave={onSave} onClose={() => {}} />);
    expect(document.getElementById('reimbursement-amount').value.replace(/[^\d۰-۹]/g, '')).toBeTruthy();
    setValue(document.getElementById('reimbursement-amount'), '4000000');
    fireEvent.click(screen.getByText('نقد'));
    fireEvent.submit(screen.getByText('ثبت دریافت').closest('form'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [input] = onSave.mock.calls[0];
    expect(input.reimbursements).toHaveLength(2);
    expect(input.reimbursements[1]).toMatchObject({ amount: 4_000_000, accountId: 'acc_2' });
    expect(input.reimbursements[1].id).toMatch(/^rmb_/);
  });

  it('shows a settled expense as settled, with no form', () => {
    const settled = { ...expense, reimbursements: [{ id: 'rmb_1', amount: 7_000_000, date: '2026-09-21' }] };
    render(<ReimbursementsModal expense={settled} accounts={accounts} onSave={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText('تسویه شد')).toBeTruthy();
    expect(document.getElementById('reimbursement-amount')).toBeNull();
  });
});
