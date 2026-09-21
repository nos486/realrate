import { describe, it, test, expect } from 'vitest';
import {
  parseItemId,
  getItemDisplayName,
  getItemBaseName,
  getItemUnit,
  getItemCategory,
  getItemBadge,
  getCategoryIconName,
  getCategoryColor,
  getSourceBrand,
  getSourceConfig,
} from '../../src/domain/displayEngine.js';

describe('Phase 2 — Central Display Engine (موتور مرکزی نمایش)', () => {
  describe('1. parseItemId(id) Contract', () => {
    it('parses universal standard ${sourceId}__${itemKey} format', () => {
      expect(parseItemId('src_def_bourse__فولاد')).toEqual({
        sourceId: 'src_def_bourse',
        itemKey: 'فولاد',
      });

      expect(parseItemId('src_def_charisma__اهرم')).toEqual({
        sourceId: 'src_def_charisma',
        itemKey: 'اهرم',
      });

      expect(parseItemId('src_def_charisma_plans__gold')).toEqual({
        sourceId: 'src_def_charisma_plans',
        itemKey: 'gold',
      });

      expect(parseItemId('src_def_emofid__عیار')).toEqual({
        sourceId: 'src_def_emofid',
        itemKey: 'عیار',
      });
    });

    it('handles legacy bourse_ prefix for backward compatibility', () => {
      expect(parseItemId('bourse_فولاد')).toEqual({
        sourceId: 'src_def_bourse',
        itemKey: 'فولاد',
      });
    });

    it('handles single-rate and known source IDs', () => {
      expect(parseItemId('src_def_usd')).toEqual({
        sourceId: 'src_def_usd',
        itemKey: 'usd',
      });

      expect(parseItemId('src_brs_usdt')).toEqual({
        sourceId: 'src_brs_usdt',
        itemKey: 'USDT',
      });
    });

    it('handles falsy or custom inputs cleanly', () => {
      expect(parseItemId('')).toEqual({ sourceId: '', itemKey: '' });
      expect(parseItemId(null)).toEqual({ sourceId: '', itemKey: '' });
      expect(parseItemId('custom_house')).toEqual({
        sourceId: 'custom_house',
        itemKey: 'custom_house',
      });
    });
  });

  describe('2. getItemDisplayName(item) Contract', () => {
    it('formats display name as "{item.name} ({sourceName})"', () => {
      expect(getItemDisplayName({ id: 'src_def_bourse__فولاد', name: 'فولاد مبارکه' }))
        .toBe('فولاد مبارکه (بورس)');

      expect(getItemDisplayName({ id: 'src_def_charisma__اهرم', name: 'اهرم' }))
        .toBe('اهرم (کاریزما)');

      expect(getItemDisplayName({ id: 'src_def_emofid__پیشتاز', name: 'پیشتاز' }))
        .toBe('پیشتاز (مفید)');
    });

    it('resolves knownItems automatically when raw name is omitted', () => {
      expect(getItemDisplayName('src_def_charisma_plans__gold'))
        .toBe('طرح طلا (کاریزما)');

      expect(getItemDisplayName('src_def_charisma_plans__silver'))
        .toBe('طرح نقره (کاریزما)');
    });

    it('avoids duplicating source brand if already present in item name', () => {
      expect(getItemDisplayName({ id: 'src_def_charisma__kahroba', name: 'صندوق طلا کهربا کاریزما' }))
        .toBe('صندوق طلا کهربا کاریزما');

      expect(getItemDisplayName({ id: 'src_def_emofid__ayar', name: 'صندوق طلا عیار مفید' }))
        .toBe('صندوق طلا عیار مفید');
    });

    it('does not duplicate source name for single-rate feeds where item name equals source name', () => {
      expect(getItemDisplayName({ id: 'src_def_usd', name: 'دلار تهران سبزه میدان' }))
        .toBe('دلار تهران سبزه میدان');

      expect(getItemDisplayName({ id: 'src_def_gold_18k', name: 'طلا ۱۸ عیار (زرما)' }))
        .toBe('طلا ۱۸ عیار (زرما)');
    });
  });

  describe('3. getItemUnit(item) Contract', () => {
    it('resolves unit strictly from source config', () => {
      expect(getItemUnit('src_def_bourse__فولاد')).toBe('برگ سهم');
      expect(getItemUnit('src_def_charisma__اهرم')).toBe('واحد');
      expect(getItemUnit('src_def_emofid__عیار')).toBe('واحد');
      expect(getItemUnit('src_def_gold_18k')).toBe('گرم');
      expect(getItemUnit('src_def_full_coin')).toBe('عدد');
      expect(getItemUnit('src_def_usd')).toBe('دلار');
      expect(getItemUnit('src_brs_usdt')).toBe('تتر');
    });

    it('preserves raw unit for custom manual holdings', () => {
      expect(getItemUnit({ id: 'custom_land', unit: 'متر مربع' })).toBe('متر مربع');
    });
  });

  describe('4. getItemCategory(item) Contract', () => {
    it('resolves category strictly from source config', () => {
      expect(getItemCategory('src_def_bourse__فولاد')).toBe('bourse');
      expect(getItemCategory('src_def_charisma__اهرم')).toBe('bourse_fund');
      expect(getItemCategory('src_def_emofid__عیار')).toBe('bourse_fund');
      expect(getItemCategory('src_def_gold_18k')).toBe('gold');
      expect(getItemCategory('src_def_full_coin')).toBe('coin');
      expect(getItemCategory('src_def_usd')).toBe('currency');
      expect(getItemCategory('src_def_ons_silver')).toBe('silver');
      expect(getItemCategory('BTC')).toBe('crypto');
      expect(getItemCategory('custom_car')).toBe('custom');
    });
  });

  describe('5. getCategoryIconName(categoryKey) Contract', () => {
    it('retrieves Lucide icon name directly from categories.config.js', () => {
      expect(getCategoryIconName('gold')).toBe('Award');
      expect(getCategoryIconName('coin')).toBe('Coins');
      expect(getCategoryIconName('silver')).toBe('Disc');
      expect(getCategoryIconName('currency')).toBe('Banknote');
      expect(getCategoryIconName('crypto')).toBe('Zap');
      expect(getCategoryIconName('bourse')).toBe('TrendingUp');
      expect(getCategoryIconName('bourse_fund')).toBe('Layers');
      expect(getCategoryIconName('custom')).toBe('Sparkles');
      expect(getCategoryIconName('unknown_category')).toBe('Sparkles');
    });
  });

  describe('6. getSourceBrand & getSourceConfig', () => {
    it('resolves clean brand from source definitions with zero hardcoded conditionals', () => {
      expect(getSourceBrand('src_def_bourse')).toBe('بورس');
      expect(getSourceBrand('src_def_emofid')).toBe('مفید');
      expect(getSourceBrand('src_def_charisma')).toBe('کاریزما');
      expect(getSourceBrand('src_def_charisma_plans')).toBe('کاریزما');
      expect(getSourceBrand('src_def_usd')).toBe('سبزه میدان');
      expect(getSourceBrand('src_def_gold_18k')).toBe('زرما');
      expect(getSourceBrand('src_def_forex')).toBe('فارکس');
    });
  });

  describe('7. Comprehensive All-Category Coverage (name / unit / category / badge / color / icon)', () => {
    const ALL_SOURCE_TYPES = [
      { id: 'src_def_gold_18k', key: 'gold_18k', expectedCat: 'gold', expectedBadge: 'طلا', expectedUnit: 'گرم', expectedColor: 'amber', expectedIcon: 'Award' },
      { id: 'src_def_full_coin', key: 'full_coin', expectedCat: 'coin', expectedBadge: 'سکه', expectedUnit: 'عدد', expectedColor: 'emerald', expectedIcon: 'Coins' },
      { id: 'src_def_ons_silver', key: 'ons_silver', expectedCat: 'silver', expectedBadge: 'نقره', expectedUnit: 'اونس', expectedColor: 'slate', expectedIcon: 'Disc' },
      { id: 'src_def_usd', key: 'usd', expectedCat: 'currency', expectedBadge: 'ارز', expectedUnit: 'دلار', expectedColor: 'indigo', expectedIcon: 'Banknote' },
      { id: 'BTC', key: 'BTC', expectedCat: 'crypto', expectedBadge: 'رمزارز', expectedUnit: 'عدد', expectedColor: 'purple', expectedIcon: 'Zap' },
      { id: 'src_def_bourse__فولاد', key: 'فولاد', expectedCat: 'bourse', expectedBadge: 'سهام بورس', expectedUnit: 'برگ سهم', expectedColor: 'sky', expectedIcon: 'TrendingUp' },
      { id: 'src_def_charisma__اهرم', key: 'اهرم', expectedCat: 'bourse_fund', expectedBadge: 'صندوق', expectedUnit: 'واحد', expectedColor: 'cyan', expectedIcon: 'Layers' },
      { id: 'custom_property', key: 'custom_property', expectedCat: 'custom', expectedBadge: 'سفارشی', expectedUnit: 'متر', expectedColor: 'blue', expectedIcon: 'Sparkles', rawUnit: 'متر' },
    ];

    for (const item of ALL_SOURCE_TYPES) {
      it(`correctly resolves metadata for ${item.expectedCat} source: ${item.id}`, () => {
        const itemObj = item.rawUnit ? { id: item.id, unit: item.rawUnit } : item.id;

        // 1. Category
        const cat = getItemCategory(itemObj);
        expect(cat).toBe(item.expectedCat);

        // 2. Badge
        const badge = getItemBadge(itemObj);
        expect(badge).toBe(item.expectedBadge);

        // 3. Unit
        const unit = getItemUnit(itemObj);
        expect(unit).toBe(item.expectedUnit);

        // 4. Color
        const color = getCategoryColor(cat);
        expect(color).toBe(item.expectedColor);

        // 5. Icon
        const icon = getCategoryIconName(cat);
        expect(icon).toBe(item.expectedIcon);

        // 6. Display Name (non-empty Persian string)
        const displayName = getItemDisplayName(itemObj);
        expect(typeof displayName).toBe('string');
        expect(displayName.length).toBeGreaterThan(0);
      });
    }
  });
});
