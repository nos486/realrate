/**
 * priceBookParts.test.js — The book in two parts: the core (every minute) and the catalog
 * (exchange symbols, about once an hour), each with its own version and ETag; the whole book
 * stays for clients that don't know the parts
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { handleGetPriceBook, handleGetPriceCatalog, resetPriceBookMemo } from '../../src/handlers/apiRoutes.js';
import { resetPriceBookMemo as resetBookStoreMemo } from '../../src/repositories/priceBookStore.repository.js';
import { splitPriceBook, isCatalogItem } from '../../src/domain/priceBook.js';

const items = (usd, foolad) => ({
  usd: { id: 'usd', price: usd, sourceId: 'src_def_usd', params: {} },
  bourse__foolad: { id: 'bourse__foolad', price: foolad, sourceId: 'src_def_bourse', params: { symbol: 'فولاد' } },
});

function envWith(book) {
  const map = new Map([['prices', JSON.stringify(book)]]);
  return { KV: { get: async (k) => map.get(k) ?? null, put: async (k, v) => map.set(k, v), delete: async (k) => map.delete(k) } };
}

const get = (handler, env, url, etag) => handler(env, new Request(url, { headers: etag ? { 'If-None-Match': etag } : {} }));

beforeEach(() => {
  resetPriceBookMemo();
  resetBookStoreMemo();
});

describe('splitPriceBook', () => {
  it('catalog items are the ones with a symbol', () => {
    const { core, catalog } = splitPriceBook(items(100, 5));
    expect(Object.keys(core)).toEqual(['usd']);
    expect(Object.keys(catalog)).toEqual(['bourse__foolad']);
    expect(isCatalogItem({ params: {} })).toBe(false);
  });
});

describe('GET /api/prices/book?part=core and /api/prices/catalog', () => {
  it('the core part names the catalog version; the catalog part has only symbols', async () => {
    const env = envWith({ updatedAt: 't', items: items(100, 5) });
    const core = await (await get(handleGetPriceBook, env, 'https://x/api/prices/book?part=core')).json();
    expect(Object.keys(core.items)).toEqual(['usd']);
    const catalog = await (await get(handleGetPriceCatalog, env, 'https://x/api/prices/catalog')).json();
    expect(Object.keys(catalog.items)).toEqual(['bourse__foolad']);
    expect(core.catalogVersion).toBe(catalog.version);
  });

  it('without part: the whole book (older clients)', async () => {
    const env = envWith({ updatedAt: 't', items: items(100, 5) });
    const full = await (await get(handleGetPriceBook, env, 'https://x/api/prices/book')).json();
    expect(Object.keys(full.items).sort()).toEqual(['bourse__foolad', 'usd']);
  });

  it('a core price moving leaves the catalog\'s ETag (and the client\'s copy) as it was', async () => {
    const first = envWith({ updatedAt: 't', items: items(100, 5) });
    const catalogEtag = (await get(handleGetPriceCatalog, first, 'https://x/api/prices/catalog')).headers.get('ETag');
    const coreEtag = (await get(handleGetPriceBook, first, 'https://x/api/prices/book?part=core')).headers.get('ETag');

    resetPriceBookMemo();
    resetBookStoreMemo();
    const moved = envWith({ updatedAt: 't2', items: items(101, 5) });
    expect((await get(handleGetPriceCatalog, moved, 'https://x/api/prices/catalog', catalogEtag)).status).toBe(304);
    expect((await get(handleGetPriceBook, moved, 'https://x/api/prices/book?part=core', coreEtag)).status).toBe(200);
  });
});
