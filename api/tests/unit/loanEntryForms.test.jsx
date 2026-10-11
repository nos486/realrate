// @vitest-environment happy-dom
/**
 * loanEntryForms.test.jsx — The loan forms as entry forms (web/src/shared/form/): the new-loan form
 * (the principal first with its words, the day received, how installments are set as a segmented
 * choice, the interval as a picker row, the fee, notes and reminders under «جزئیات بیشتر»), the
 * extra payment (its amount, day and reduction mode) and the bulk installment edit's footer —
 * laid out anew, with what each one submits unchanged
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { openDetails, pickRow, rowValue, setDay } from '../helpers/entryForm.js';

vi.mock('../../../web/src/shared/banks/index.js', () => ({ BankPicker: () => null }));
vi.mock('../../../web/src/features/loans/api/loanApi.js', () => ({
  getLoanDetail: vi.fn(async () => ({ loan: { installments: [{ totalAmount: 40_000_000 }, { totalAmount: 40_000_000 }] } })),
}));

const { default: AddLoanForm } = await import('../../../web/src/features/loans/components/AddLoanForm.jsx');
const { default: ExtraPaymentModal } = await import('../../../web/src/features/loans/components/ExtraPaymentModal.jsx');
const { default: BulkEditInstallmentsModal } = await import('../../../web/src/features/loans/components/BulkEditInstallmentsModal.jsx');
const { shamsiToGregorian } = await import('../../../web/src/features/portfolio/components/ShamsiDatePicker.jsx');
const { todayIso } = await import('../../../web/src/shared/utils/dates.js');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const type = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
const submit = (id) => fireEvent.submit(document.getElementById(id).closest('form'));
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));
const button = (name) => screen.getByRole('button', { name });
const yesterdayIso = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayIso(d);
};

const renderLoanForm = (props = {}) => {
  const onSubmit = vi.fn(async () => {});
  const onClose = vi.fn();
  render(<AddLoanForm isOpen onClose={onClose} onSubmit={onSubmit} {...props} />);
  return { onSubmit, onClose };
};

describe('the new-loan form', () => {
  it('asks the principal first, large, with its words, in tomans only', () => {
    renderLoanForm();
    const body = document.querySelector('.entry-form-body');
    expect(body.firstElementChild.classList.contains('amount-field')).toBe(true);
    expect(screen.getByLabelText('مبلغ وام (تومان) *').id).toBe('loan-principal');
    expect(screen.queryByLabelText('ارز')).toBeNull();
    type('loan-principal', '100000000');
    expect(document.querySelector('.amount-field-words').textContent).toBe('صد میلیون تومان');
  });

  it('submits the same loan as before: interval from its row, day, fee and notes under «جزئیات بیشتر»', async () => {
    const { onSubmit, onClose } = renderLoanForm();
    expect(screen.queryByLabelText('کارمزد سالانه')).toBeNull();
    type('loan-principal', '120000000');
    type('loan-title', 'وام مسکن');
    type('loan-count', '24');
    expect(rowValue('دوره پرداخت اقساط')).toBe('ماهانه (هر ۱ ماه)');
    pickRow('دوره پرداخت اقساط', 'فصلی (هر ۳ ماه)');
    expect(rowValue('دوره پرداخت اقساط')).toBe('فصلی (هر ۳ ماه)');
    setDay('1404/01/15');
    openDetails();
    type('loan-annual-fee', '500000');
    type('loan-notes', 'قرارداد ۱۲');
    expect(document.querySelector('.loan-form-preview').textContent).toContain('مبلغ هر قسط');
    submit('loan-principal');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      title: 'وام مسکن',
      bankId: '',
      lenderName: '',
      principalAmount: 120_000_000,
      annualInterestRate: 23,
      installmentCount: 24,
      intervalMonths: 3,
      startDate: shamsiToGregorian('1404/01/15'),
      annualFeeAmount: 500_000,
      notes: 'قرارداد ۱۲',
      remindersMuted: false,
      totalRepaymentAmount: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('takes the day received from «دیروز» and the reminders switch under «جزئیات بیشتر»', async () => {
    const { onSubmit } = renderLoanForm();
    type('loan-principal', '50000000');
    type('loan-title', 'وام خودرو');
    tab('دیروز');
    openDetails();
    fireEvent.click(screen.getByRole('checkbox'));
    submit('loan-principal');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ startDate: yesterdayIso(), remindersMuted: true, intervalMonths: 1 });
  });

  it('chooses how installments are set as a segmented choice: the known total replaces the rate', async () => {
    const { onSubmit } = renderLoanForm();
    type('loan-principal', '100000000');
    type('loan-title', 'وام');
    type('loan-count', '10');
    tab('کل بازپرداخت را می‌دانم');
    expect(document.getElementById('loan-rate')).toBeNull();
    expect(button('افزودن و ساخت اقساط').disabled).toBe(true);
    type('loan-total-repayment', '120000000');
    expect(button('افزودن و ساخت اقساط').disabled).toBe(false);
    expect(document.querySelector('.loan-form-preview').textContent).toContain(`${(12_000_000).toLocaleString('fa-IR')} تومان`);
    submit('loan-principal');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ annualInterestRate: 0, totalRepaymentAmount: 120_000_000, installmentCount: 10 });
  });

  it('has «انصراف», never «ثبت و بعدی», and an edit opens what is filled under «جزئیات بیشتر»', async () => {
    const editingLoan = {
      id: 'loan_1', title: 'وام قدیمی', principalAmount: 80_000_000, annualInterestRate: 18, installmentCount: 12,
      intervalMonths: 6, startDate: '2025-01-10', annualFeeAmount: 200_000, notes: 'ضامن: علی', remindersMuted: false, paidCount: 0,
    };
    const { onSubmit } = renderLoanForm({ editingLoan });
    await waitFor(() => expect(document.getElementById('loan-notes')?.value).toBe('ضامن: علی'));
    expect(screen.queryByRole('button', { name: 'ثبت و بعدی' })).toBeNull();
    expect(button('انصراف')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'کل بازپرداخت را می‌دانم' })).toBeNull();
    expect(rowValue('دوره پرداخت اقساط')).toBe('شش‌ماهه (هر ۶ ماه)');
    expect(document.getElementById('loan-principal').value).toBe('80,000,000');
    submit('loan-principal');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      principalAmount: 80_000_000, annualInterestRate: 18, intervalMonths: 6, startDate: '2025-01-10', annualFeeAmount: 200_000,
    });
  });
});

describe('the extra payment', () => {
  const loan = { id: 'loan_1', title: 'وام مسکن', remainingBalance: 30_000_000 };
  const renderExtra = () => {
    const onSubmit = vi.fn(async () => ({}));
    const onClose = vi.fn();
    render(<ExtraPaymentModal isOpen loan={loan} onSubmit={onSubmit} onClose={onClose} />);
    return { onSubmit, onClose };
  };

  it('asks the amount first, says when it pays the loan off, and submits the day and mode chosen', async () => {
    const { onSubmit, onClose } = renderExtra();
    expect(document.querySelector('.entry-form-body').firstElementChild.classList.contains('amount-field')).toBe(true);
    expect(button('ثبت پرداخت اضافه').disabled).toBe(true);
    type('extra-payment-amount', '30000000');
    expect(document.querySelector('.amount-field-words').textContent).toBe('سی میلیون تومان');
    expect(screen.getByText('✓ این مبلغ کل مانده را تسویه خواهد کرد.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'کاهش مبلغ اقساط' }).getAttribute('aria-selected')).toBe('true');
    tab('کاهش تعداد اقساط');
    expect(screen.getByText(/وام زودتر تسویه می‌شود/)).toBeTruthy();
    tab('دیروز');
    expect(screen.queryByLabelText('توضیحات یا منبع واریزی')).toBeNull();
    openDetails();
    type('extra-payment-notes', 'پاداش');
    submit('extra-payment-amount');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      amount: 30_000_000, paymentDate: yesterdayIso(), reductionMode: 'reduce_term', notes: 'پاداش',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('keeps today as the day by default and has no «ثبت و بعدی»', async () => {
    const { onSubmit } = renderExtra();
    expect(screen.queryByRole('button', { name: 'ثبت و بعدی' })).toBeNull();
    type('extra-payment-amount', '5000000');
    submit('extra-payment-amount');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ amount: 5_000_000, paymentDate: todayIso(), reductionMode: 'reduce_amount', notes: '' });
  });
});

describe('the bulk installment edit', () => {
  it('uses the entry forms’ footer and submits the amounts typed', async () => {
    const loan = {
      id: 'loan_1', principalAmount: 30_000_000, installmentCount: 3, intervalMonths: 1, startDate: '2025-01-01',
      installments: [1, 2, 3].map((n) => ({
        id: `i${n}`, installmentNumber: n, dueDate: `2025-0${n + 1}-01`, totalAmount: 11_000_000, principalPortion: 10_000_000, isPaid: n === 1,
      })),
    };
    const onSubmit = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<BulkEditInstallmentsModal isOpen loan={loan} onSubmit={onSubmit} onClose={onClose} />);
    expect(button('انصراف')).toBeTruthy();
    const table = within(document.querySelector('.loan-bulk-table'));
    fireEvent.change(table.getByLabelText('مبلغ قسط ۲'), { target: { value: '12000000' } });
    fireEvent.submit(document.querySelector('.loan-bulk-table').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ 2: 12_000_000 }, 33_000_000);
  });
});
