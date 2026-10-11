// @vitest-environment happy-dom
/**
 * accountEntryForms.test.jsx — the accounts' forms laid out as entry forms (shared/form/): the
 * transfer, a credit's payment and installment plan, the account itself, and what came back for a
 * shared expense. About the layout and its controls; what each form saves is tested with its page.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { openDetails, pickRow, rowValue, setDay } from '../helpers/entryForm.js';

vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }) }));

vi.mock('../../../web/src/shared/banks/bankApi.js', () => ({ listCustomBanks: vi.fn(async () => ({ banks: [] })), createCustomBank: vi.fn(), deleteCustomBank: vi.fn() }));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({
  getExpenseGroups: vi.fn(async () => ({ groups: [] })),
  ensureDailyGroup: vi.fn(async () => ({ id: 'grp_daily' })),
  saveExpense: vi.fn(async (input) => ({ id: 'exp_fee', ...input })),
  newReimbursement: (input) => ({ id: 'rmb_new', ...input }),
}));

import AccountForm from '../../../web/src/features/accounts/components/AccountForm.jsx';
import ReimbursementsModal from '../../../web/src/features/expenses/components/ReimbursementsModal.jsx';
import TransferForm from '../../../web/src/features/accounts/components/TransferForm.jsx';
import CreditConversionForm from '../../../web/src/features/accounts/components/CreditConversionForm.jsx';
import CreditPaymentForm from '../../../web/src/features/accounts/components/CreditPaymentForm.jsx';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ACCOUNTS = [
  { id: 'acc_1', name: 'ملت', type: 'bank' },
  { id: 'acc_2', name: 'کیف پول', type: 'wallet' },
  { id: 'acc_3', name: 'نقد', type: 'cash' },
];
const setValue = (el, value) => fireEvent.change(el, { target: { value } });
const order = () => [...document.querySelector('.entry-form-body').children].map((el) => el.className.split(' ')[0]);

describe('TransferForm', () => {
  it('leads with the amount, picks the accounts in rows and folds the fee and note', () => {
    render(<TransferForm accounts={ACCOUNTS} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(order()).toEqual(['ui-input-group', 'entry-form-section', 'ui-input-group', 'more-details']);
    expect(document.querySelector('.entry-form-body > .amount-field #transfer-amount')).toBeTruthy();
    expect(screen.queryByLabelText('ارز')).toBeNull();
    expect(rowValue('از حساب')).toBe('انتخاب کنید');
    pickRow('از حساب', 'ملت');
    // The account it comes from is not among where it goes
    pickRow('به حساب', 'نقد');
    expect(rowValue('به حساب')).toBe('نقد');
    expect(document.getElementById('transfer-fee')).toBeNull();
    openDetails();
    expect(document.getElementById('transfer-fee')).toBeTruthy();
  });

  it('«ثبت و بعدی» saves and keeps the accounts and day for the next one', async () => {
    const onSubmit = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<TransferForm accounts={ACCOUNTS} onSubmit={onSubmit} onClose={onClose} />);
    pickRow('از حساب', 'ملت');
    pickRow('به حساب', 'کیف پول');
    setDay('1405/07/01');
    setValue(document.getElementById('transfer-amount'), '2000000');
    expect(document.querySelector('.amount-field-words').textContent).toMatch(/دو میلیون/);
    openDetails();
    setValue(document.getElementById('transfer-fee'), '1000');
    fireEvent.click(screen.getByText('ثبت و بعدی'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 2_000_000, fee: 1000, date: '2026-09-23' });
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(document.getElementById('transfer-amount').value).toBe('');
    expect(rowValue('از حساب')).toBe('ملت');
    expect(rowValue('به حساب')).toBe('کیف پول');
    expect(document.querySelector('.date-field .date-text-input').value).toMatch(/1405\/07\/01|۱۴۰۵\/۰۷\/۰۱/);
  });

  it('an edit, or a transfer from a bank SMS, has «انصراف» instead of «ثبت و بعدی» and shows its folded fields', () => {
    const transfer = { id: 'trf_1', fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 500000, fee: 0, date: '2026-09-20', notes: 'شارژ' };
    render(<TransferForm transfer={transfer} accounts={ACCOUNTS} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('ثبت و بعدی')).toBeNull();
    expect(screen.getByText('انصراف')).toBeTruthy();
    expect(document.getElementById('transfer-notes').value).toBe('شارژ');
    cleanup();
    render(<TransferForm draft={{ amount: 100, fromAccountId: 'acc_1' }} accounts={ACCOUNTS} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('ثبت و بعدی')).toBeNull();
  });
});

describe('CreditPaymentForm', () => {
  const credit = { id: 'cr_1', name: 'اوانو', type: 'credit' };

  it('an installment: its amount first and large, «پرداخت از» as a row, the day', async () => {
    const saveTransfer = vi.fn(async (input) => ({ id: 'trf_1', ...input }));
    const onPaid = vi.fn();
    render(<CreditPaymentForm account={credit} installment={{ n: 1, count: 3, dueDate: '2026-10-01', amount: 3_700_000 }}
      payers={ACCOUNTS.slice(0, 2)} saveTransfer={saveTransfer} onPaid={onPaid} onClose={vi.fn()} />);
    expect(document.querySelector('.entry-form-body > .amount-field #credit-pay-settled')).toBeTruthy();
    expect(screen.getByLabelText('مبلغ قسط (تومان) *')).toBeTruthy();
    expect(document.getElementById('credit-pay-paid')).toBeNull();
    expect(screen.queryByText('ثبت و بعدی')).toBeNull();
    expect(screen.getByText('ثبت پرداخت').closest('button').disabled).toBe(true);
    pickRow('پرداخت از', 'کیف پول');
    setDay('1405/07/01');
    fireEvent.submit(screen.getByText('ثبت پرداخت').closest('form'));
    await waitFor(() => expect(onPaid).toHaveBeenCalled());
    expect(saveTransfer.mock.calls[0][0]).toMatchObject({ fromAccountId: 'acc_2', toAccountId: 'cr_1', amount: 3_700_000, fee: 0, date: '2026-09-23' });
  });

  it('a settlement: the debt first, what was paid under it with its fee; one payer is chosen already', () => {
    render(<CreditPaymentForm account={credit} debt={10_000_000} payers={ACCOUNTS.slice(0, 1)} saveTransfer={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText('بدهی تسویه‌شده (تومان) *')).toBeTruthy();
    expect(rowValue('پرداخت از')).toBe('ملت');
    setValue(document.getElementById('credit-pay-paid'), '10200000');
    expect(screen.getByText(/کارمزد تسویه: ۲۰۰٬۰۰۰ تومان \(۲٪\)/)).toBeTruthy();
  });
});

describe('CreditConversionForm', () => {
  it('leads with the amount, then the day (today/yesterday/other), then the rows', async () => {
    const onSave = vi.fn(async () => {});
    render(<CreditConversionForm account={{ id: 'cr_1', name: 'اوانو' }} debt={6_000_000} onSave={onSave} onClose={vi.fn()} />);
    expect(order().slice(0, 2)).toEqual(['ui-input-group', 'ui-input-group']);
    expect(document.querySelector('.entry-form-body > .amount-field #conversion-principal')).toBeTruthy();
    expect(screen.getByText(/بدهی خارج از اقساط: ۶٬۰۰۰٬۰۰۰ تومان/)).toBeTruthy();
    expect(document.querySelector('.entry-form-body > .date-field')).toBeTruthy();
    expect(screen.getByText('تبدیل به قسط', { selector: 'button *, button' }).closest('button').disabled).toBe(true);
    setDay('1405/07/01');
    fireEvent.click(screen.getByText('افزودن قسط'));
    const row = document.querySelector('.credit-row');
    fireEvent.change(row.querySelector('input.date-text-input'), { target: { value: '1405/08/01' } });
    setValue(row.querySelector('input[id^="conversion-row-"]'), '6000000');
    fireEvent.submit(document.querySelector('form'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toMatchObject({ date: '2026-09-23', principal: 6_000_000, installments: [{ amount: 6_000_000 }] });
  });
});

describe('ReimbursementsModal', () => {
  const expense = { id: 'exp_1', title: 'شام', amount: 300, currency: 'USD', myShare: 100, date: '2026-09-20', reimbursements: [] };
  const accounts = [{ id: 'acc_w', name: 'وایز', type: 'bank', currencies: ['USD'] }, { id: 'acc_1', name: 'ملت', type: 'bank' }];

  it('the next amount first, in the expense\'s currency; «واریز به» a row of the accounts holding it; the note folded', async () => {
    const onSave = vi.fn(async (input, existing) => ({ ...existing, ...input }));
    render(<ReimbursementsModal expense={expense} accounts={accounts} onSave={onSave} onClose={vi.fn()} />);
    const amount = document.querySelector('.entry-form-body > .amount-field #reimbursement-amount');
    expect(amount.value.replace(/[^\d]/g, '')).toBe('200');
    expect(screen.getByLabelText('مبلغ دریافتی (دلار) *')).toBeTruthy();
    expect(screen.queryByLabelText('ارز')).toBeNull();
    expect(rowValue('واریز به')).toBe('نامشخص / نقد');
    pickRow('واریز به', 'وایز');
    expect(document.getElementById('reimbursement-notes')).toBeNull();
    openDetails();
    setValue(document.getElementById('reimbursement-notes'), 'سهم علی');
    setDay('1405/07/01');
    setValue(amount, '50');
    fireEvent.submit(screen.getByText('ثبت دریافت').closest('form'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].reimbursements[0]).toMatchObject({ amount: 50, accountId: 'acc_w', date: '2026-09-23', notes: 'سهم علی' });
    // What is left is offered next, the note cleared
    await waitFor(() => expect(document.getElementById('reimbursement-amount').value.replace(/[^\d]/g, '')).toBe('150'));
    expect(document.getElementById('reimbursement-notes').value).toBe('');
  });
});

describe('AccountForm', () => {
  it('the type as icon tiles; the card, account number and notes folded under «جزئیات بیشتر»', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<AccountForm onSubmit={onSubmit} onClose={vi.fn()} />);
    const tiles = [...document.querySelectorAll('.account-type-field .category-tile')];
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual(['حساب بانکی', 'اعتبار بانکی', 'نقد', 'کیف پول الکترونیک', 'سایر']);
    expect(document.querySelector('.category-tile[aria-checked="true"]').getAttribute('aria-label')).toBe('حساب بانکی');
    expect(document.getElementById('account-card')).toBeNull();
    expect(screen.queryByText('ثبت و بعدی')).toBeNull();
    openDetails();
    setValue(document.getElementById('account-card'), '1234');
    setValue(document.getElementById('account-name'), 'حقوق');
    fireEvent.click(screen.getByRole('radio', { name: 'نقد' }));
    // A cash account has no card: only the notes are left in it
    expect(document.getElementById('account-card')).toBeNull();
    expect(document.getElementById('account-notes')).toBeTruthy();
    fireEvent.submit(screen.getByText('افزودن حساب').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: 'cash', name: 'حقوق', cardLast4: '', currencies: ['IRT'] });
  });

  it('an edit opens «جزئیات بیشتر» when something in it is set; a credit counts from a day picked as today/yesterday/other', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<AccountForm account={{ id: 'acc_1', type: 'bank', name: 'ملت', cardLast4: '9876', notes: '' }} onSubmit={onSubmit} onClose={vi.fn()} />);
    expect(document.getElementById('account-card').value).toBe('9876');
    expect(screen.getByText('انصراف')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'اعتبار بانکی' }));
    setValue(screen.getByLabelText('سقف اعتبار (تومان) *'), '50000000');
    setDay('1405/07/01');
    fireEvent.submit(screen.getByText('ذخیره تغییرات').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ type: 'credit', credit: { limit: 50_000_000, startDate: '2026-09-23' } });
  });
});
