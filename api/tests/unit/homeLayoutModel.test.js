import { describe, it, expect } from 'vitest';
import {
  buildDefaultLayout,
  HOME_PRESETS,
  addSection,
  removeSection,
  moveSection,
  updateSection,
  addItem,
  removeItem,
  moveItem,
  reorderSections,
  reorderItems,
} from '../../../web/src/features/home/homeLayoutModel.js';
import { buildAssetIndex, resolveHomeAsset } from '../../../web/src/features/home/homeAssets.js';
import { bookToAssets } from '../../../web/src/features/market/priceBookAssets.js';
import { normalizeLayoutIds } from '../../../web/src/features/home/homeLayoutModel.js';

const ctx = {
  analysis: [
    { id: 'gold_18k', name: 'طلای ۱۸', market: 5_000_000 },
    { id: 'half_coin', name: 'نیم سکه' },
    { id: 'full_coin', name: 'سکه امامی', market: 60_000_000 },
    { id: 'gerami_coin', name: 'گرمی', showOnHomePage: false },
  ],
  currencies: [
    { code: 'EUR', name: 'یورو', toman_price: 110_000, flag: '🇪🇺' },
    { code: 'KWD', name: 'دینار کویت', toman_price: 300_000 },
    { code: 'USD', name: 'دلار', toman_price: 100_000, flag: '🇺🇸' },
    { code: 'RUB', name: 'روبل', showOnHomePage: false },
  ],
  assets: [
    { id: 'gold_18k', name: 'طلای ۱۸', category: 'gold', price: 5_000_000 },
    { id: 'USD', code: 'USD', name: 'دلار', category: 'currency', price: 100_000 },
    { id: 'BTC', code: 'BTC', name: 'بیت‌کوین', category: 'crypto', price: 9_000_000_000, changePercent: -2.5 },
    { id: 'tsetmc__foolad', symbol: 'فولاد', name: 'فولاد مبارکه', category: 'bourse', price: 5_400, sourceName: 'بورس' },
    { id: 'fund__ayar', name: 'صندوق طلای عیار', category: 'bourse_fund', price: 30_000 },
  ],
};

