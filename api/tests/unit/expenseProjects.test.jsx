// @vitest-environment happy-dom
/**
 * expenseProjects.test.jsx — A project is a place, not a category: the expense form picks its
 * project («پروژه») beside its category, and the expense keeps both (a project's expenses are
 * summed per category). The store saves an expense with no section in the everyday expenses.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { summarizeByCategory } from '../../src/domain/expenseDocument.js';

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));
vi.mock('../../../web/src/features/cheques/context/ChequesContext.jsx', () => ({ useOptionalCheques: () => [] }));
vi.mock('../../../web/src/features/subscriptions/context/SubscriptionsContext.jsx', () => ({
  useOptionalSubscriptions: () => [],
  useOptionalSubscriptionsContext: () => null,
}));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));

const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const projects = [
  { id: 'exg_home', name: 'بازسازی', type: 'project' },
  { id: 'exg_old', name: 'قدیمی', type: 'project', archived: true },
];
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));
const submit = () => fireEvent.submit(document.getElementById('expense-amount').closest('form'));
const renderForm = (props) => {
  const onSubmit = vi.fn(async () => {});
  render(<ExpenseForm projects={projects} usdToman={100_000} onSubmit={onSubmit} onClose={() => {}} {...props} />);
  return onSubmit;
};

describe('the expense form\'s «پروژه»', () => {
  it('an everyday expense put in a project keeps its category (archived projects are not offered)', async () => {
    const onSubmit = renderForm({ daily: true });
    expect(screen.queryByRole('tab', { name: 'قدیمی' })).toBeNull();
    tab('مسکن و اجاره');
    tab('بازسازی');
    expect(screen.getByText('در پروژه «بازسازی»')).toBeTruthy();
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '700000' } });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ groupId: 'exg_home', category: 'housing', amount: 700_000 });
  });

  it('opened in a project: starts there without a category (then the title is needed), and can leave it', async () => {
    const onSubmit = renderForm({ group: projects[0] });
    expect(screen.getByRole('tab', { name: 'بدون دسته‌بندی' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '500000' } });
    submit();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(document.getElementById('expense-title'), { target: { value: 'کاشی' } });
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ groupId: 'exg_home', category: '', title: 'کاشی' });

    // Back to the everyday expenses: they need a category («سایر» when it had none)
    tab('روزمره (بدون پروژه)');
    expect(screen.queryByRole('tab', { name: 'بدون دسته‌بندی' })).toBeNull();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ groupId: '', category: 'other' });
  });

  it('an archived project\'s own expense still shows its project', () => {
    renderForm({ daily: true, expense: { id: 'e1', groupId: 'exg_old', title: 'x', amount: 1, currency: 'IRT', date: '2026-01-01', category: 'other' } });
    expect(screen.getByRole('tab', { name: 'قدیمی' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('a project\'s categories', () => {
  it('are summed apart, the expenses without one under \'\'', () => {
    const list = [
      { amount: 100, currency: 'IRT', category: 'housing' },
      { amount: 50, currency: 'IRT', category: '' },
      { amount: 30, currency: 'IRT', category: 'housing' },
    ];
    expect(summarizeByCategory(list, { none: '' })).toEqual([
      { category: 'housing', totalToman: 130, count: 2 },
      { category: '', totalToman: 50, count: 1 },
    ]);
    // The everyday expenses count them as «سایر»
    expect(summarizeByCategory(list).map((c) => c.category)).toEqual(['housing', 'other']);
  });
});
