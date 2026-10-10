// @vitest-environment happy-dom
/**
 * tabLoadingGate.test.jsx — A tab just opened and still waiting on the server: a loader in the
 * middle of the screen blocks everything until its requests are back (httpClient's count of
 * requests in flight); a quick tab shows nothing, a failed request lets it go, and a very slow
 * connection gets «ادامه بدون صبر»
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

const { httpClient, subscribeRequests } = await import('../../../web/src/shared/api/httpClient.js');
const { default: TabLoadingGate, SHOW_DELAY_MS, SLOW_AFTER_MS } = await import('../../../web/src/shared/refresh/TabLoadingGate.jsx');

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

  it('on a very slow connection, offers to go on without waiting', async () => {
    pendingFetch();
    const { rerender } = render(<TabLoadingGate tab="market" />);
    rerender(<TabLoadingGate tab="reports" />);
    httpClient.get('/api/reports').catch(() => {});
    await act(async () => { vi.advanceTimersByTime(SHOW_DELAY_MS + 10); });
    expect(screen.queryByText('ادامه بدون صبر')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(SLOW_AFTER_MS); });
    expect(screen.getByText(/اتصال کند است/)).toBeTruthy();
    fireEvent.click(screen.getByText('ادامه بدون صبر'));
    expect(loader()).toBeNull();
  });
});
