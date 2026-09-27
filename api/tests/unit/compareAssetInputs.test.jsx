// @vitest-environment happy-dom
/**
 * compareAssetInputs.test.jsx — The "what if I had bought this instead" inputs of the holding form
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../web/src/features/market/index.js', () => ({
  usePricing: () => ({
    priceMap: { gold_18k: 8000000 },
    itemMap: { gold_18k: { id: 'gold_18k', name: 'طلای ۱۸ عیار', unit: 'گرم', price: 8000000 } },
  }),
}));
vi.mock('../../../web/src/components/UniversalAssetSearch.jsx', () => ({ default: () => <div>search</div> }));

const { default: CompareAssetInputs } = await import('../../../web/src/features/portfolio/components/CompareAssetInputs.jsx');

afterEach(cleanup);

const gold = { id: 'gold_18k', name: 'طلای ۱۸ عیار', unit: 'گرم' };

describe('CompareAssetInputs', () => {
  it('starts closed and opens on click', () => {
    render(<CompareAssetInputs compareAsset={null} onCompareAssetChange={() => {}} comparePriceToman="" onComparePriceChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /مقایسه با خرید دارایی دیگر/ }));
    expect(screen.getByText('search')).toBeDefined();
  });

  it('fills today\'s price for a new comparison', () => {
    const onPrice = vi.fn();
    render(<CompareAssetInputs compareAsset={gold} onCompareAssetChange={() => {}} comparePriceToman="" onComparePriceChange={onPrice} totalCostToman={100000000} />);
    expect(onPrice).toHaveBeenCalledWith('8000000');
  });

  it('keeps a saved price when editing, and previews what the money would be worth today', () => {
    const onPrice = vi.fn();
    render(<CompareAssetInputs compareAsset={gold} onCompareAssetChange={() => {}} comparePriceToman="5000000" onComparePriceChange={onPrice} totalCostToman={100000000} autoFillPrice={false} />);
    expect(onPrice).not.toHaveBeenCalled();
    // 100M / 5M = 20 g, worth 160M today
    expect(screen.getByText(/۲۰ گرم طلای ۱۸ عیار/)).toBeDefined();
    expect(screen.getByText(/۱۶۰٬۰۰۰٬۰۰۰ تومان/)).toBeDefined();
  });

  it('asks for the buy price when there is no cost yet', () => {
    render(<CompareAssetInputs compareAsset={gold} onCompareAssetChange={() => {}} comparePriceToman="5000000" onComparePriceChange={() => {}} totalCostToman={0} autoFillPrice={false} />);
    expect(screen.getByText('برای مقایسه، قیمت خرید را وارد کنید.')).toBeDefined();
  });
});
