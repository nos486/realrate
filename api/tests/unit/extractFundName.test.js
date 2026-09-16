import { describe, it, expect } from 'vitest';
import { extractFundName, resolveItemCategory } from '../../src/domain/specs/registry.js';
import { PRICE_SOURCES_CONFIG } from '../../src/config/sources.config.js';

describe('extractFundName & Fund Category Resolution', () => {
  it('extracts clean fund name from TSETMC fund with company prefix and strategy', () => {
    const item = {
      name: 'صندوق س سهامی کاریزما- اهرمی',
      symbol: 'اهرم',
    };
    expect(extractFundName(item, PRICE_SOURCES_CONFIG)).toBe('کاریزما');
  });

  it('extracts fund name from Persian abbreviation ص.س.', () => {
    const item1 = {
      name: 'ص.س. اهرمی نارنج-س',
      symbol: 'نارنج اهرم',
    };
    expect(extractFundName(item1, PRICE_SOURCES_CONFIG)).toBe('نارنج');

    const item2 = {
      name: 'ص.س.اهرمی موج فیروزه-س',
      symbol: 'موج',
    };
    expect(extractFundName(item2, PRICE_SOURCES_CONFIG)).toBe('موج فیروزه');
  });

  it('extracts fund name from fixed income and market maker funds', () => {
    const item1 = {
      name: 'صندوق س. با درآمد ثابت اعتماد آفرین پارسیان',
      symbol: 'اعتماد',
    };
    expect(extractFundName(item1, PRICE_SOURCES_CONFIG)).toBe('اعتماد آفرین پارسیان');

    const item2 = {
      name: 'صندوق س اختصاصی بازارگردانی امید ایرانیان',
      symbol: 'امید',
    };
    expect(extractFundName(item2, PRICE_SOURCES_CONFIG)).toBe('امید ایرانیان');
  });

  it('extracts fund name from gold backed funds and single name funds', () => {
    const item1 = {
      name: 'صندوق س پشتوانه طلای لوتوس',
      symbol: 'طلا',
    };
    expect(extractFundName(item1, PRICE_SOURCES_CONFIG)).toBe('لوتوس');

    const item2 = {
      name: 'صندوق س کهربا',
      symbol: 'کهربا',
    };
    expect(extractFundName(item2, PRICE_SOURCES_CONFIG)).toBe('کهربا');
  });

  it('uses explicit manager field if present on item or source', () => {
    const itemWithManager = {
      name: 'صندوق اهرمی کاریزما',
      manager: 'کاریزما (Charisma)',
    };
    expect(extractFundName(itemWithManager, PRICE_SOURCES_CONFIG)).toBe('کاریزما');

    const itemWithSource = {
      name: 'صندوق پیشتاز',
      sourceId: 'src_def_emofid',
    };
    expect(extractFundName(itemWithSource, PRICE_SOURCES_CONFIG)).toBe('مفید');
  });

  it('correctly categorizes items with abbreviation ص.س. as bourse_fund', () => {
    const item = {
      id: 'bourse_naranj',
      name: 'ص.س. اهرمی نارنج-س',
    };
    expect(resolveItemCategory(item)).toBe('bourse_fund');
  });
});
