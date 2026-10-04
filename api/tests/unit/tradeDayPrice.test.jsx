// @vitest-environment happy-dom
/**
 * tradeDayPrice.test.jsx — The asset paid or compared with gets the price of the trade's day:
 * today's live price, or the day's close from the price history for a past date — again when the
 * date changes, and an edited record keeps its saved price until then (hooks/useTradeDayPrice.js)
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, screen } from '@testing-library/react';

const pricing = vi.hoisted(() => ({
  priceMap: { usd: 120000 },
  itemMap: { usd: { id: 'usd', name: 'دلار', unit: 'دلار', price: 120000 } },
}));
vi.mock('../../../web/src/features/market/index.js', () => ({ usePricing: () => pricing }));
const day = vi.hoisted(() => ({ priceOnDay: vi.fn(async () => 61000) }));
vi.mock('../../../web/src/features/market/priceOnDay.js', () => day);
vi.mock('../../../web/src/components/UniversalAssetSearch.jsx', () => ({ default: () => <div>search</div> }));

const { default: ReferenceAssetInputs } = await import('../../../web/src/features/portfolio/components/ReferenceAssetInputs.jsx');
const { default: CompareAssetInputs } = await import('../../../web/src/features/portfolio/components/CompareAssetInputs.jsx');
const { tradeDayIso } = await import('../../../web/src/features/portfolio/hooks/useTradeDayPrice.js');

afterEach(() => {
  cleanup();
  day.priceOnDay.mockClear();
});
const usd = { id: 'usd', name: 'دلار', unit: 'دلار' };
const ref = (props) => (
  <ReferenceAssetInputs referenceAsset={usd} onReferenceAssetChange={() => {}} referenceQuantity="100" onReferenceQuantityChange={() => {}}
    referencePriceToman="" newAssetAmount={1} {...props} />
);

describe('the price of the trade day', () => {
  it('a trade today takes the live price', () => {
    const onPrice = vi.fn();
    render(ref({ onReferencePriceChange: onPrice, tradeDate: '' }));
    expect(onPrice).toHaveBeenCalledWith('120000');
    expect(day.priceOnDay).not.toHaveBeenCalled();
  });

  it('a past trade takes that day from the history', async () => {
    const onPrice = vi.fn();
    render(ref({ onReferencePriceChange: onPrice, tradeDate: '1403/01/15' }));
    await waitFor(() => expect(onPrice).toHaveBeenLastCalledWith('61000'));
    expect(day.priceOnDay).toHaveBeenCalledWith('usd', '2024-04-03');
    expect(screen.getByText(/قیمت همان روز/)).toBeDefined();
  });

  it('an edited record keeps its price until its date changes', async () => {
    const onPrice = vi.fn();
    const { rerender } = render(ref({ onReferencePriceChange: onPrice, tradeDate: '1403/01/15', referencePriceToman: '59000', autoFillPrice: false }));
    expect(onPrice).not.toHaveBeenCalled();
    rerender(ref({ onReferencePriceChange: onPrice, tradeDate: '1403/02/01', referencePriceToman: '59000', autoFillPrice: false }));
    await waitFor(() => expect(onPrice).toHaveBeenLastCalledWith('61000'));
  });

  it('without history for that day the live price stands in, and says so', async () => {
    day.priceOnDay.mockResolvedValueOnce(null);
    const onPrice = vi.fn();
    render(<CompareAssetInputs compareAsset={usd} onCompareAssetChange={() => {}} comparePriceToman="" onComparePriceChange={onPrice} totalCostToman={1000000} tradeDate="1390/01/01" />);
    await waitFor(() => expect(screen.getByText(/در تاریخچه نیست/)).toBeDefined());
    expect(onPrice).toHaveBeenLastCalledWith('120000');
  });

  it('reads Shamsi and ISO dates', () => {
    expect(tradeDayIso('1403/01/15')).toBe('2024-04-03');
    expect(tradeDayIso('2024-04-03T00:00:00')).toBe('2024-04-03');
    expect(tradeDayIso('')).toBe('');
  });
});
