// @vitest-environment happy-dom
/**
 * entryFormSwitch.test.jsx — the portfolio's one entry form: «خرید / موجودی» (price optional) and
 * «فروش» switch to each other for the same asset
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../web/src/features/market/index.js', () => ({
  usePricing: () => ({ priceMap: { usd: 100_000 }, itemMap: {}, getAsset: () => null, getAssetPrice: () => 0 }),
}));
vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));

const { default: AddHoldingForm } = await import('../../../web/src/features/portfolio/components/AddHoldingForm.jsx');
const { default: TransactionForm } = await import('../../../web/src/features/transactions/components/TransactionForm.jsx');

afterEach(cleanup);

describe('one entry form', () => {
  it('the buy side switches to the sell side with its asset', () => {
    const onSwitchToSell = vi.fn();
    render(<AddHoldingForm isOpen onClose={() => {}} onSubmit={() => {}} presetAsset={{ assetId: 'usd', assetName: 'دلار', unit: 'دلار' }} onSwitchToSell={onSwitchToSell} />);
    expect(screen.getByText('ثبت در پورتفو')).toBeTruthy();
    expect(screen.getByText(/قیمت خرید هر .* \(تومان، اختیاری\)/)).toBeTruthy();
    expect(screen.getByText(/بدون قیمت خرید، موجودی ثبت می‌شود/)).toBeTruthy();
    fireEvent.click(screen.getByText('فروش').closest('button'));
    expect(onSwitchToSell).toHaveBeenCalledWith(expect.objectContaining({ assetId: 'usd' }));
  });

  it('no switch while editing a recorded buy', () => {
    render(<AddHoldingForm isOpen onClose={() => {}} onSubmit={() => {}} editingHolding={{ id: 'h1', assetId: 'usd', amount: 5 }} onSwitchToSell={vi.fn()} />);
    expect(screen.queryByText('فروش')).toBeNull();
    expect(screen.getByText('ویرایش خرید')).toBeTruthy();
  });

  it('the sell side switches back to the buy side', () => {
    const onSwitchToBuy = vi.fn();
    render(<TransactionForm isOpen onClose={() => {}} onSubmit={() => {}} preset={{ assetId: 'usd', assetName: 'دلار', unit: 'دلار', transactionType: 'sell' }} onSwitchToBuy={onSwitchToBuy} />);
    fireEvent.click(screen.getByText('خرید / موجودی').closest('button'));
    expect(onSwitchToBuy).toHaveBeenCalledWith({ assetId: 'usd', assetName: 'دلار', unit: 'دلار' });
  });
});
