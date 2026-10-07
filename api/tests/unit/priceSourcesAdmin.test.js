/**
 * priceSourcesAdmin.test.js — The admin's price sources page: a light row per source (its kind,
 * quote, interval and sync status, a short preview) and its full items only on demand
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { saveSourceItems } from '../../src/repositories/sourceItems.repository.js';
import { resetPriceBookMemo } from '../../src/repositories/priceBookStore.repository.js';
import { getMasterPriceSourceById, PRICE_SOURCES_CONFIG } from '../../src/config/sources.config.js';
import {
  priceSourceView,
  listPriceSourcesForAdmin,
  priceSourceItemsForAdmin,
  SYNC_TICK_SEC,
} from '../../src/services/market/priceSourcesAdmin.service.js';

const NOW = Date.parse('2026-05-01T12:00:00Z');

describe('price sources for the admin', () => {
  let env;

  beforeEach(() => {
    resetPriceBookMemo();
    env = { DB: memoryStateDb({ prices: { items: {}, sources: {
      src_def_usd: { syncedAt: new Date(NOW - 30_000).toISOString() },
      src_def_bourse: { syncedAt: new Date(NOW - 7_200_000).toISOString(), failedAt: new Date(NOW - 60_000).toISOString(), error: 'پاسخ وب‌سرویس بورس: 503' },
    } } }) };
  });

  it('describes a single-price source: its price, quote, interval and next fetch', () => {
    const src = { ...getMasterPriceSourceById('src_def_usd'), items: [{ id: 'src_def_usd', price: 95500 }] };
    const view = priceSourceView(src, { syncedAt: new Date(NOW - 30_000).toISOString() }, NOW);
    expect(view).toMatchObject({ id: 'src_def_usd', kind: 'single', kindLabel: 'تک‌نرخی', quote: 'toman', price: 95500, count: 1, preview: [] });
    expect(view.adapterName.length).toBeGreaterThan(0);
    expect(view.schedule).toMatchObject({ status: 'ok', intervalSec: src.fetchIntervalSec || 60 });
  });

  it('gives a catalog only its size and a short preview, never its whole list', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ id: `s${i}`, name: `n${i}`, price: i + 1 }));
    const view = priceSourceView({ ...getMasterPriceSourceById('src_def_bourse'), items }, null, NOW);
    expect(view).toMatchObject({ kind: 'catalog', count: 500, price: null });
    expect(view.preview).toHaveLength(3);
    expect(view.schedule.status).toBe('pending');
  });

  it('lists every source with a summary of their states', async () => {
    await saveSourceItems(env, 'src_def_usd', [{ id: 'src_def_usd', price: 95500 }]);
    const list = await listPriceSourcesForAdmin(env, NOW);
    expect(list.tickSec).toBe(SYNC_TICK_SEC);
    expect(list.sources).toHaveLength(PRICE_SOURCES_CONFIG.length);
    expect(list.summary.total).toBe(PRICE_SOURCES_CONFIG.length);
    const { total, ...states } = list.summary;
    expect(Object.values(states).reduce((a, b) => a + b, 0)).toBe(total);

    const bourse = list.sources.find((s) => s.id === 'src_def_bourse');
    expect(bourse.schedule).toMatchObject({ status: 'error', error: 'پاسخ وب‌سرویس بورس: 503' });
    expect(list.sources.find((s) => s.id === 'src_def_usd').price).toBe(95500);
  });

  it('gives a source\'s full items on demand, and nothing for an unknown id', async () => {
    await saveSourceItems(env, 'src_def_bourse', [{ id: 'فولاد', name: 'فولاد', price: 540 }]);
    expect(await priceSourceItemsForAdmin(env, 'src_def_bourse')).toEqual([{ id: 'فولاد', name: 'فولاد', price: 540 }]);
    expect(await priceSourceItemsForAdmin(env, 'nope')).toBeNull();
  });
});
