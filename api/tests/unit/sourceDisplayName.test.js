import { describe, it, test, expect } from 'vitest';
import { getSourceDisplayName } from '../../src/config/sources.config.js';
import {
  resolveAssetDisplayName,
  resolveAssetDisplayWithSource,
  getSourceShortBrand,
  resolveAssetUnit,
  getSourceConfig,
} from '../../src/config/sourceRegistry.js';

describe('SourceRegistry – display name & unit resolution', () => {
  test('canonical gold returns Persian name', () => {
    expect(resolveAssetDisplayName('gold_18k')).toBe('طلای ۱۸ عیار');
  });

  test('catalog item charisma_plans__gold uses knownItems', () => {
    expect(resolveAssetDisplayName('charisma_plans__gold')).toBe('طرح طلا');
    expect(resolveAssetUnit('charisma_plans__gold')).toBe('واحد');
  });

  test('bourse symbol fallback', () => {
    expect(resolveAssetDisplayName('bourse_fa')).toBe('سهام fa');
    expect(resolveAssetUnit('bourse_fa')).toBe('برگ سهم');
  });

  test('custom asset keeps raw name if provided', () => {
    const raw = { name: 'سرمایهگذاری شخصی', unit: 'واحد' };
    expect(resolveAssetDisplayName('custom_123', raw)).toBe('سرمایهگذاری شخصی');
    expect(resolveAssetUnit('custom_123', raw)).toBe('واحد');
  });

  test('resolves canonical USDT unit to تتر', () => {
    expect(resolveAssetUnit('USDT')).toBe('تتر');
    expect(resolveAssetUnit('src_brs_usdt')).toBe('تتر');
  });
});

describe('Dynamic Source Display Name Resolution Tests', () => {
  it('correctly maps Charisma funds to Charisma source without hardcoded if/else', () => {
    // 1. By ticker in knownSymbols
    expect(getSourceDisplayName({ symbol: 'اهرم', name: 'صندوق س سهامی کاریزما- اهرمی' }))
      .toBe('صندوق‌های سرمایه‌گذاری کاریزما (Charisma)');

    // 2. By brand name in title
    expect(getSourceDisplayName({ symbol: 'نقران', name: 'صندوق س سرمایه گذاری نقره کاریزما' }))
      .toBe('صندوق‌های سرمایه‌گذاری کاریزما (Charisma)');

    // 3. By known symbol alone
    expect(getSourceDisplayName({ symbol: 'کهربا', name: 'صندوق س پشتوانه طلا کهربا-س' }))
      .toBe('صندوق‌های سرمایه‌گذاری کاریزما (Charisma)');
  });

  it('correctly maps Emofid funds to Emofid source', () => {
    expect(getSourceDisplayName({ symbol: 'عیار', name: 'صندوق س طلا عیار مفید-س' }))
      .toBe('صندوق‌های سرمایه‌گذاری مفید (Emofid)');

    expect(getSourceDisplayName({ symbol: 'پیشتاز', name: 'صندوق پیشتاز' }))
      .toBe('صندوق‌های سرمایه‌گذاری مفید (Emofid)');
  });

  it('falls back to Bourse source for non-specific stocks and funds', () => {
    expect(getSourceDisplayName({ symbol: 'فولاد', name: 'فولاد مبارکه اصفهان', priceType: 'bourse' }))
      .toBe('بورس اوراق بهادار تهران (TSETMC / BRS API)');

    expect(getSourceDisplayName({ symbol: 'نارنج اهرم', name: 'ص.س. اهرمی نارنج-س', priceType: 'bourse' }))
      .toBe('بورس اوراق بهادار تهران (TSETMC / BRS API)');
  });

  it('resolves direct string keys (id or priceType)', () => {
    expect(getSourceDisplayName('src_def_charisma'))
      .toBe('صندوق‌های سرمایه‌گذاری کاریزما (Charisma)');

    expect(getSourceDisplayName('src_def_emofid'))
      .toBe('صندوق‌های سرمایه‌گذاری مفید (Emofid)');

    expect(getSourceDisplayName('src_def_forex'))
      .toBe('نرخ‌های جهانی فارکس (Open ER-API)');

    expect(getSourceDisplayName('bourse'))
      .toBe('بورس اوراق بهادار تهران (TSETMC / BRS API)');
  });

  describe('resolveAssetDisplayWithSource – [Item Name] ([Source Name]) Formatting', () => {
    it('appends source brand in parentheses when not present in item name', () => {
      expect(resolveAssetDisplayWithSource('bourse_foolad', { name: 'فولاد مبارکه', sourceId: 'src_def_bourse' }))
        .toBe('فولاد مبارکه (بورس)');

      expect(resolveAssetDisplayWithSource('ahrom', { name: 'اهرم', sourceId: 'src_def_charisma' }))
        .toBe('اهرم (کاریزما)');

      expect(resolveAssetDisplayWithSource('pishtaz', { name: 'پیشتاز', sourceId: 'src_def_emofid' }))
        .toBe('پیشتاز (مفید)');

      expect(resolveAssetDisplayWithSource('charisma_plans__silver', { name: 'طرح نقره', sourceId: 'src_def_charisma_plans' }))
        .toBe('طرح نقره (کاریزما)');
    });

    it('avoids duplicating source brand if already present in item name', () => {
      expect(resolveAssetDisplayWithSource('kahroba', { name: 'صندوق طلا کهربا کاریزما', sourceId: 'src_def_charisma' }))
        .toBe('صندوق طلا کهربا کاریزما');

      expect(resolveAssetDisplayWithSource('ayar', { name: 'صندوق طلا عیار مفید', sourceId: 'src_def_emofid' }))
        .toBe('صندوق طلا عیار مفید');
    });

    it('returns brand correctly from getSourceShortBrand', () => {
      expect(getSourceShortBrand('src_def_bourse')).toBe('بورس');
      expect(getSourceShortBrand('src_def_emofid')).toBe('مفید');
      expect(getSourceShortBrand('src_def_charisma')).toBe('کاریزما');
      expect(getSourceShortBrand('src_def_charisma_plans')).toBe('کاریزما');
      expect(getSourceShortBrand('src_def_forex')).toBe('فارکس');
    });
  });
});

