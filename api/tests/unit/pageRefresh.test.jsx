// @vitest-environment happy-dom
/**
 * pageRefresh.test.jsx — The header's refresh button and the window's focus read only what the
 * open tab shows: the news tab never reads the price book, a records tab never reads the others'
 * records; focus refreshes at most once per gap; news is read once and then only on a refresh
 * (no timer)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, cleanup, screen, fireEvent } from '@testing-library/react';

const offline = { active: false, syncNow: vi.fn(async () => {}) };
vi.mock('../../../web/src/shared/offline/offlineSync.js', () => ({
  isOfflineActive: () => offline.active,
  syncNow: () => offline.syncNow(),
}));
vi.mock('../../../web/src/features/news/newsApi.js', () => ({
  getNews: vi.fn(async () => ({ items: [{ id: 'n1' }], total: 1 })),
  getNewsToday: vi.fn(async () => ({ analysis: null, top: [], week: [] })),
}));

import {
  useRefreshHandler,
  useRefreshToken,
  usePageScopes,
  refreshScopes,
  refreshOnFocus,
  startFocusRefresh,
  resetPageRefresh,
  AUTO_REFRESH_GAP_MS,
} from '../../../web/src/shared/refresh/pageRefresh.js';
import PageRefreshButton from '../../../web/src/shared/refresh/PageRefreshButton.jsx';
import { refreshScopesOf } from '../../../web/src/shared/refresh/tabScopes.js';
import { useNews, clearNewsCache } from '../../../web/src/features/news/useNews.js';
import { getNews } from '../../../web/src/features/news/newsApi.js';

const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

/** A tab: names its scopes, and mounts a loader for each kind of data given */
function Page({ scopes, loaders }) {
  usePageScopes(scopes);
  return Object.entries(loaders).map(([scope, fn]) => <Loader key={scope} scope={scope} fn={fn} />);
}
function Loader({ scope, fn }) {
  useRefreshHandler(scope, fn);
  return null;
}

beforeEach(() => {
  resetPageRefresh();
  clearNewsCache();
  offline.active = false;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a refresh reads only the open tab', () => {
  it('the news tab reads the news, not the prices', async () => {
    const prices = vi.fn();
    const news = vi.fn();
    render(<Page scopes={['news']} loaders={{ prices, news }} />);
    await act(async () => {
      await refreshScopes();
    });
    expect(news).toHaveBeenCalledTimes(1);
    expect(prices).not.toHaveBeenCalled();
  });

  it('a records tab reads its own records only', async () => {
    const incomes = vi.fn();
    const loans = vi.fn();
    render(<Page scopes={refreshScopesOf('incomes')} loaders={{ incomes, loans }} />);
    await act(async () => {
      await refreshScopes();
    });
    expect(incomes).toHaveBeenCalledTimes(1);
    expect(loans).not.toHaveBeenCalled();
  });

  it('a loader that is not mounted reads nothing', async () => {
    const prices = vi.fn();
    const { unmount } = render(<Page scopes={['prices']} loaders={{ prices }} />);
    unmount();
    await act(async () => {
      await refreshScopes({ scopes: ['prices'] });
    });
    expect(prices).not.toHaveBeenCalled();
  });

  it('the button spins until the loaders settle, and is hidden on a tab with nothing to read', async () => {
    let finish;
    const prices = vi.fn(() => new Promise((resolve) => {
      finish = resolve;
    }));
    const { rerender } = render(<><Page scopes={['prices']} loaders={{ prices }} /><PageRefreshButton /></>);
    const button = screen.getByRole('button', { name: 'به‌روزرسانی' });
    fireEvent.click(button);
    await flush();
    expect(prices).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    // A second tap while reading starts nothing new
    await act(async () => {
      refreshScopes();
    });
    expect(prices).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
    });
    await flush();
    expect(button.disabled).toBe(false);

    rerender(<><Page scopes={[]} loaders={{}} /><PageRefreshButton /></>);
    expect(screen.queryByRole('button', { name: 'به‌روزرسانی' })).toBeNull();
  });

  it("with the Android app's offline copy, records are synced once first, then re-read", async () => {
    offline.active = true;
    const order = [];
    offline.syncNow.mockImplementation(async () => order.push('sync'));
    const expenses = vi.fn(() => order.push('expenses'));
    render(<Page scopes={['expenses']} loaders={{ expenses }} />);
    await act(async () => {
      await refreshScopes();
    });
    expect(order).toEqual(['sync', 'expenses']);

    // Prices and news are not records: no sync
    offline.syncNow.mockClear();
    cleanup();
    render(<Page scopes={['prices', 'news']} loaders={{ prices: vi.fn() }} />);
    await act(async () => {
      await refreshScopes();
    });
    expect(offline.syncNow).not.toHaveBeenCalled();
  });

  it('an effect loader follows its scope through a token', async () => {
    const { result } = renderHook(() => useRefreshToken('loans'));
    expect(result.current).toBe(0);
    await act(async () => {
      await refreshScopes({ scopes: ['loans'] });
    });
    expect(result.current).toBe(1);
  });
});

describe('the window getting focus again', () => {
  it('refreshes the open tab, at most once per gap — never on a timer', async () => {
    vi.useFakeTimers();
    const news = vi.fn();
    render(<Page scopes={['news']} loaders={{ news }} />);
    let stop;
    act(() => {
      stop = startFocusRefresh();
    });

    // Just opened: what the page loaded counts as fresh
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(news).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });
    expect(news).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await flush();
    expect(news).toHaveBeenCalledTimes(1);

    // Focus and the page becoming visible together: one read
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(news).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(AUTO_REFRESH_GAP_MS);
      await refreshOnFocus();
    });
    expect(news).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('the tabs and what they read', () => {
  it('names the scopes of each tab', () => {
    expect(refreshScopesOf('news')).toEqual(['news']);
    expect(refreshScopesOf('market')).toEqual(['prices', 'news']);
    expect(refreshScopesOf('market', { hasMarket: false })).toEqual(['news']);
    expect(refreshScopesOf('market', { appLayout: true })).toEqual(['prices', 'news', 'incomes', 'expenses']);
    expect(refreshScopesOf('portfolio', { hasMarket: false })).toContain('prices');
    expect(refreshScopesOf('loans')).toEqual(['loans']);
    expect(refreshScopesOf('settings')).toEqual([]);
    expect(refreshScopesOf('unknown')).toEqual([]);
  });
});

describe('news', () => {
  it('is read once; opening it again shows the answer kept; a refresh reads it again', async () => {
    const first = renderHook(() => useNews());
    await flush();
    expect(getNews).toHaveBeenCalledTimes(1);
    expect(first.result.current.items).toHaveLength(1);
    first.unmount();

    const again = renderHook(() => useNews());
    await flush();
    expect(getNews).toHaveBeenCalledTimes(1);
    expect(again.result.current.items).toHaveLength(1);

    await act(async () => {
      await refreshScopes({ scopes: ['news'] });
    });
    expect(getNews).toHaveBeenCalledTimes(2);
  });

  it('a refresh forgets the answers not on screen, so they are read fresh when shown', async () => {
    const page2 = renderHook(() => useNews({ page: 2 }));
    await flush();
    page2.unmount();
    renderHook(() => useNews());
    await flush();
    expect(getNews).toHaveBeenCalledTimes(2);

    await act(async () => {
      await refreshScopes({ scopes: ['news'] });
    });
    expect(getNews).toHaveBeenCalledTimes(3);

    renderHook(() => useNews({ page: 2 }));
    await flush();
    expect(getNews).toHaveBeenCalledTimes(4);
  });
});
