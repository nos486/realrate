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
const history = vi.hoisted(() => ({ prices: {} }));
vi.mock('../../../web/src/features/market/dailyHistory.js', () => ({
  useDailyHistory: (ids) => ({ priceAt: (id, day) => (ids.includes(id) ? history.prices[`${id}|${day}`] ?? null : null), loading: false }),
}));

const { default: CompareAssetInputs } = await import('../../../web/src/features/portfolio/components/CompareAssetInputs.jsx');

afterEach(cleanup);

const gold = { id: 'gold_18k', name: 'طلای ۱۸ عیار', unit: 'گرم' };

describe('CompareAssetInputs', () => {
  it('starts closed and opens on click', () => {
    render(<CompareAssetInputs compareAsset={null} onCompareAssetChange={() => {}} comparePriceToman="" onComparePriceChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /مقایسه با خرید دارایی دیگر/ }));
    expect(screen.getByText('search')).toBeDefined();
  });

  it("shows the purchase day's price from the history and fills nothing in", () => {
    history.prices['gold_18k|2024-04-03'] = 4000000;
    const onPrice = vi.fn();
    render(<CompareAssetInputs compareAsset={gold} onCompareAssetChange={() => {}} comparePriceToman="" onComparePriceChange={onPrice} totalCostToman={100000000} tradeDate="1403/01/15" />);
    expect(onPrice).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText(/۴٬۰۰۰٬۰۰۰ — قیمت آن روز/)).toBeDefined();
    expect(screen.getByText(/از تاریخچه قیمت/)).toBeDefined();
    // 100M / 4M = 25 g, worth 200M today
    expect(screen.getByText(/۲۵ گرم طلای ۱۸ عیار/)).toBeDefined();
  });

  it("without a purchase date, today's price", () => {
    render(<CompareAssetInputs compareAsset={gold} onCompareAssetChange={() => {}} comparePriceToman="" onComparePriceChange={() => {}} totalCostToman={80000000} />);
    expect(screen.getByText(/بدون تاریخ خرید، قیمت امروز ثبت می‌شود/)).toBeDefined();
    expect(screen.getByText(/۱۰ گرم طلای ۱۸ عیار/)).toBeDefined();
  });

  it('a typed price is used over the day\'s, and previews what the money would be worth today', () => {
    const onPrice = vi.fn();
    render(<CompareAssetInputs compareAsset={gold} onCompareAssetChange={() => {}} comparePriceToman="5000000" onComparePriceChange={onPrice} totalCostToman={100000000} />);
    expect(onPrice).not.toHaveBeenCalled();
    // 100M / 5M = 20 g, worth 160M today
    expect(screen.getByText(/۲۰ گرم طلای ۱۸ عیار/)).toBeDefined();
    expect(screen.getByText(/۱۶۰٬۰۰۰٬۰۰۰ تومان/)).toBeDefined();
  });

  it('asks for the buy price when there is no cost yet', () => {
    render(<CompareAssetInputs compareAsset={gold} onCompareAssetChange={() => {}} comparePriceToman="5000000" onComparePriceChange={() => {}} totalCostToman={0} />);
    expect(screen.getByText('برای مقایسه، قیمت خرید را وارد کنید.')).toBeDefined();
  });
});
