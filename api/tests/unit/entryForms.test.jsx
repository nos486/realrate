// @vitest-environment happy-dom
/**
 * entryForms.test.jsx — The expense and income forms as entry forms (web/src/shared/form/): the
 * amount first with its words, the category tiles (the last used first, a few at once, the chosen
 * one always in view), «امروز»/«دیروز» for the day, «پرداخت با» an account, a cheque or a loan (each
 * with its picker row), what is rarely needed under «جزئیات بیشتر», and «ثبت و بعدی» for the next
 * entry
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { numberToWords } from '../../../web/src/shared/utils/numberWords.js';
import { chosenCategory, pickCategory, pickCurrency, openRow, pickRow, rowValue, pickerRow } from '../helpers/entryForm.js';

const data = vi.hoisted(() => ({
  loans: [
    { id: 'loan_car', title: 'وام خودرو', remainingBalance: 80_000_000, installmentCount: 24, paidCount: 3 },
    { id: 'loan_done', title: 'وام تمام‌شده', remainingBalance: 0, installmentCount: 12, paidCount: 12 },
  ],
}));

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => data.loans }));
vi.mock('../../../web/src/features/cheques/context/ChequesContext.jsx', () => ({ useOptionalCheques: () => [] }));
vi.mock('../../../web/src/features/subscriptions/context/SubscriptionsContext.jsx', () => ({
  useOptionalSubscriptions: () => [],
  useOptionalSubscriptionsContext: () => null,
}));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));

const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');
const { default: IncomeForm } = await import('../../../web/src/features/incomes/components/IncomeForm.jsx');
const { default: CategoryGrid } = await import('../../../web/src/shared/form/CategoryGrid.jsx');
const { rememberCategory } = await import('../../../web/src/shared/form/recentCategories.js');
const { gregorianToShamsi } = await import('../../../web/src/features/portfolio/components/ShamsiDatePicker.jsx');
const { todayIso } = await import('../../../web/src/shared/utils/dates.js');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const accounts = [{ id: 'acc_m', name: 'ملت', currencies: ['IRT'] }];
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));
const amount = (value) => fireEvent.change(document.getElementById('expense-amount'), { target: { value } });
const submit = () => fireEvent.submit(document.getElementById('expense-amount').closest('form'));
const renderExpense = (props = {}) => {
  const onSubmit = vi.fn(async () => {});
  const onClose = vi.fn();
  render(<ExpenseForm daily accounts={accounts} usdToman={100_000} onSubmit={onSubmit} onClose={onClose} {...props} />);
  return { onSubmit, onClose };
};

describe('an amount in words', () => {
  it('reads a whole number in Persian', () => {
    expect(numberToWords(15_000_000)).toBe('پانزده میلیون');
    expect(numberToWords(1_250_000)).toBe('یک میلیون و دویست و پنجاه هزار');
    expect(numberToWords(1_500)).toBe('هزار و پانصد');
    expect(numberToWords(2_001_005)).toBe('دو میلیون و یک هزار و پنج');
    expect(numberToWords(318)).toBe('سیصد و هجده');
    expect(numberToWords(0)).toBe('');
    expect(numberToWords(2.5)).toBe('');
  });

  it('shows under the amount, in its currency', () => {
    renderExpense();
    amount('15000000');
    expect(screen.getByText('پانزده میلیون تومان')).toBeTruthy();
    pickCurrency('یورو');
    amount('250');
    expect(screen.getByText('دویست و پنجاه یورو')).toBeTruthy();
  });
});

describe('the category tiles', () => {
  const options = Array.from({ length: 12 }, (_, i) => ({ value: `c${i}`, label: `دسته ${i}` }));
  const shown = () => [...document.querySelectorAll('.category-grid [role="radio"]')].map((el) => el.getAttribute('aria-label'));

  it('show a few, the last used first, and «همه‌ی دسته‌ها» for the rest', () => {
    rememberCategory('expense', 'c9');
    rememberCategory('expense', 'c10');
    render(<CategoryGrid kind="expense" options={options} value="c0" onChange={() => {}} />);
    expect(shown()).toEqual(['دسته 10', 'دسته 9', 'دسته 0', 'دسته 1', 'دسته 2', 'دسته 3', 'دسته 4']);
    fireEvent.click(screen.getByText(/همه‌ی دسته‌ها/));
    expect(shown()).toHaveLength(12);
  });

  it('keep the chosen one in view', () => {
    render(<CategoryGrid kind="expense" options={options} value="c11" onChange={() => {}} />);
    expect(shown()).toContain('دسته 11');
    expect(shown()).toHaveLength(7);
  });

  it('a new expense starts in the category used last', async () => {
    const { onSubmit } = renderExpense();
    expect(chosenCategory()).toBe('خوراک و خواربار');
    pickCategory('رستوران و کافه');
    amount('400000');
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    cleanup();
    renderExpense();
    expect(chosenCategory()).toBe('رستوران و کافه');
  });
});

describe('the day', () => {
  it('is today, yesterday a tap away, another day through the picker', async () => {
    const { onSubmit } = renderExpense();
    expect(screen.getByRole('tab', { name: 'امروز' }).getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('.date-field .date-text-input')).toBeNull();
    tab('دیروز');
    amount('1000');
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(onSubmit.mock.calls[0][0].date).toBe(todayIso(d));
    tab('روز دیگر');
    expect(document.querySelector('.date-field .date-text-input').value).toBe(gregorianToShamsi(`${todayIso(d)}T00:00:00`));
  });
});

describe('«پرداخت با»', () => {
  it('a loan: picks which one (only those not settled), and is saved with it', async () => {
    const { onSubmit } = renderExpense();
    amount('2000000');
    tab('وام');
    const loans = openRow('کدام وام');
    expect(loans.queryByRole('radio', { name: 'وام تمام‌شده' })).toBeNull();
    // Not without a loan
    expect(document.querySelector('button[type="submit"]').disabled).toBe(true);
    pickRow('کدام وام', 'وام خودرو');
    // The account it went out of, still
    pickRow('پرداخت از', 'ملت');
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ loanId: 'loan_car', accountId: 'acc_m', chequeId: '' });
  });

  it('back to an account drops the loan; a foreign expense is paid from an account only', async () => {
    const { onSubmit } = renderExpense({ expense: { id: 'e1', groupId: '', title: 'لاستیک', category: 'transport', amount: 9_000_000, currency: 'IRT', date: '2026-03-01', loanId: 'loan_car' } });
    expect(screen.getByRole('tab', { name: 'وام' }).getAttribute('aria-selected')).toBe('true');
    expect(rowValue('کدام وام')).toBe('وام خودرو');
    tab('حساب یا نقد');
    expect(pickerRow('کدام وام')).toBeNull();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].loanId).toBe('');
    pickCurrency('دلار');
    expect(screen.queryByRole('tab', { name: 'وام' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'چک' })).toBeNull();
  });
});

describe('«جزئیات بیشتر»', () => {
  it('is folded on a new entry, and open on one with a note', () => {
    renderExpense();
    expect(document.getElementById('expense-notes')).toBeNull();
    cleanup();
    renderExpense({ expense: { id: 'e1', groupId: '', title: 'نان', category: 'groceries', amount: 1000, currency: 'IRT', date: '2026-03-01', notes: 'سنگک' } });
    expect(document.getElementById('expense-notes').value).toBe('سنگک');
  });
});

describe('«ثبت و بعدی»', () => {
  it('saves, and keeps the form open for the next one with its category and account', async () => {
    const { onSubmit, onClose } = renderExpense();
    pickCategory('رفت‌وآمد و سوخت');
    pickRow('پرداخت از', 'ملت');
    fireEvent.change(document.getElementById('expense-title'), { target: { value: 'بنزین' } });
    amount('300000');
    fireEvent.click(screen.getByRole('button', { name: 'ثبت و بعدی' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'بنزین', amount: 300_000, category: 'transport', accountId: 'acc_m' });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/«بنزین» ثبت شد/));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.getElementById('expense-amount').value).toBe('');
    expect(document.getElementById('expense-title').value).toBe('');
    expect(chosenCategory()).toBe('رفت‌وآمد و سوخت');
    expect(rowValue('پرداخت از')).toBe('ملت');
    // The main button saves and closes
    amount('120000');
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('is not offered on an edit', () => {
    renderExpense({ expense: { id: 'e1', groupId: '', title: 'نان', category: 'groceries', amount: 1000, currency: 'IRT', date: '2026-03-01' } });
    expect(screen.queryByRole('button', { name: 'ثبت و بعدی' })).toBeNull();
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeTruthy();
  });

  it('an income too', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<IncomeForm onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.change(document.getElementById('income-amount'), { target: { value: '5000000' } });
    fireEvent.change(document.getElementById('income-title'), { target: { value: 'پروژه الف' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت و بعدی' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() => expect(document.getElementById('income-amount').value).toBe(''));
    expect(screen.getByRole('status').textContent).toMatch(/«پروژه الف» ثبت شد/);
  });
});
