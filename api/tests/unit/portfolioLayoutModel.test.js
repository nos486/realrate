import { describe, it, expect } from 'vitest';
import {
  getAssetKey,
  buildDefaultPortfolioLayout,
  buildCustomCategoryGroups,
  addGroup,
  removeGroup,
  updateGroup,
  moveGroup,
  reorderGroups,
  moveAsset,
  reorderAsset,
  normalizePortfolioLayout,
} from '../../../web/src/features/portfolio/portfolioLayoutModel.js';

describe('portfolioLayoutModel pure operations', () => {
  const mockItems = [
    {
      id: 'h1',
      assetId: 'gold_18k',
      assetName: 'طلای ۱۸ عیار',
      amount: 10,
      itemCost: 50_000_000,
      itemRealVal: 55_000_000,
      itemPnl: 5_000_000,
      hasBuyPrice: true,
      category: 'gold',
    },
    {
      id: 'h2',
      assetId: 'full_coin',
      assetName: 'سکه تمام',
      amount: 2,
      itemCost: 60_000_000,
      itemRealVal: 70_000_000,
      itemPnl: 10_000_000,
      hasBuyPrice: true,
      category: 'coin',
    },
    {
      id: 'h3',
      assetId: 'usd',
      assetName: 'دلار آمریکا',
      amount: 1000,
      itemCost: 90_000_000,
      itemRealVal: 100_000_000,
      itemPnl: 10_000_000,
      hasBuyPrice: true,
      category: 'currency',
    },
    {
      id: 'h4',
      assetId: 'usd', // Second row of USD (e.g. from transactions)
      assetName: 'دلار آمریکا (تراکنش)',
      amount: 500,
      itemCost: 45_000_000,
      itemRealVal: 50_000_000,
      itemPnl: 5_000_000,
      hasBuyPrice: true,
      category: 'currency',
    },
    {
      id: 'h5',
      assetId: 'custom_car',
      assetName: 'خودرو',
      amount: 1,
      itemCost: 800_000_000,
      itemRealVal: 850_000_000,
      itemPnl: 50_000_000,
      hasBuyPrice: true,
      category: 'custom',
    },
  ];

  it('correctly resolves assetKey for book and custom assets', () => {
    expect(getAssetKey({ assetId: 'USD' })).toBe('usd');
    expect(getAssetKey({ assetId: 'src_def_usd' })).toBe('usd');
    expect(getAssetKey({ assetId: 'custom_123' })).toBe('custom_123');
    expect(getAssetKey('gold_18k')).toBe('gold_18k');
  });

  it('buildDefaultPortfolioLayout creates groups from active assets', () => {
    const layout = buildDefaultPortfolioLayout(mockItems);
    expect(layout.version).toBe(1);
    expect(layout.groups.length).toBeGreaterThan(0);

    const goldGroup = layout.groups.find((g) => g.items.includes('gold_18k'));
    expect(goldGroup).toBeDefined();
    expect(goldGroup.title).toBe('طلا');

    const fxGroup = layout.groups.find((g) => g.items.includes('usd'));
    expect(fxGroup).toBeDefined();
    expect(fxGroup.title).toBe('ارزهای خارجی');

    const customGroup = layout.groups.find((g) => g.items.includes('custom_car'));
    expect(customGroup).toBeDefined();
  });

  it('builds category groups from layout and maps items correctly', () => {
    const layout = {
      version: 1,
      groups: [
        { id: 'g_precious', title: 'فلزات گرانبها', icon: 'gold', items: ['gold_18k', 'full_coin'] },
        { id: 'g_fx', title: 'ارز خارجی', icon: 'currency', items: ['usd'] },
      ],
    };

    const groups = buildCustomCategoryGroups(mockItems, layout);
    expect(groups).toHaveLength(3); // Precious, FX, and "سایر" for custom_car

    const preciousGroup = groups.find((g) => g.id === 'g_precious');
    expect(preciousGroup.items).toHaveLength(2);
    expect(preciousGroup.totalRealValue).toBe(55_000_000 + 70_000_000);
    expect(preciousGroup.totalPnl).toBe(5_000_000 + 10_000_000);

    // Both rows of USD must belong to g_fx (asset-based grouping)
    const fxGroup = groups.find((g) => g.id === 'g_fx');
    expect(fxGroup.items).toHaveLength(2);
    expect(fxGroup.totalRealValue).toBe(100_000_000 + 50_000_000);
  });

  it('sends uncategorized items to "سایر"', () => {
    const layout = {
      version: 1,
      groups: [
        { id: 'g_gold_only', title: 'فقط طلا', icon: 'gold', items: ['gold_18k'] },
      ],
    };

    const groups = buildCustomCategoryGroups(mockItems, layout);
    const otherGroup = groups.find((g) => g.isOther || g.id === 'g_other');
    expect(otherGroup).toBeDefined();
    expect(otherGroup.title).toBe('سایر');

    // All items except gold_18k should be in "سایر"
    const otherAssetIds = otherGroup.items.map((i) => i.assetId);
    expect(otherAssetIds).toContain('full_coin');
    expect(otherAssetIds).toContain('usd');
    expect(otherAssetIds).toContain('custom_car');
    expect(otherAssetIds).not.toContain('gold_18k');
  });

  it('counts each asset exactly once across all groups', () => {
    // Malformed layout where USD is accidentally declared in both groups
    const layout = {
      version: 1,
      groups: [
        { id: 'g_1', title: 'گروه اول', icon: 'gold', items: ['usd', 'gold_18k'] },
        { id: 'g_2', title: 'گروه دوم', icon: 'currency', items: ['usd', 'full_coin'] },
      ],
    };

    const groups = buildCustomCategoryGroups(mockItems, layout);
    const allGroupedItemIds = groups.flatMap((g) => g.items.map((it) => it.id));
    expect(allGroupedItemIds).toHaveLength(mockItems.length);
    expect(new Set(allGroupedItemIds).size).toBe(mockItems.length);

    // Sum of real values across all groups equals total real value of all items
    const totalGroupedVal = groups.reduce((acc, g) => acc + g.totalRealValue, 0);
    const expectedTotalVal = mockItems.reduce((acc, it) => acc + it.itemRealVal, 0);
    expect(totalGroupedVal).toBe(expectedTotalVal);
  });

  it('deleting a category releases its items to "سایر"', () => {
    let layout = {
      version: 1,
      groups: [
        { id: 'g_precious', title: 'فلزات', icon: 'gold', items: ['gold_18k', 'full_coin'] },
        { id: 'g_fx', title: 'ارز', icon: 'currency', items: ['usd'] },
      ],
    };

    // Remove the precious metals category
    layout = removeGroup(layout, 'g_precious');
    expect(layout.groups.map((g) => g.id)).toEqual(['g_fx']);

    const groups = buildCustomCategoryGroups(mockItems, layout);
    const otherGroup = groups.find((g) => g.isOther || g.id === 'g_other');
    expect(otherGroup).toBeDefined();

    // gold_18k and full_coin are now in "سایر"
    const otherAssetIds = otherGroup.items.map((i) => i.assetId);
    expect(otherAssetIds).toContain('gold_18k');
    expect(otherAssetIds).toContain('full_coin');
  });

  it('moving an asset between categories updates the layout', () => {
    let layout = {
      version: 1,
      groups: [
        { id: 'g_gold', title: 'طلا', icon: 'gold', items: ['gold_18k'] },
        { id: 'g_coin', title: 'سکه', icon: 'coin', items: ['full_coin'] },
      ],
    };

    // Move gold_18k from g_gold to g_coin
    layout = moveAsset(layout, 'gold_18k', 'g_coin');
    expect(layout.groups.find((g) => g.id === 'g_gold').items).toEqual([]);
    expect(layout.groups.find((g) => g.id === 'g_coin').items).toEqual(['full_coin', 'gold_18k']);

    // Move gold_18k to 'other'
    layout = moveAsset(layout, 'gold_18k', 'other');
    expect(layout.groups.find((g) => g.id === 'g_coin').items).toEqual(['full_coin']);
  });

  it('reorders categories and assets within categories', () => {
    let layout = {
      version: 1,
      groups: [
        { id: 'g_1', title: 'اول', icon: 'gold', items: ['gold_18k', 'full_coin'] },
        { id: 'g_2', title: 'دوم', icon: 'currency', items: ['usd'] },
      ],
    };

    layout = reorderGroups(layout, 'g_1', 'g_2');
    expect(layout.groups.map((g) => g.id)).toEqual(['g_2', 'g_1']);

    layout = reorderAsset(layout, 'g_1', 'full_coin', 'gold_18k');
    expect(layout.groups.find((g) => g.id === 'g_1').items).toEqual(['full_coin', 'gold_18k']);
  });

  it('handles corrupted, legacy or empty layout gracefully', () => {
    expect(normalizePortfolioLayout(null)).toBeNull();
    expect(normalizePortfolioLayout({ corrupted: true })).toBeNull();

    // When layout is null or empty, buildCustomCategoryGroups falls back to standard categories
    const standardGroups = buildCustomCategoryGroups(mockItems, null);
    expect(standardGroups.length).toBeGreaterThan(0);
    const categoriesFound = standardGroups.map((g) => g.key);
    expect(categoriesFound).toContain('gold');
    expect(categoriesFound).toContain('coin');
    expect(categoriesFound).toContain('currency');
  });
});
