import { describe, it, expect } from 'vitest';
import { getSourceDisplayName } from '../../src/config/sources.config.js';

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

  it('standardizes gold_18k and bourse_عیار metadata from sources.config.js as single source of truth', async () => {
    const { getSourceCategoryConfig, getSourceItemDisplayName } = await import('../../src/config/sources.config.js');
    const {
      getCanonicalAssetName,
      getCanonicalAssetUnit,
      getCanonicalAssetCategory,
      getCanonicalAssetBadge,
      resolveItemCategory,
    } = await import('../../src/domain/specs/registry.js');

    // ── 1. Testing gold_18k ──
    const goldConfig = getSourceCategoryConfig('gold_18k');
    expect(goldConfig).toBeDefined();
    expect(goldConfig.assetName).toBe('طلا ۱۸ عیار');
    expect(goldConfig.category).toBe('gold');
    expect(goldConfig.unit).toBe('گرم');
    expect(goldConfig.badge).toBe('طلا');

    expect(getCanonicalAssetName('gold_18k')).toBe('طلا ۱۸ عیار');
    expect(getCanonicalAssetUnit('gold_18k')).toBe('گرم');
    expect(getCanonicalAssetCategory('gold_18k')).toBe('gold');
    expect(getCanonicalAssetBadge('gold_18k')).toBe('طلا');
    expect(resolveItemCategory('gold_18k')).toBe('gold');

    // ── 2. Testing bourse_عیار (Gold ETF) ──
    const ayyarConfig = getSourceCategoryConfig('bourse_عیار');
    expect(ayyarConfig).toBeDefined();
    expect(ayyarConfig.id).toBe('src_def_emofid');
    expect(ayyarConfig.category).toBe('bourse_fund');
    expect(ayyarConfig.isFund).toBe(true);
    expect(ayyarConfig.unit).toBe('واحد');
    expect(ayyarConfig.badge).toBe('صندوق');

    expect(getSourceItemDisplayName('bourse_عیار')).toBe('صندوق طلای عیار مفید');
    expect(getCanonicalAssetName('bourse_عیار')).toBe('صندوق طلای عیار مفید');
    expect(getCanonicalAssetUnit('bourse_عیار')).toBe('واحد');
    expect(getCanonicalAssetCategory('bourse_عیار')).toBe('bourse_fund');
    expect(getCanonicalAssetBadge('bourse_عیار')).toBe('صندوق');
    expect(resolveItemCategory('bourse_عیار')).toBe('bourse_fund');

    // ── 3. Testing standard stock (bourse_فولاد) ──
    const fouladConfig = getSourceCategoryConfig('bourse_فولاد');
    expect(fouladConfig).toBeDefined();
    expect(fouladConfig.id).toBe('src_def_bourse');
    expect(fouladConfig.category).toBe('bourse');
    expect(resolveItemCategory('bourse_فولاد')).toBe('bourse');
    expect(getCanonicalAssetUnit('bourse_فولاد')).toBe('برگ سهم');
  });
});

