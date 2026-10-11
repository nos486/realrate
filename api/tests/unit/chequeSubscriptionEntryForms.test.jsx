// @vitest-environment happy-dom
/**
 * chequeSubscriptionEntryForms.test.jsx — The cheque and subscription forms as entry forms
 * (web/src/shared/form/): the amount first with its words, received/issued and the cycle as
 * segmented choices, «بابت» and a subscription's category as tiles, the account as a picker row,
 * the rarely needed under «جزئیات بیشتر», and «ثبت و بعدی» for the next cheque of a stack — with
 * the same records submitted as before
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { pickCategory, chosenCategory, pickCurrency, pickRow, rowValue, pickerRow, openDetails } from '../helpers/entryForm.js';

vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ loading: false, accounts: [{ id: 'acc_m', name: 'ملت', currencies: ['IRT'] }] }),
}));
vi.mock('../../../web/src/shared/banks/bankApi.js', () => ({
  listCustomBanks: async () => ({ banks: [] }), createCustomBank: vi.fn(), deleteCustomBank: vi.fn(),
}));

const { default: ChequeForm } = await import('../../../web/src/features/cheques/components/ChequeForm.jsx');
const { default: ChequeTrackingModal } = await import('../../../web/src/features/cheques/components/ChequeTrackingModal.jsx');
const { default: SubscriptionForm } = await import('../../../web/src/features/subscriptions/components/SubscriptionForm.jsx');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

const tab = (name) => fireEvent.click(screen.getByRole('tab', { name }));
const type = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
const submitOf = (id) => fireEvent.submit(document.getElementById(id).closest('form'));

describe('the cheque form', () => {
  const renderCheque = (props = {}) => {
    const onSubmit = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<ChequeForm onSubmit={onSubmit} onClose={onClose} {...props} />);
    return { onSubmit, onClose };
  };

  it('asks the amount first, in tomans and in words', () => {
    renderCheque();
    expect(document.querySelector('.entry-form-body .amount-field')).toBeTruthy();
    expect(document.querySelector('.amount-field-currency.is-static').textContent).toBe('تومان');
    expect(screen.queryByLabelText('ارز')).toBeNull();
    type('cheque-amount', '50000000');
    expect(screen.getByText('پنجاه میلیون تومان')).toBeTruthy();
  });

  it('chooses received or issued as a segmented choice, and «بابت» from that kind of category', () => {
    renderCheque();
    expect(document.querySelector('.ui-filter-pills.variant-segmented [role="tab"]')).toBeTruthy();
    pickCategory('حقوق');
    expect(chosenCategory()).toBe('حقوق');
    expect(rowValue('واریز به حساب')).toBe('نامشخص');
    tab('چک صادره');
    // Another kind: «بابت» starts over from expense categories, the account row is renamed
    expect(chosenCategory()).toBe('نامشخص');
    pickCategory('خوراک و خواربار');
    expect(pickerRow('از حساب')).toBeTruthy();
    pickRow('از حساب', 'ملت');
    expect(rowValue('از حساب')).toBe('ملت');
  });

  it('submits the same cheque as before', async () => {
    const { onSubmit, onClose } = renderCheque();
    tab('چک صادره');
    type('cheque-amount', '12000000');
    type('cheque-counterparty', 'علی');
    pickCategory('خوراک و خواربار');
    pickRow('از حساب', 'ملت');
    openDetails();
    type('cheque-number', '123');
    type('cheque-notes', 'قسط اول');
    submitOf('cheque-amount');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      direction: 'issued', amount: 12_000_000, counterparty: 'علی', category: 'groceries', accountId: 'acc_m',
      chequeNumber: '123', notes: 'قسط اول', sayadId: '', remindersMuted: false, status: 'pending',
    });
    expect(onSubmit.mock.calls[0][0].history).toHaveLength(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('folds the bank, number, Sayad id and note under «جزئیات بیشتر», open when an edit has them', () => {
    renderCheque();
    expect(document.getElementById('cheque-number')).toBeNull();
    expect(document.querySelector('.more-details-toggle').getAttribute('aria-expanded')).toBe('false');
    openDetails();
    expect(document.getElementById('cheque-number')).toBeTruthy();
    expect(document.getElementById('cheque-sayad')).toBeTruthy();
    cleanup();
    renderCheque({ editingCheque: { id: 'chq_1', direction: 'received', status: 'pending', amount: 1000, counterparty: 'رضا', dueDate: '2026-12-01', chequeNumber: '77', history: [] } });
    expect(document.getElementById('cheque-number').value).toBe('77');
  });

  it('«ثبت و بعدی» keeps the stack’s other party, direction and «بابت», and clears what is the cheque’s own', async () => {
    const { onSubmit, onClose } = renderCheque();
    tab('چک صادره');
    type('cheque-amount', '5000000');
    type('cheque-counterparty', 'شرکت الف');
    pickCategory('خوراک و خواربار');
    openDetails();
    type('cheque-number', '100');
    fireEvent.click(screen.getByRole('button', { name: 'ثبت و بعدی' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('شرکت الف');
    expect(document.getElementById('cheque-amount').value).toBe('');
    expect(document.getElementById('cheque-number').value).toBe('');
    expect(document.getElementById('cheque-counterparty').value).toBe('شرکت الف');
    expect(chosenCategory()).toBe('خوراک و خواربار');
    expect(screen.getByRole('tab', { name: 'چک صادره' }).getAttribute('aria-selected')).toBe('true');
  });

  it('offers «ثبت و بعدی» only for a new cheque typed in (not an edit, not a scan)', () => {
    renderCheque({ editingCheque: { id: 'chq_1', direction: 'received', status: 'pending', amount: 1000, counterparty: 'رضا', dueDate: '2026-12-01', history: [] } });
    expect(screen.queryByRole('button', { name: 'ثبت و بعدی' })).toBeNull();
    expect(screen.getByRole('button', { name: 'انصراف' })).toBeTruthy();
    cleanup();
    renderCheque({ initialValues: { amount: 2000, counterparty: 'سارا', bankName: 'ملی' }, confidence: { amount: 'low' } });
    expect(screen.queryByRole('button', { name: 'ثبت و بعدی' })).toBeNull();
    // The scan's low confidence still marks the amount; the bank it filled is in view
    expect(document.querySelector('.has-scan-warning .amount-field')).toBeTruthy();
    expect(document.querySelector('.more-details').classList.contains('is-open')).toBe(true);
  });
});

describe('the cheque tracking modal', () => {
  it('picks the day it happened with «امروز / دیروز / روز دیگر»', () => {
    const onChangeStatus = vi.fn(async () => {});
    const cheque = { id: 'chq_1', direction: 'received', status: 'pending', amount: 1000, counterparty: 'رضا', dueDate: '2026-12-01', history: [{ status: 'pending', date: '2026-01-01', note: '' }] };
    render(<ChequeTrackingModal cheque={cheque} onClose={() => {}} onChangeStatus={onChangeStatus} onEdit={() => {}} />);
    expect(document.querySelector('.cheque-update-section .date-field')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'امروز' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('the subscription form', () => {
  const renderSub = (props = {}) => {
    const onSubmit = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<SubscriptionForm accounts={[{ id: 'acc_m', name: 'ملت', currencies: ['IRT'] }, { id: 'acc_d', name: 'ارزی', currencies: ['USD'] }]} onSubmit={onSubmit} onClose={onClose} {...props} />);
    return { onSubmit, onClose };
  };

  it('asks the cost first, in any currency, and submits the same subscription', async () => {
    const { onSubmit } = renderSub();
    expect(document.querySelector('.entry-form-body').firstElementChild.classList.contains('amount-field')).toBe(true);
    type('sub-amount', '6');
    pickCurrency('دلار');
    expect(screen.getByText('شش دلار')).toBeTruthy();
    type('sub-name', 'Spotify');
    pickCategory('موسیقی و پادکست');
    tab('سالانه');
    tab('دستی تمدید می‌کنم');
    // Only the accounts holding dollars
    pickRow('پرداخت از', 'ارزی');
    submitOf('sub-name');
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'Spotify', category: 'music', amount: 6, currency: 'USD', cycleMonths: 12, autoRenew: false,
      accountId: 'acc_d', endDate: '', url: '', notes: '', remindersMuted: false, status: 'active',
    });
    expect(onSubmit.mock.calls[0][0].renewOn).toBeTruthy();
  });

  it('folds the end day, the site and the note under «جزئیات بیشتر», and has no «ثبت و بعدی»', () => {
    renderSub();
    expect(document.getElementById('sub-url')).toBeNull();
    openDetails();
    expect(document.getElementById('sub-url')).toBeTruthy();
    expect(document.getElementById('sub-notes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ثبت و بعدی' })).toBeNull();
    cleanup();
    renderSub({ subscription: { id: 's1', name: 'X', category: 'video', amount: 10, currency: 'IRT', cycleMonths: 1, startDate: '2026-01-01', autoRenew: true, url: 'https://x.io' } });
    expect(document.getElementById('sub-url').value).toBe('https://x.io');
    expect(screen.getByRole('radio', { name: 'فیلم و سریال' }).getAttribute('aria-checked')).toBe('true');
  });
});
