/**
 * sourceItems.test.js — What each source last gave: one state key per source, written only when it
 * changed, and read back as each source's `items`
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { memoryStateDb } from '../helpers/memoryStateDb.js';
import {
  saveSourceItems,
  getSourceItems,
  readSourceItems,
  serializeSourceItems,
  SOURCE_ITEMS_KEY_PREFIX,
} from '../../src/repositories/sourceItems.repository.js';
import { dbGetPriceSources, dbSavePriceSource, dbSetPrimaryPriceSource, PRICE_SOURCE_OVERRIDES_KEY } from '../../src/repositories/priceSource.repository.js';

describe('source items storage', () => {
  let db;
  let env;

  beforeEach(() => {
    db = memoryStateDb();
    env = { DB: db };
  });

  it('round-trips a single price and a catalog under one key per source', async () => {
    const usd = [{ id: 'src_def_usd', name: 'دلار', price: 95500 }];
    const funds = [{ id: 'اهرم', name: 'اهرم', price: 7520 }, { id: 'کهربا', name: 'کهربا', price: 21800 }];
    expect(await saveSourceItems(env, 'src_def_usd', usd)).toBe(true);
    expect(await saveSourceItems(env, 'src_def_charisma', funds)).toBe(true);

    expect([...db.rows.keys()].sort()).toEqual([`${SOURCE_ITEMS_KEY_PREFIX}src_def_charisma`, `${SOURCE_ITEMS_KEY_PREFIX}src_def_usd`]);
    expect(await getSourceItems(env, 'src_def_usd')).toEqual(usd);
    expect(await getSourceItems(env, 'charisma_funds')).toEqual(funds); // an old name of the source
  });

  it('writes a list only when it changed', async () => {
    const items = [{ id: 'src_def_usd', price: 95500 }];
    const previous = serializeSourceItems(items);
    expect(await saveSourceItems(env, 'src_def_usd', items, { previous })).toBe(false);
    expect(db.calls).not.toContain('put');
    expect(await saveSourceItems(env, 'src_def_usd', [{ id: 'src_def_usd', price: 96000 }], { previous })).toBe(true);
    expect(db.calls.filter((c) => c === 'put')).toHaveLength(1);
  });

  it('reads nothing for a source that never synced, and the stored form for one that did', async () => {
    expect(await readSourceItems(env, 'src_def_usd')).toEqual({ json: null, items: [] });
    await saveSourceItems(env, 'src_def_usd', [{ id: 'src_def_usd', price: 1 }]);
    const read = await readSourceItems(env, 'src_def_usd');
    expect(read.json).toBe(serializeSourceItems([{ id: 'src_def_usd', price: 1 }]));
  });

  it('gives every configured source its stored items and its sync state from the price book', async () => {
    await saveSourceItems(env, 'src_def_usd', [{ id: 'src_def_usd', price: 95500 }]);
    await saveSourceItems(env, 'src_def_bourse', [{ id: 'فولاد', price: 540 }, { id: 'فملی', price: 680 }]);
    const book = { items: {}, sources: { src_def_usd: { syncedAt: '2026-01-01T00:00:00Z', fetchedAt: '2026-01-01T00:00:00Z', count: 1 } } };

    const sources = await dbGetPriceSources(env, { book });
    const usd = sources.find((s) => s.id === 'src_def_usd');
    const bourse = sources.find((s) => s.id === 'src_def_bourse');
    expect(usd).toMatchObject({ items: [{ id: 'src_def_usd', price: 95500 }], lastFetched: '2026-01-01T00:00:00Z' });
    expect(bourse.items).toHaveLength(2);
    expect(bourse.lastFetched).toBe('');
    // The stored form is kept for the unchanged-check, but never sent to a client
    expect(usd.storedItemsJson).toBe(serializeSourceItems([{ id: 'src_def_usd', price: 95500 }]));
    expect(JSON.stringify(usd)).not.toContain('storedItemsJson');
  });

  it('keeps an admin\'s on/off and primary choices over the code config, and nothing else', async () => {
    const off = await dbSavePriceSource(env, { id: 'src_def_usd', isActive: false, name: 'ignored', endpoint: 'x' });
    expect(off).toMatchObject({ id: 'src_def_usd', isActive: false });
    expect(off.name).not.toBe('ignored');
    expect(db.json(PRICE_SOURCE_OVERRIDES_KEY)).toEqual({ src_def_usd: { isActive: false } });
    expect((await dbGetPriceSources(env, { book: null })).find((s) => s.id === 'src_def_usd').isActive).toBe(false);

    await dbSetPrimaryPriceSource(env, 'src_def_usd');
    expect((await dbGetPriceSources(env, { book: null })).find((s) => s.id === 'src_def_usd')).toMatchObject({ isActive: true, isPrimary: true });

    await expect(dbSavePriceSource(env, { id: 'src_new_thing', isActive: true })).rejects.toThrow('sources.config.js');
  });
});
