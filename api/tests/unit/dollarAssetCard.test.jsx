// @vitest-environment happy-dom
/**
 * dollarAssetCard.test.jsx — A dollar-priced asset on the home page reads in dollars (its own
 * price, its day range), with its toman price under it; its chart reads the dollar series
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

const getSparklines = vi.fn(async () => ({ available: true, sparklines: {} }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => ({ getSparklines: (...a) => getSparklines(...a) }));

import HomeAssetCard from '../../../web/src/features/home/HomeAssetCard.jsx';
import { buildAssetIndex, resolveHomeAsset } from '../../../web/src/features/home/homeAssets.js';
import { bookToAssets } from '../../../web/src/features/market/priceBookAssets.js';
import { buildPriceBook } from '../../src/domain/priceBook.js';

afterEach(cleanup);

const book = buildPriceBook([
  { id: 'src_def_usd', priceType: 'usd', isActive: true, isPrimary: true, items: [{ id: 'src_def_usd', price: 100000 }] },
  { id: 'src_def_oil_brent', priceType: 'oil_brent', quote: 'usd', unit: 'بشکه', category: 'commodity', isActive: true, isPrimary: true, items: [{ id: 'src_def_oil_brent', price: 71.7 }] },
]);
const { itemMap } = bookToAssets(book);
const index = buildAssetIndex({ itemMap });

describe('a dollar-priced asset card', () => {
  it('shows its dollar price and the toman equivalent', () => {
    const asset = resolveHomeAsset('oil_brent', index);
    expect(asset).toMatchObject({ currency: 'usd', unit: 'دلار', perUnit: 'بشکه', seriesId: 'oil_brent@usd', price: 71.7 });
    render(<HomeAssetCard asset={asset} style="detailed" />);
    expect(screen.getByText((71.7).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))).toBeTruthy();
    expect(screen.getByText('دلار')).toBeTruthy();
    render(<HomeAssetCard asset={asset} style="compact" />);
    expect(screen.getByText(/≈ .* تومان/)).toBeTruthy();
  });

  it('reads its chart from the dollar series', async () => {
    const asset = resolveHomeAsset('oil_brent', index);
    render(<HomeAssetCard asset={asset} style="detailed" />);
    fireEvent.click(screen.getByRole('button'));
    await vi.waitFor(() => expect(getSparklines).toHaveBeenCalled());
    expect(getSparklines.mock.calls[0][0]).toEqual(['oil_brent@usd']);
  });

  it('keeps a toman asset in tomans', () => {
    const usd = resolveHomeAsset('usd', index);
    expect(usd).toMatchObject({ currency: 'toman', unit: 'تومان', seriesId: 'usd', price: 100000 });
  });
});
