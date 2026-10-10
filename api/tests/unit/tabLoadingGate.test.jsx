// @vitest-environment happy-dom
/**
 * tabLoadingGate.test.jsx — A tab just opened and still waiting on the server: a loader in the
 * middle of the screen blocks everything until its requests are back (httpClient's count of
 * requests in flight); a quick tab shows nothing, a failed request lets it go, and a read with no
 * answer gives up after httpClient's time limit — there is no way out by hand
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';

const { httpClient, subscribeRequests, READ_TIMEOUT_MS } = await import('../../../web/src/shared/api/httpClient.js');
const { default: TabLoadingGate, SHOW_DELAY_MS } = await import('../../../web/src/shared/refresh/TabLoadingGate.jsx');

/** A fetch that answers when told to */
function pendingFetch() {
  const calls = [];
  globalThis.fetch = vi.fn(() => new Promise((resolve, reject) => calls.push({ resolve, reject })));
  const answer = (i = 0) => calls[i].resolve(new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }));
  const fail = (i = 0) => calls[i].reject(new TypeError('Failed to fetch'));
  return { calls, answer, fail };
}
const loader = () => screen.queryByText('در حال باز کردن صفحه');
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the requests in flight', () => {
  it('are counted, reads and writes alike, and the count told to subscribers', async () => {
    const net = pendingFetch();
    const seen = [];
    const stop = subscribeRequests((n) => seen.push(n));
    const read = httpClient.get('/api/a');
    const write = httpClient.post('/api/b', {});
    net.answer(0);
    net.answer(1);
    await read;
    await write;
    stop();
    expect(seen).toEqual([0, 1, 2, 1, 0]);
  });
});

describe('TabLoadingGate', () => {
  it('shows nothing on the first tab, nor when a tab\'s data comes in quickly', async () => {
    const net = pendingFetch();
    const { rerender } = render(<TabLoadingGate tab="market" />);
    expect(loader()).toBeNull();
    rerender(<TabLoadingGate tab="incomes" />);
    const req = httpClient.get('/api/incomes');
    net.answer();
    await act(async () => { await req; });
    await act(async () => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
    expect(loader()).toBeNull();
  });

  it('blocks while the tab\'s requests are on their way, and lets go when they are back', async () => {
    const net = pendingFetch();
    const { rerender } = render(<TabLoadingGate tab="market" />);
    rerender(<TabLoadingGate tab="incomes" />);
    const req = httpClient.get('/api/incomes');
    await act(async () => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
    expect(loader()).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    net.answer();
    await act(async () => { await req; });
    await flush();
    expect(loader()).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('a request that can\'t reach the server lets it go', async () => {
    const net = pendingFetch();
    const { rerender } = render(<TabLoadingGate tab="market" />);
    rerender(<TabLoadingGate tab="loans" />);
    const req = httpClient.get('/api/loans').catch((err) => err);
    await act(async () => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
    expect(loader()).toBeTruthy();
    net.fail();
    expect((await act(async () => req))?.code).toBe('NETWORK_ERROR');
    await flush();
    expect(loader()).toBeNull();
  });

  it('a read with no answer gives up after the time limit, which lets it go', async () => {
    pendingFetch();
    globalThis.fetch = vi.fn((url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const { rerender } = render(<TabLoadingGate tab="market" />);
    rerender(<TabLoadingGate tab="reports" />);
    const req = httpClient.get('/api/reports').catch((err) => err);
    await act(async () => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
    expect(loader()).toBeTruthy();
    // No way out by hand: only the answer, or the time limit
    expect(screen.queryByRole('button')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(READ_TIMEOUT_MS); });
    expect((await act(async () => req))?.code).toBe('TIMEOUT');
    await flush();
    expect(loader()).toBeNull();
  });

  it('a write is never cut off, and a caller\'s own cancel stays a cancel', async () => {
    const net = pendingFetch();
    const write = httpClient.post('/api/b', {});
    await act(async () => { vi.advanceTimersByTime(READ_TIMEOUT_MS * 2); });
    net.answer();
    expect(await write).toEqual({ ok: true });
    globalThis.fetch = vi.fn((url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const cancel = new AbortController();
    const read = httpClient.get('/api/c', { signal: cancel.signal }).catch((err) => err);
    cancel.abort();
    expect((await read)?.name).toBe('AbortError');
  });
});
