/**
 * edgeCache.test.js — edgeCachedJson: shared answer in the edge cache, plain build without it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { edgeCachedJson } from '../../src/lib/edgeCache.js';

function fakeCache() {
  const store = new Map();
  return {
    match: vi.fn(async (req) => store.get(req.url)?.clone()),
    put: vi.fn(async (req, res) => { store.set(req.url, res); }),
  };
}

afterEach(() => { delete globalThis.caches; });

describe('edgeCachedJson', () => {
  it('just builds when there is no cache API', async () => {
    const build = vi.fn(async () => ({ a: 1 }));
    expect(await edgeCachedJson('https://x.cache/a', 30, build)).toEqual({ a: 1 });
    expect(await edgeCachedJson('https://x.cache/a', 30, build)).toEqual({ a: 1 });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('builds once, then serves the stored answer', async () => {
    globalThis.caches = { default: fakeCache() };
    const build = vi.fn(async () => ({ a: 1 }));
    await edgeCachedJson('https://x.cache/b', 30, build);
    expect(await edgeCachedJson('https://x.cache/b', 30, build)).toEqual({ a: 1 });
    expect(build).toHaveBeenCalledTimes(1);
    const [, res] = globalThis.caches.default.put.mock.calls[0];
    expect(res.headers.get('Cache-Control')).toBe('max-age=30');
  });

  it('does not keep a null answer', async () => {
    globalThis.caches = { default: fakeCache() };
    expect(await edgeCachedJson('https://x.cache/c', 30, async () => null)).toBeNull();
    expect(globalThis.caches.default.put).not.toHaveBeenCalled();
  });

  it('survives a failing cache', async () => {
    globalThis.caches = { default: {
      match: async () => { throw new Error('down'); },
      put: async () => { throw new Error('down'); },
    } };
    expect(await edgeCachedJson('https://x.cache/d', 30, async () => ({ ok: true }))).toEqual({ ok: true });
  });
});
