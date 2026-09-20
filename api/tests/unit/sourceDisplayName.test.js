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
});
