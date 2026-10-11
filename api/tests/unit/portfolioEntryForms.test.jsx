// @vitest-environment happy-dom
/**
 * portfolioEntryForms.test.jsx — the portfolio's buy and sell forms laid out as entry forms
 * (shared/form/): the quantity first and large, «خرید / فروش» as a segmented switch, the rarely
 * needed under «جزئیات بیشتر», «ثبت و بعدی» on a new entry — and the same record submitted as before
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { openDetails, pickRow, rowValue } from '../helpers/entryForm.js';

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
