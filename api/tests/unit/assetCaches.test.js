/**
 * assetCaches.test.js — an item's asset is built once per item object, and search ranks the same
 * with its per-asset index as it did normalizing on every call
 */
import { describe, it, expect } from 'vitest';
import { bookToAssets } from '../../../web/src/features/market/priceBookAssets.js';
import { searchUnifiedAssets } from '../../../web/src/utils/pricingEngine.js';

const item = (id, name, extra = {}) => ({ id, name, category: 'bourse', price: 100, params: { symbol: id.toUpperCase() }, ...extra });

describe('book assets', () => {
  it('reuses the asset of an item object that did not change between refreshes', () => {
    const kept = item('kept', 'نماد ثابت');
    const first = bookToAssets({ items: { kept, fresh: item('fresh', 'تازه') } });
    const second = bookToAssets({ items: { kept, fresh: item('fresh', 'تازه') } });
    expect(second.itemMap.kept).toBe(first.itemMap.kept);
    expect(second.itemMap.fresh).not.toBe(first.itemMap.fresh);
  });
});

describe('searching assets', () => {
  const assets = [
    { id: 'a', name: 'يورو', code: 'EUR', symbol: 'EUR', aliases: ['یورو', 'euro'], category: 'currency' },
    { id: 'b', name: 'فولاد', symbol: 'فولاد', aliases: [], category: 'bourse' },
    { id: 'c', name: 'سکه امامی', code: 'EMAMI', aliases: ['امامی'], category: 'coin' },
  ];
  it('ranks by symbol, name and alias; Arabic letters match Persian ones', () => {
    expect(searchUnifiedAssets(assets, 'یورو').map((a) => a.id)).toEqual(['a']);
    expect(searchUnifiedAssets(assets, 'eur')[0].id).toBe('a');
    expect(searchUnifiedAssets(assets, 'امامی')[0].id).toBe('c');
    expect(searchUnifiedAssets(assets, 'فولاد', { category: 'bourse' }).map((a) => a.id)).toEqual(['b']);
    expect(searchUnifiedAssets(assets, 'نامعلوم')).toEqual([]);
  });
  it('repeated searches over the same assets give the same answer', () => {
    expect(searchUnifiedAssets(assets, 'یورو')).toEqual(searchUnifiedAssets(assets, 'يورو'));
  });
});
