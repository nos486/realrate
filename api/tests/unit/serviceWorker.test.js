/**
 * serviceWorker.test.js — The site's service worker never leaves a page waiting on a slow network
 * when it has a cached copy (web/public/sw.js, run in a sandbox with stand-in caches and fetch)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../../web/public/sw.js', import.meta.url), 'utf8');

function loadWorker({ fetchImpl, cached = null }) {
  const store = new Map(cached ? [['k', cached]] : []);
  const cache = { match: async (key) => store.get(key) ?? undefined, put: async (key, res) => { store.set(key, res); } };
  const context = {
    self: { addEventListener() {}, location: { origin: 'https://realrate.ir' } },
    caches: { open: async () => cache, keys: async () => [] },
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
    Response: { error: () => ({ type: 'error' }) },
    URL,
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { worker: context, store };
}

const event = () => ({ waitUntil: vi.fn() });
const res = (body, ok = true) => ({ ok, body, clone() { return res(body, ok); } });

describe('networkFirstWithin', () => {
  afterEach(() => vi.useRealTimers());

  it('a fast network wins, and refreshes the copy', async () => {
    const { worker, store } = loadWorker({ fetchImpl: async () => res('fresh'), cached: res('old') });
    const answer = await worker.networkFirstWithin(event(), {}, 'c', 'k', 1000);
    expect(answer.body).toBe('fresh');
    expect(store.get('k').body).toBe('fresh');
  });

  it('a slow network: the cached copy after the wait, the network still refreshes it', async () => {
    let finish;
    const { worker, store } = loadWorker({ fetchImpl: () => new Promise((r) => { finish = () => r(res('late')); }), cached: res('old') });
    const ev = event();
    const answer = await worker.networkFirstWithin(ev, {}, 'c', 'k', 20);
    expect(answer.body).toBe('old');
    finish();
    await ev.waitUntil.mock.calls[0][0];
    expect(store.get('k').body).toBe('late');
  });

  it('offline: the cached copy; nothing cached: the network\'s answer', async () => {
    const offline = loadWorker({ fetchImpl: async () => { throw new Error('offline'); }, cached: res('old') });
    expect((await offline.worker.networkFirstWithin(event(), {}, 'c', 'k', 1000)).body).toBe('old');
    const empty = loadWorker({ fetchImpl: async () => res('first') });
    expect((await empty.worker.networkFirstWithin(event(), {}, 'c', 'k', 1)).body).toBe('first');
  });
});
