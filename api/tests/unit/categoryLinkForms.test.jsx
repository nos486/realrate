// @vitest-environment happy-dom
/**
 * categoryLinkForms.test.jsx — The expense and income forms link a record by its category through
 * one field (CategoryLinkField, utils/categoryLinks.js): «پرداخت چک» / «وصول چک» the cheque,
 * «پرداخت قسط» the loan installment, «اینترنت و اشتراک‌ها» the subscription (or a new one); a
 * choice fills in what it knows, another category drops the link. Accounts are offered by the
 * expense's currency.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { validateExpense } from '../../src/domain/expenseDocument.js';
import { categoryLinkOf, categoryLinkFields, validateLinkValue, sameLinkValue } from '../../src/domain/categoryLinks.js';

const data = vi.hoisted(() => ({
  loans: [
    { id: 'loan_1', title: 'وام مسکن', nextDueInstallment: { id: 'inst_7', installmentNumber: 7, totalAmount: 4_000_000, dueDate: '2026-02-20' } },
    { id: 'loan_done', title: 'وام تسویه‌شده', nextDueInstallment: null },
  ],
  cheques: [
    { id: 'chq_out', direction: 'issued', status: 'pending', amount: 5_000_000, dueDate: '2026-02-01', counterparty: 'علی' },
    { id: 'chq_paid', direction: 'issued', status: 'cleared', amount: 1, dueDate: '2026-01-01', counterparty: 'پاس‌شده' },
    { id: 'chq_in', direction: 'received', status: 'deposited', amount: 9_000_000, dueDate: '2026-02-02', counterparty: 'شرکت' },
  ],
  subscriptions: [{ id: 'sub_1', name: 'ChatGPT', amount: 20, currency: 'USD', status: 'active', accountId: 'acc_both' }],
  saveSubscription: null,
}));
data.saveSubscription = vi.fn(async (input) => ({ id: 'sub_new', ...input }));

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => data.loans }));
vi.mock('../../../web/src/features/cheques/context/ChequesContext.jsx', () => ({ useOptionalCheques: () => data.cheques }));
vi.mock('../../../web/src/features/subscriptions/context/SubscriptionsContext.jsx', () => ({
  useOptionalSubscriptions: () => data.subscriptions,
  useOptionalSubscriptionsContext: () => ({ subscriptions: data.subscriptions, saveSubscription: data.saveSubscription }),
}));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  CURRENCY_ASSET: { USD: 'usd' }, newSpendTxId: () => 'txs', newLinkTxId: () => 'txl', rateOnDay: async () => 100_000,
}));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));

const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');
const { default: IncomeForm } = await import('../../../web/src/features/incomes/components/IncomeForm.jsx');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const accounts = [
  { id: 'acc_toman', name: 'ملت', currencies: ['IRT'] },
  { id: 'acc_usd', name: 'دلاری', currencies: ['USD'] },
  { id: 'acc_both', name: 'وایز', currencies: ['IRT', 'USD'] },
];
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));
const submitExpense = () => fireEvent.submit(document.getElementById('expense-amount').closest('form'));
const renderExpense = (props = {}) => {
  const onSubmit = vi.fn(async () => {});
  render(<ExpenseForm daily accounts={accounts} usdToman={100_000} onSubmit={onSubmit} onClose={() => {}} {...props} />);
  return onSubmit;
};

describe('the category link table', () => {
  it('says what each category links to, and keeps only that link on a record', () => {
    expect(categoryLinkOf('expense', 'cheques')).toMatchObject({ target: 'cheque', field: 'chequeId' });
    expect(categoryLinkOf('income', 'cheques')).toMatchObject({ target: 'cheque', field: 'chequeId' });
    expect(categoryLinkOf('expense', 'installments')).toMatchObject({ target: 'loan_installment', field: 'loanInstallment' });
    expect(categoryLinkOf('expense', 'groceries')).toBeNull();
    expect(categoryLinkFields('expense', 'cheques', { chequeId: 'chq_1', subscriptionId: 'sub_1' })).toEqual({ chequeId: 'chq_1' });
    expect(validateLinkValue('loan_installment', { loanId: 'l', installmentId: '3' })).toEqual({ loanId: 'l', installmentId: '3' });
    expect(validateLinkValue('cheque', 'bad id!')).toBe('');
    expect(sameLinkValue({ loanId: 'l', installmentId: '3' }, { loanId: 'l', installmentId: '3' })).toBe(true);

    const base = { groupId: 'g', title: 'x', amount: 10, currency: 'IRT', date: '2026-02-01' };
    // An expense keeps the link of its own category only
    expect(validateExpense({ ...base, category: 'groceries', subscriptionId: 'sub_1', chequeId: 'chq_1' }).value).not.toHaveProperty('chequeId');
    expect(validateExpense({ ...base, category: 'subscriptions', subscriptionId: 'sub_1', chequeId: 'chq_1' }).value).toMatchObject({ subscriptionId: 'sub_1' });
    expect(validateExpense({ ...base, category: 'subscriptions', subscriptionId: 'sub_1' }).value).not.toHaveProperty('chequeId');
  });
});

describe('the expense form', () => {
  it('«پرداخت چک»: offers the open issued cheques, fills the amount, and saves the link', async () => {
    const onSubmit = renderExpense();
    tab('پرداخت چک');
    expect(screen.getByRole('tab', { name: /علی/ })).toBeTruthy();
    // Not a cleared one, not a received one
    expect(screen.queryByRole('tab', { name: /پاس‌شده/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /شرکت/ })).toBeNull();
    tab(screen.getByRole('tab', { name: /علی/ }).getAttribute('aria-label'));
    expect(document.getElementById('expense-amount').value).toMatch(/5,?000,?000|۵/);
    submitExpense();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ category: 'cheques', chequeId: 'chq_out', amount: 5_000_000, title: 'چک علی' });
  });

  it('«پرداخت قسط»: offers the loans with an installment to pay, and saves which one', async () => {
    const onSubmit = renderExpense();
    tab('پرداخت قسط');
    const picker = screen.getByText('قسط کدام وام').closest('.ui-input-group');
    expect(within(picker).queryByRole('tab', { name: 'وام تسویه‌شده' })).toBeNull();
    fireEvent.click(within(picker).getByRole('tab', { name: 'وام مسکن' }));
    expect(document.body.textContent).toMatch(/قسط ۷/);
    submitExpense();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ category: 'installments', loanInstallment: { loanId: 'loan_1', installmentId: 'inst_7' }, amount: 4_000_000 });
  });

  it('another category drops the link', async () => {
    const onSubmit = renderExpense();
    tab('پرداخت چک');
    tab(screen.getByRole('tab', { name: /علی/ }).getAttribute('aria-label'));
    tab('خوراک و خواربار');
    submitExpense();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ category: 'groceries' });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('chequeId');
  });

  it('«اینترنت و اشتراک‌ها»: picks a subscription (its price, currency and account fill in) or makes a new one', async () => {
    let onSubmit = renderExpense();
    tab('اینترنت و اشتراک‌ها');
    tab('ChatGPT');
    expect(screen.getByRole('tab', { name: 'دلار' }).getAttribute('aria-selected')).toBe('true');
    submitExpense();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ subscriptionId: 'sub_1', currency: 'USD', amount: 20, accountId: 'acc_both', title: 'ChatGPT' });
    cleanup();

    onSubmit = renderExpense();
    tab('اینترنت و اشتراک‌ها');
    tab('+ اشتراک جدید');
    tab('سالانه');
    fireEvent.change(document.getElementById('expense-title'), { target: { value: 'Spotify' } });
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '900000' } });
    submitExpense();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(data.saveSubscription).toHaveBeenCalledWith(expect.objectContaining({ name: 'Spotify', amount: 900_000, cycleMonths: 12, autoRenew: true }));
    // Its first payment is this one: saved as paid through its day
    expect(data.saveSubscription.mock.calls[0][0].lastPaidOn).toBe(data.saveSubscription.mock.calls[0][0].startDate);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ subscriptionId: 'sub_new', title: 'Spotify' });
  });

  it('offers only the accounts that hold the expense\'s currency', () => {
    renderExpense();
    expect(screen.getByRole('tab', { name: 'ملت' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'وایز' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'دلاری' })).toBeNull();
    tab('دلار');
    expect(screen.queryByRole('tab', { name: 'ملت' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'دلاری' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'وایز' })).toBeTruthy();
  });
});

describe('the income form', () => {
  it('«وصول چک»: offers the open received cheques and saves the link', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<IncomeForm onSubmit={onSubmit} onClose={() => {}} />);
    tab('وصول چک');
    expect(screen.queryByRole('tab', { name: /علی/ })).toBeNull();
    tab(screen.getByRole('tab', { name: /شرکت/ }).getAttribute('aria-label'));
    expect(document.getElementById('income-title').value).toBe('چک شرکت');
    fireEvent.submit(document.getElementById('income-title').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ category: 'cheques', chequeId: 'chq_in', amount: 9_000_000 });
  });
});