describe('home layout model', () => {
  it('default layout reproduces the previous home page (and respects admin-hidden cards)', () => {
    const layout = buildDefaultLayout(ctx);
    expect(layout.sections.map((s) => [s.style, s.items])).toEqual([
      ['detailed', ['gold_18k', 'full_coin']],
      ['compact', ['usd', 'eur', 'kwd']],
    ]);
  });

  it('every preset builds a valid layout from the live catalog', () => {
    for (const preset of HOME_PRESETS) {
      const layout = preset.build(ctx);
      expect(layout.sections.length).toBeGreaterThan(0);
      for (const s of layout.sections) expect(['detailed', 'compact', 'trend']).toContain(s.style);
    }
    const bourse = HOME_PRESETS.find((p) => p.key === 'bourse').build(ctx);
    expect(bourse.sections.find((s) => s.id === 's_funds').items).toEqual(['fund__ayar']);
  });

  it('edits sections and items without mutating the input', () => {
    const start = buildDefaultLayout(ctx);
    const snapshot = JSON.stringify(start);

    let l = addSection(start, { title: 'بورس من' });
    const added = l.sections[2];
    expect(added).toMatchObject({ title: 'بورس من', style: 'compact', items: [] });

    l = addItem(l, added.id, 'tsetmc__foolad');
    l = addItem(l, added.id, 'tsetmc__foolad');
    l = addItem(l, added.id, 'gold_18k');
    expect(l.sections[2].items).toEqual(['tsetmc__foolad', 'gold_18k']);

    l = moveItem(l, added.id, 'gold_18k', -1);
    expect(l.sections[2].items).toEqual(['gold_18k', 'tsetmc__foolad']);
    l = moveItem(l, added.id, 'gold_18k', -1);
    expect(l.sections[2].items).toEqual(['gold_18k', 'tsetmc__foolad']);

    l = updateSection(l, added.id, { style: 'detailed', title: 'نمادها', items: ['ignored'] });
    expect(l.sections[2]).toMatchObject({ style: 'detailed', title: 'نمادها', items: ['gold_18k', 'tsetmc__foolad'] });

    l = moveSection(l, added.id, -1);
    expect(l.sections.map((s) => s.id)).toEqual(['s_gold', added.id, 's_fx']);

    l = removeItem(l, added.id, 'gold_18k');
    l = removeSection(l, 's_gold');
    expect(l.sections.map((s) => s.id)).toEqual([added.id, 's_fx']);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});

describe('drag & drop reordering', () => {
  const base = {
    version: 1,
    sections: [
      { id: 'a', title: 'A', style: 'compact', items: ['USD', 'EUR', 'AED', 'TRY'] },
      { id: 'b', title: 'B', style: 'detailed', items: [] },
      { id: 'c', title: 'C', style: 'compact', items: [] },
    ],
  };

  it('moves an item to the position of the one it is dropped on (ids as price book ids)', () => {
    const l = normalizeLayoutIds(base);
    expect(l.sections[0].items).toEqual(['usd', 'eur', 'aed', 'try']);
    expect(reorderItems(l, 'a', 'try', 'eur').sections[0].items).toEqual(['usd', 'try', 'eur', 'aed']);
    expect(reorderItems(l, 'a', 'usd', 'aed').sections[0].items).toEqual(['eur', 'aed', 'usd', 'try']);
    expect(reorderItems(l, 'a', 'usd', 'missing').sections[0].items).toEqual(['usd', 'eur', 'aed', 'try']);
  });

  it('turns an old stored layout\'s ids into price book ids', () => {
    const old = { version: 1, sections: [{ id: 'x', title: '', style: 'compact', items: ['USD', 'src_def_gold_18k', 'bourse_فولاد', 'XAU'] }] };
    expect(normalizeLayoutIds(old).sections[0].items).toEqual(['usd', 'gold_18k', 'src_def_bourse__فولاد', 'ons_gold']);
    expect(normalizeLayoutIds(null)).toBeNull();
  });

  it('moves a section to the position of the one it is dropped on', () => {
    expect(reorderSections(base, 'c', 'a').sections.map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(reorderSections(base, 'a', 'b').sections.map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(reorderSections(base, 'a', 'a').sections.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('resolving any asset for a home card', () => {
  const book = {
    items: {
      gold_18k: { id: 'gold_18k', price: 5_000_000, name: 'طلای ۱۸', category: 'gold', unit: 'گرم', params: { intrinsic: 4_000_000 } },
      usd: { id: 'usd', price: 100_000, name: 'دلار', category: 'currency', unit: 'دلار', params: {} },
      btc: { id: 'btc', price: 9_000_000_000, name: 'بیت‌کوین', category: 'crypto', unit: 'عدد', params: { changePercent: -2.5 } },
      'src_def_bourse__فولاد': { id: 'src_def_bourse__فولاد', price: 5_400, name: 'فولاد مبارکه', category: 'bourse', unit: 'سهم', params: { symbol: 'فولاد', sourceName: 'بورس' } },
    },
  };
  const index = buildAssetIndex({ itemMap: bookToAssets(book).itemMap, analysis: ctx.analysis });

  it('shows the price book\'s price in tomans, with the calculator\'s analysis for gold', () => {
    expect(resolveHomeAsset('gold_18k', index)).toMatchObject({ price: 5_000_000, unit: 'تومان', perUnit: 'گرم' });
    expect(resolveHomeAsset('gold_18k', index).analysis).toMatchObject({ market: 5_000_000 });
    expect(resolveHomeAsset('USD', index)).toMatchObject({ id: 'usd', found: true, flag: '🇺🇸', price: 100_000, category: 'currency' });
    expect(resolveHomeAsset('btc', index)).toMatchObject({ found: true, price: 9_000_000_000, changePercent: -2.5, category: 'crypto' });
    expect(resolveHomeAsset('bourse_فولاد', index)).toMatchObject({ found: true, sourceName: 'بورس', category: 'bourse' });
    expect(resolveHomeAsset('nope', index)).toEqual({ id: 'nope', found: false });
  });
});
