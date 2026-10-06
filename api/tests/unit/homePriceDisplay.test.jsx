// @vitest-environment happy-dom
/**
 * homePriceDisplay.test.jsx — A dollar-priced asset's home card can show its price in tomans:
 * the choice is kept on that card in the layout, and the card then reads in tomans (price, day
 * range, change, chart) with its dollar price under it. The data and the id don't change.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

const getSparklines = vi.fn(async () => ({ available: true, sparklines: {} }));
vi.mock('../../../web/src/features/market/api/marketApi.js', () => ({ getSparklines: (...a) => getSparklines(...a) }));

import HomeAssetCard from '../../../web/src/features/home/HomeAssetCard.jsx';
import { buildAssetIndex, resolveHomeAsset } from '../../../web/src/features/home/homeAssets.js';
import { setItemDisplay, removeItem, updateSection, normalizeLayoutIds } from '../../../web/src/features/home/homeLayoutModel.js';
import { bookToAssets } from '../../../web/src/features/market/priceBookAssets.js';
import { sanitizeHomeLayout } from '../../src/domain/homeLayout.js';
import { withDayRange } from '../../src/services/market/sourceSync.service.js';

afterEach(cleanup);

const tehranDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ounce = {
  id: 'ons_gold', name: 'انس طلا', category: 'gold', unit: 'اونس', price: 265_000_000, currency: 'usd', priceUsd: 2650,
  params: {
    day: tehranDay, dayOpen: 2600, dayHigh: 2700, dayLow: 2590, dayCurrency: 'usd', changePercent: 1.5,
    toman: { dayOpen: 260_000_000, dayHigh: 266_000_000, dayLow: 259_000_000, prevClose: 250_000_000, changePercent: 6 },
  },
};
const index = buildAssetIndex({ itemMap: bookToAssets({ items: { ons_gold: ounce, usd: { id: 'usd', name: 'دلار', price: 100_000, params: {} } } }).itemMap });

describe('the layout keeps the choice on the card', () => {
  const layout = { version: 1, sections: [{ id: 's_1', title: 'x', style: 'detailed', items: ['ons_gold', 'usd'] }] };

  it('stores toman only (dollars is the default) and drops cards that are not in the section', () => {
    const l = setItemDisplay(layout, 's_1', 'ons_gold', 'toman');
    expect(l.sections[0]).toMatchObject({ items: ['ons_gold', 'usd'], display: { ons_gold: 'toman' } });
    expect(setItemDisplay(l, 's_1', 'ons_gold', 'usd').sections[0].display).toBeUndefined();
    expect(removeItem(l, 's_1', 'ons_gold').sections[0].display).toBeUndefined();
    expect(updateSection(l, 's_1', { title: 'y' }).sections[0].display).toEqual({ ons_gold: 'toman' });
    expect(sanitizeHomeLayout({ sections: [{ id: 's_1', items: ['a'], display: { a: 'eur', b: 'toman' } }] }).sections[0].display).toBeUndefined();
    expect(sanitizeHomeLayout(l)).toEqual(l);
  });

  it('follows an old id to the book id', () => {
    const old = { version: 1, sections: [{ id: 's_1', title: '', style: 'compact', items: ['USD'], display: { USD: 'toman' } }] };
    expect(normalizeLayoutIds(old).sections[0]).toMatchObject({ items: ['usd'], display: { usd: 'toman' } });
  });
});

describe('a card shown in tomans', () => {
  it('reads in tomans, with the dollar price under it', () => {
    const asset = resolveHomeAsset('ons_gold', index, 'toman');
    expect(asset).toMatchObject({
      id: 'ons_gold', usdPriced: true, display: 'toman', price: 265_000_000, currency: 'toman', unit: 'تومان',
      seriesId: 'ons_gold', changePercent: 6, dayRange: { low: 259_000_000, high: 266_000_000, open: 260_000_000 },
    });
    expect(asset.note).toContain('دلار');
    render(<HomeAssetCard asset={asset} style="detailed" />);
    expect(screen.getByText((265_000_000).toLocaleString('fa-IR'))).toBeTruthy();
    expect(screen.getByText(/≈ .* دلار/)).toBeTruthy();
    expect(screen.getByText((266_000_000).toLocaleString('fa-IR'))).toBeTruthy();
  });

  it('its chart reads the toman history', async () => {
    render(<HomeAssetCard asset={resolveHomeAsset('ons_gold', index, 'toman')} style="detailed" />);
    fireEvent.click(screen.getByRole('button'));
    await vi.waitFor(() => expect(getSparklines).toHaveBeenCalled());
    expect(getSparklines.mock.calls.at(-1)[0]).toEqual(['ons_gold']);
  });

  it('dollars by default; a toman asset ignores the choice', () => {
    expect(resolveHomeAsset('ons_gold', index)).toMatchObject({ display: 'usd', currency: 'usd', price: 2650, seriesId: 'ons_gold@usd', changePercent: 1.5 });
    expect(resolveHomeAsset('usd', index, 'toman')).toMatchObject({ usdPriced: false, display: null, currency: 'toman', price: 100_000 });
  });
});

describe('the sync keeps a dollar-priced asset\'s toman range and change', () => {
  it('beside its dollar ones', () => {
    const t = Date.parse('2026-10-06T08:00:00Z');
    const item = (priceUsd, price) => ({ items: { ons_gold: { id: 'ons_gold', price, currency: 'usd', priceUsd, params: {} } } });
    let b = withDayRange(item(2650, 265_000_000), null, t);
    expect(b.items.ons_gold.params.toman).toMatchObject({ dayOpen: 265_000_000, dayHigh: 265_000_000, dayLow: 265_000_000 });
    b = withDayRange(item(2600, 270_000_000), b, t + 60_000);
    b = withDayRange(item(2620, 260_000_000), b, t + 120_000);
    expect(b.items.ons_gold.params).toMatchObject({ dayOpen: 2650, dayHigh: 2650, dayLow: 2600, dayCurrency: 'usd' });
    expect(b.items.ons_gold.params.toman).toMatchObject({ dayOpen: 265_000_000, dayHigh: 270_000_000, dayLow: 260_000_000, prevClose: 265_000_000 });
    expect(b.items.ons_gold.params.toman.changePercent).toBeCloseTo(-1.89, 2);
    // A toman-priced item has none
    const usd = withDayRange({ items: { usd: { id: 'usd', price: 100_000, params: {} } } }, null, t);
    expect(usd.items.usd.params.toman).toBeUndefined();
  });
});
