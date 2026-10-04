// @vitest-environment happy-dom
/**
 * httpClientNetworkError.test.js — A request that gets no answer is an HttpError with status 0
 * (NETWORK_ERROR), the one thing the offline layer takes for "no connection"; a cancellation
 * stays a cancellation
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { httpClient, HttpError } from '../../../web/src/shared/api/httpClient.js';

afterEach(() => vi.unstubAllGlobals());

describe('httpClient without an answer', () => {
  it('a failed fetch becomes HttpError(status 0, NETWORK_ERROR)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const err = await httpClient.get('/api/x').catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('a cancelled request stays an AbortError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('aborted', 'AbortError'); }));
    const err = await httpClient.get('/api/y', { signal: new AbortController().signal }).catch((e) => e);
    expect(err.name).toBe('AbortError');
  });
});
