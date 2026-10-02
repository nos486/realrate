// @vitest-environment happy-dom
/**
 * httpClientShare.test.js — identical reads at the same moment share one request; each caller
 * gets its own copy; writes and later reads are never shared
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { httpClient } from '../../../web/src/shared/api/httpClient.js';

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [1, 2] }), { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('shared reads', () => {
  it('one request for identical reads in flight, a copy each', async () => {
    const [a, b, c] = await Promise.all([httpClient.get('/api/x'), httpClient.get('/api/x'), httpClient.get('/api/y')]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(a).toEqual(b);
    a.items.push(3);
    expect(b.items).toEqual([1, 2]);
    expect(c).toEqual({ items: [1, 2] });
  });

  it('a read after the first finished asks again; writes are never shared', async () => {
    await httpClient.get('/api/x');
    await httpClient.get('/api/x');
    await Promise.all([httpClient.post('/api/x', { a: 1 }), httpClient.post('/api/x', { a: 1 })]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('a failed read fails every caller, and the next one tries again', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'بد' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    const results = await Promise.allSettled([httpClient.get('/api/z'), httpClient.get('/api/z')]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    await expect(httpClient.get('/api/z')).resolves.toEqual({ items: [1, 2] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
