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

import TransferForm from '../../../web/src/features/accounts/components/TransferForm.jsx';

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
