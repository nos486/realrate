// @vitest-environment happy-dom
/**
 * portfolioEntryForms.test.jsx — the portfolio's buy and sell forms laid out as entry forms
 * (shared/form/): the quantity first and large, «خرید / فروش» as a segmented switch, the rarely
 * needed under «جزئیات بیشتر», «ثبت و بعدی» on a new entry — and the same record submitted as before
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { openDetails, pickRow, rowValue, setDay } from '../helpers/entryForm.js';

let loans = [];
vi.mock('../../../web/src/features/market/index.js', () => ({
  usePricing: () => ({ priceMap: { usd: 100_000 }, itemMap: {}, getAsset: () => null, getAssetPrice: () => 0 }),
}));
vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => loans }));

const { default: AddHoldingForm } = await import('../../../web/src/features/portfolio/components/AddHoldingForm.jsx');

afterEach(() => {
  cleanup();
  loans = [];
});

const USD = { assetId: 'usd', assetName: 'دلار', unit: 'دلار' };
const type = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
const submit = () => fireEvent.submit(document.querySelector('form'));

describe('AddHoldingForm as an entry form', () => {
  it('lays out the switch, the asset, the quantity large, the price, the day, then the details', () => {
    render(<AddHoldingForm isOpen onClose={() => {}} onSubmit={() => {}} presetAsset={USD} onSwitchToSell={() => {}} />);
    const body = document.querySelector('.entry-form-body');
    expect(body).toBeTruthy();
    expect(body.querySelector('.ui-filter-pills.variant-segmented')).toBeTruthy();
    const amounts = [...body.querySelectorAll('.amount-field')];
    expect(amounts.map((a) => a.querySelector('input').id)).toEqual(['holding-amount', 'holding-buy-price']);
    // The quantity is the first big number, required; the price is optional
    expect(document.getElementById('holding-amount').required).toBe(true);
    expect(document.getElementById('holding-buy-price').required).toBe(false);
    expect(body.querySelector('.more-details-toggle').getAttribute('aria-expanded')).toBe('false');
    // A new entry: «ثبت و بعدی», no «انصراف»
    expect(screen.getByText('ثبت و بعدی')).toBeTruthy();
    expect(screen.queryByText('انصراف')).toBeNull();
  });

  it('shows a whole quantity in words with its unit', () => {
    render(<AddHoldingForm isOpen onClose={() => {}} onSubmit={() => {}} presetAsset={USD} />);
    type('holding-amount', '25');
    expect(document.querySelector('.amount-field-words').textContent).toContain('بیست و پنج');
  });

  it('submits the same holding as before, its loan picked under «جزئیات بیشتر»', () => {
    loans = [{ id: 'l1', title: 'وام مسکن' }];
    const onSubmit = vi.fn();
    render(<AddHoldingForm isOpen onClose={() => {}} onSubmit={onSubmit} presetAsset={USD} />);
    type('holding-amount', '10');
    type('holding-buy-price', '95000');
    openDetails();
    expect(rowValue('تأمین از')).toBe('پول خودم');
    pickRow('تأمین از', 'وام مسکن');
    type('holding-notes', 'صرافی');
    submit();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      id: undefined,
      assetId: 'usd',
      amount: 10,
      buyPrice: 95000,
      buyDate: '',
      notes: 'صرافی',
      loanId: 'l1',
      customPrice: 0,
      referenceAssetId: '',
      referenceQuantity: 0,
    });
  });

  it('«ثبت و بعدی» saves, keeps the form open and clears only the quantity and the note', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<AddHoldingForm isOpen onClose={() => {}} onSubmit={onSubmit} presetAsset={USD} />);
    type('holding-amount', '3');
    type('holding-buy-price', '90000');
    openDetails();
    type('holding-notes', 'اول');
    fireEvent.click(screen.getByText('ثبت و بعدی'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('ثبت شد'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'usd', amount: 3, notes: 'اول' }), { next: true });
    expect(document.getElementById('holding-amount').value).toBe('');
    expect(document.getElementById('holding-buy-price').value).toBe('90,000');
    expect(document.getElementById('holding-notes').value).toBe('');
  });

  it('nothing is cleared when the save fails', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(<AddHoldingForm isOpen onClose={() => {}} onSubmit={onSubmit} presetAsset={USD} />);
    type('holding-amount', '3');
    fireEvent.click(screen.getByText('ثبت و بعدی'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.getElementById('holding-amount').value).toBe('3');
  });

  it('an edit: «انصراف», no «ثبت و بعدی», and its filled details open', () => {
    loans = [{ id: 'l1', title: 'وام مسکن' }];
    render(<AddHoldingForm isOpen onClose={() => {}} onSubmit={() => {}} editingHolding={{ id: 'h1', assetId: 'usd', amount: 5, notes: 'قدیمی', loanId: 'l1' }} />);
    expect(screen.getByText('انصراف')).toBeTruthy();
    expect(screen.queryByText('ثبت و بعدی')).toBeNull();
    expect(document.querySelector('.more-details-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(rowValue('تأمین از')).toBe('وام مسکن');
    expect(document.getElementById('holding-notes').value).toBe('قدیمی');
  });
});

const { default: TransactionForm } = await import('../../../web/src/features/transactions/components/TransactionForm.jsx');

const SELL_USD = { ...USD, transactionType: 'sell', unitPrice: 100_000 };

describe('TransactionForm as an entry form', () => {
  it('lays out the side, the asset, the quantity and the unit price large, the day, then the details', () => {
    render(<TransactionForm isOpen onClose={() => {}} onSubmit={() => {}} preset={SELL_USD} onSwitchToBuy={() => {}} />);
    const body = document.querySelector('.entry-form-body');
    const side = body.querySelector('.ui-filter-pills.variant-segmented');
    expect(side.querySelector('[aria-selected="true"]').textContent).toBe('فروش (خروج دارایی)');
    const amounts = [...body.querySelectorAll('.amount-field')];
    expect(amounts.map((a) => a.querySelector('input').id)).toEqual(['tx-quantity', 'tx-unit-price']);
    expect(screen.getByText('قیمت هر دلار (تومان) *')).toBeTruthy();
    // The unit price in words
    expect(amounts[1].querySelector('.amount-field-words').textContent).toContain('صد هزار');
    expect(body.querySelector('.date-field [aria-selected="true"]').textContent).toBe('امروز');
    expect(body.querySelector('.more-details-toggle').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('ثبت و بعدی')).toBeTruthy();
  });

  it('submits the same transaction as before', () => {
    const onSubmit = vi.fn();
    render(<TransactionForm isOpen onClose={() => {}} onSubmit={onSubmit} preset={SELL_USD} currentHoldingsMap={{ usd: { amount: 1 } }} />);
    type('tx-quantity', '2');
    expect(screen.getByText(/بیشتر از موجودی/)).toBeTruthy();
    openDetails();
    type('tx-notes', 'صرافی');
    submit();
    expect(onSubmit).toHaveBeenCalledWith({
      id: undefined,
      assetId: 'usd',
      transactionType: 'sell',
      quantity: 2,
      unitPrice: 100_000,
      transactionDate: expect.stringMatching(/^\d{4}\/\d{2}\/\d{2}$/),
      notes: 'صرافی',
      createdAt: undefined,
      referenceAssetId: '',
      referenceQuantity: 0,
    });
  });

  it('switches between buy and sell; a new entry\'s «خرید» goes to the buy form', () => {
    const onSwitchToBuy = vi.fn();
    const { unmount } = render(<TransactionForm isOpen onClose={() => {}} onSubmit={() => {}} preset={SELL_USD} onSwitchToBuy={onSwitchToBuy} />);
    fireEvent.click(screen.getByRole('tab', { name: 'خرید / موجودی' }));
    expect(onSwitchToBuy).toHaveBeenCalledWith(USD);
    unmount();
    // Editing: the side is the record's own choice
    const onSubmit = vi.fn();
    render(<TransactionForm isOpen onClose={() => {}} onSubmit={onSubmit} onSwitchToBuy={onSwitchToBuy}
      editingTransaction={{ id: 't1', assetId: 'usd', assetName: 'دلار', unit: 'دلار', transactionType: 'sell', quantity: 1, unitPrice: 90000, transactionDate: '1404/01/10' }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'خرید (ورود دارایی)' }));
    expect(onSwitchToBuy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('انصراف')).toBeTruthy();
    expect(screen.queryByText('ثبت و بعدی')).toBeNull();
    // A past day: «روز دیگر» with the picker open
    expect(document.querySelector('.date-field .date-text-input').value).toBe('1404/01/10');
    submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', transactionType: 'buy', transactionDate: '1404/01/10' }));
  });

  it('«ثبت و بعدی» saves and keeps the asset, side, price and day for the next one', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<TransactionForm isOpen onClose={() => {}} onSubmit={onSubmit} preset={SELL_USD} />);
    setDay('1404/02/01');
    type('tx-quantity', '4');
    fireEvent.click(screen.getByText('ثبت و بعدی'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('«دلار» ثبت شد'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ quantity: 4, transactionDate: '1404/02/01' }), { next: true });
    expect(document.getElementById('tx-quantity').value).toBe('');
    expect(document.getElementById('tx-unit-price').value).toBe('100,000');
    expect(document.querySelector('.date-field .date-text-input').value).toBe('1404/02/01');
  });
});
