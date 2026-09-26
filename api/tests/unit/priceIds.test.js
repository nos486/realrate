/**
 * priceIds.test.js — Every id the app has ever stored resolves to the price book's id
 */

import { describe, it, expect } from 'vitest';
import { toPriceId, migrateRecordPriceIds, isCustomAssetId } from '../../src/domain/priceIds.js';

const book = {
  usd: 1, usdt: 1, eur: 1, try: 1, gold_18k: 1, full_coin: 1, gerami_coin: 1, ons_gold: 1, toman: 1,
  'src_def_bourse__فولاد': 1,
  'src_def_emofid__عیار': 1,
  src_def_charisma_plans__gold: 1,
  src_usd_2__usd: 1,
};

describe('toPriceId', () => {
  it.each([
    ['usd', 'usd'],
    ['USD', 'usd'],
    ['USDT', 'usdt'],
    ['src_def_usd', 'usd'],
    ['usd_toman', 'usd'],
    ['derived_gold_18k', 'gold_18k'],
    ['forex_eur', 'eur'],
    ['src_def_forex::TRY', 'try'],
    ['full_new', 'full_coin'],
    ['bank_gram', 'gerami_coin'],
    ['XAU', 'ons_gold'],
    ['gold_ounce', 'ons_gold'],
    ['cash', 'toman'],
    ['bourse_فولاد', 'src_def_bourse__فولاد'],
    ['emofid__عیار', 'src_def_emofid__عیار'],
    ['charisma_plans__gold', 'src_def_charisma_plans__gold'],
    ['src_def_charisma_plans__gold', 'src_def_charisma_plans__gold'],
    ['src_usd_2__usd', 'src_usd_2__usd'],
  ])('%s → %s', (stored, expected) => {
    expect(toPriceId(stored, book)).toBe(expected);
  });

  it('keeps personal assets and unknown ids as they are (lower-cased)', () => {
    expect(toPriceId('custom_123', book)).toBe('custom_123');
    expect(toPriceId('Something_Else', book)).toBe('something_else');
    expect(isCustomAssetId('custom')).toBe(true);
  });

  it('without the book, still undoes the old prefixes and names', () => {
    expect(toPriceId('src_def_usd')).toBe('usd');
    expect(toPriceId('EUR')).toBe('eur');
    expect(toPriceId('bourse_فولاد')).toBe('src_def_bourse__فولاد');
    expect(toPriceId('src_def_bourse__فولاد')).toBe('src_def_bourse__فولاد');
  });

  it('accepts the book\'s ids as a Set or a list too', () => {
    expect(toPriceId('src_def_usd', new Set(['usd']))).toBe('usd');
    expect(toPriceId('emofid__x', ['a', 'src_def_emofid__x'])).toBe('src_def_emofid__x');
  });
});

describe('migrateRecordPriceIds', () => {
  it('rewrites asset and reference ids to book ids that exist', () => {
    const { changed, record } = migrateRecordPriceIds(
      { id: 'h1', assetId: 'bourse_فولاد', referenceAssetId: 'USD', amount: 3 },
      book,
    );
    expect(changed).toBe(true);
    expect(record).toEqual({ id: 'h1', assetId: 'src_def_bourse__فولاد', referenceAssetId: 'usd', amount: 3 });
  });

  it('leaves records that are already standard, personal, or not in the book', () => {
    const standard = { assetId: 'gold_18k' };
    expect(migrateRecordPriceIds(standard, book)).toEqual({ changed: false, record: standard });
    expect(migrateRecordPriceIds({ assetId: 'custom_1' }, book).changed).toBe(false);
    expect(migrateRecordPriceIds({ assetId: 'src_def_nothing' }, book).changed).toBe(false);
    expect(migrateRecordPriceIds({ assetId: 'USD' }, null).changed).toBe(false);
  });
});
