/**
 * priceBookRoute.test.js — GET /api/prices/book: every price in one response, and a 304 when
 * nothing a screen shows changed since the client's copy
 */

import { describe, it, expect, vi } from 'vitest';

let book;
vi.mock('../../src/services/market/priceAggregator.service.js', () => ({ getPriceBook: vi.fn(async () => book) }));
vi.mock('../../src/repositories/settings.repository.js', () => ({ getGlobalSettings: vi.fn(async () => ({ announcement: 'hi' })) }));

const { handleGetPriceBook } = await import('../../src/handlers/apiRoutes.js');
const { buildPriceBook } = await import('../../src/domain/priceBook.js');

const source = (price) => ({ id: 'src_usd', priceType: 'usd', items: [{ id: 'src_usd', price }], isActive: true, isPrimary: true, name: 'usd' });
const get = (etag) => handleGetPriceBook({}, new Request('https://x/api/prices/book', { headers: etag ? { 'If-None-Match': etag } : {} }));

describe('GET /api/prices/book', () => {
  it('sends the prices with the settings and an ETag, but never the sources\' sync state', async () => {
    book = buildPriceBook([source(100000)], { now: '2026-01-01T00:00:00Z', sourceStates: { src_usd: { error: 'secret endpoint' } } });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toMatch(/^W\/"/);
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const body = await res.json();
    expect(body.items.usd.price).toBe(100000);
    expect(body.globalSettings.announcement).toBe('hi');
    expect(body.sources).toBeUndefined();
  });

  it('answers 304 while the prices are the same (a later sync with other timestamps included)', async () => {
    book = buildPriceBook([source(100000)], { now: '2026-01-01T00:00:00Z' });
    const etag = (await get()).headers.get('ETag');
    book = buildPriceBook([source(100000)], { now: '2026-01-01T00:05:00Z' });
    expect((await get(etag)).status).toBe(304);
    book = buildPriceBook([source(101000)], { now: '2026-01-01T00:06:00Z' });
    const changed = await get(etag);
    expect(changed.status).toBe(200);
    expect(changed.headers.get('ETag')).not.toBe(etag);
  });
});
