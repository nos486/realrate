/**
 * sourceItems.test.js — What each source last gave: one KV key per source, written only when it
 * changed, and read back as each source's `items`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveSourceItems,
  getSourceItems,
  readSourceItems,
  serializeSourceItems,
  SOURCE_ITEMS_KEY_PREFIX,
} from '../../src/repositories/sourceItems.repository.js';
import { dbGetPriceSources } from '../../src/repositories/priceSource.repository.js';

describe('source items storage', () => {
  let store;
  let env;

  beforeEach(() => {
    store = new Map();
    env = {
      REALRATE_KV: {
        get: vi.fn(async (key, type) => {
          const v = store.get(key) ?? null;
          return v !== null && type === 'json' ? JSON.parse(v) : v;
        }),
        put: vi.fn(async (key, val) => { store.set(key, String(val)); }),
        delete: vi.fn(async (key) => { store.delete(key); }),
      },
    };
  });

  it('round-trips a single price and a catalog under one key per source', async () => {
    const usd = [{ id: 'src_def_usd', name: 'دلار', price: 95500 }];
    const funds = [{ id: 'اهرم', name: 'اهرم', price: 7520 }, { id: 'کهربا', name: 'کهربا', price: 21800 }];
    expect(await saveSourceItems(env, 'src_def_usd', usd)).toBe(true);
    expect(await saveSourceItems(env, 'src_def_charisma', funds)).toBe(true);

    expect([...store.keys()].sort()).toEqual([`${SOURCE_ITEMS_KEY_PREFIX}src_def_charisma`, `${SOURCE_ITEMS_KEY_PREFIX}src_def_usd`]);
    expect(await getSourceItems(env, 'src_def_usd')).toEqual(usd);
    expect(await getSourceItems(env, 'charisma_funds')).toEqual(funds); // an old name of the source
  });

  it('writes a list only when it changed', async () => {
    const items = [{ id: 'src_def_usd', price: 95500 }];
    const previous = serializeSourceItems(items);
    expect(await saveSourceItems(env, 'src_def_usd', items, { previous })).toBe(false);
    expect(env.REALRATE_KV.put).not.toHaveBeenCalled();
    expect(await saveSourceItems(env, 'src_def_usd', [{ id: 'src_def_usd', price: 96000 }], { previous })).toBe(true);
    expect(env.REALRATE_KV.put).toHaveBeenCalledTimes(1);
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
    expect(usd).toMatchObject({ lastPrice: 95500, itemsCount: 1, lastFetched: '2026-01-01T00:00:00Z' });
    // A list has no single price: its size is itemsCount
    expect(bourse).toMatchObject({ lastPrice: 0, itemsCount: 2, lastFetched: '' });
    // The stored form is kept for the unchanged-check, but never sent to a client
    expect(usd.storedItemsJson).toBe(serializeSourceItems([{ id: 'src_def_usd', price: 95500 }]));
    expect(JSON.stringify(usd)).not.toContain('storedItemsJson');
  });
});
