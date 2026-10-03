/**
 * sourceSync.test.js — Unit Tests for Unified Orchestration (Phase 4)
 *
 * Verifies Phase 4 Acceptance Criteria:
 * 1. Single unified loop across all active sources without branching on isCatalog.
 * 2. Uniform pipeline: fetchRaw -> parse -> items[] -> saveSourceItems.
 * 3. CRITICAL ACCEPTANCE CRITERIA: In a single tick, NO source is fetched twice (call count === 1).
 * 4. cronPolling.job.js invokes only syncAllSources.
 * 5. Deduplication of network requests for sources sharing identical endpoints.
 */

import { memoryStateDb } from '../helpers/memoryStateDb.js';
import { resetPriceBookMemo } from '../../src/repositories/priceBookStore.repository.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncAllSources, setPriceHistoryWriter } from '../../src/services/market/sourceSync.service.js';
import { runCronPolling } from '../../src/jobs/cronPolling.job.js';
import * as priceSourceRepo from '../../src/repositories/priceSource.repository.js';
import * as adapterIndex from '../../src/services/market/sources/index.js';
import * as sourceItemsRepo from '../../src/repositories/sourceItems.repository.js';

describe('Unified Orchestration — sourceSync.service (Phase 4)', () => {
  let mockEnv;
  let mockSources;
  let fetchRawCallCounts;
  let parseCallCounts;
  let savedItemsRecord;

  beforeEach(() => {
    fetchRawCallCounts = new Map();
    parseCallCounts = new Map();
    savedItemsRecord = new Map();

    mockSources = [
      {
        id: 'src_def_usd',
        priceType: 'usd',
        name: 'دلار آمریکا (آزاد)',
        sourceType: 'telegram',
        endpoint: 'tg://channel/rate_usd',
        isActive: true,
        isCatalog: false,
        fetchIntervalSec: 60,
      },
      {
        id: 'src_def_gold_18k',
        priceType: 'gold_18k',
        name: 'طلای ۱۸ عیار',
        sourceType: 'telegram',
        endpoint: 'tg://channel/rate_gold',
        isActive: true,
        isCatalog: false,
        fetchIntervalSec: 60,
      },
      {
        id: 'src_def_bourse',
        name: 'بورس اوراق بهادار تهران',
        sourceType: 'bourse_symbols',
        endpoint: 'https://api.brsapi.ir/bourse',
        isActive: true,
        isCatalog: true, // catalog source!
        market: 'bourse',
        fetchIntervalSec: 3600,
      },
      {
        id: 'src_def_charisma',
        name: 'صندوق‌های کاریزما',
        sourceType: 'charisma_funds',
        endpoint: 'https://webapi.charisma.ir/api/fund',
        isActive: true,
        isCatalog: true, // catalog source!
        market: 'bourse',
        fetchIntervalSec: 1800,
      },
      {
        id: 'src_inactive_test',
        name: 'سورس غیرفعال',
        sourceType: 'api_url',
        endpoint: 'https://inactive.example.com',
        isActive: false,
        fetchIntervalSec: 60,
      },
    ];

    resetPriceBookMemo();
    mockEnv = { DB: memoryStateDb() };

    // Mock dbGetPriceSources to return our mock sources
    vi.spyOn(priceSourceRepo, 'dbGetPriceSources').mockResolvedValue(mockSources);

    // Mock saveSourceItems
    vi.spyOn(sourceItemsRepo, 'saveSourceItems').mockImplementation(async (env, sourceId, items) => {
      savedItemsRecord.set(sourceId, items);
      return true;
    });

    // Mock getAdapterForSource
    vi.spyOn(adapterIndex, 'getAdapterForSource').mockImplementation((sourceConfig) => {
      return {
        id: sourceConfig.id,
        fetchRaw: vi.fn(async (src) => {
          const count = (fetchRawCallCounts.get(src.id) || 0) + 1;
          fetchRawCallCounts.set(src.id, count);
          return { raw: `data_for_${src.id}` };
        }),
        parse: vi.fn(async (raw, src) => {
          const count = (parseCallCounts.get(src.id) || 0) + 1;
          parseCallCounts.set(src.id, count);
          if (src.id === 'src_def_usd') {
            return {
              items: [{ id: 'src_def_usd', name: 'دلار', price: 95000 }],
              datetime: '2026-09-21T10:00:00Z',
            };
          }
          if (src.id === 'src_def_gold_18k') {
            return {
              items: [{ id: 'src_def_gold_18k', name: 'طلا ۱۸ عیار', price: 4200000 }],
              datetime: '2026-09-21T10:00:00Z',
            };
          }
          if (src.id === 'src_def_bourse') {
            return {
              items: [
                { id: 'foolad', name: 'فولاد', price: 540 },
                { id: 'femi', name: 'فملی', price: 680 },
              ],
              datetime: '2026-09-21T10:00:00Z',
            };
          }
          if (src.id === 'src_def_charisma') {
            return {
              items: [
                { id: 'ahrom', name: 'اهرم', price: 7500 },
                { id: 'kahroba', name: 'کهربا', price: 21000 },
              ],
              datetime: '2026-09-21T10:00:00Z',
            };
          }
          return { items: [], datetime: '2026-09-21T10:00:00Z' };
        }),
      };
    });
  });

  it('ACCEPTANCE CRITERIA: In a single tick, NO source is fetched twice (every active due source fetched exactly once)', async () => {
    const result = await syncAllSources(mockEnv, { forceAll: true });

    expect(result.totalActive).toBe(4); // 4 active sources (1 inactive ignored)
    expect(result.dueCount).toBe(4);
    expect(result.syncedCount).toBe(4);
    expect(result.failedCount).toBe(0);

    // CRITICAL: verify that each active source was fetched EXACTLY once in this tick
    expect(fetchRawCallCounts.get('src_def_usd')).toBe(1);
    expect(fetchRawCallCounts.get('src_def_gold_18k')).toBe(1);
    expect(fetchRawCallCounts.get('src_def_bourse')).toBe(1);
    expect(fetchRawCallCounts.get('src_def_charisma')).toBe(1);
    expect(fetchRawCallCounts.get('src_inactive_test')).toBeUndefined();

    // Verify parse was also called exactly once per source
    expect(parseCallCounts.get('src_def_usd')).toBe(1);
    expect(parseCallCounts.get('src_def_gold_18k')).toBe(1);
    expect(parseCallCounts.get('src_def_bourse')).toBe(1);
    expect(parseCallCounts.get('src_def_charisma')).toBe(1);

    // Verify every source (catalog and non-catalog alike) was saved via saveSourceItems
    expect(savedItemsRecord.has('src_def_usd')).toBe(true);
    expect(savedItemsRecord.has('src_def_gold_18k')).toBe(true);
    expect(savedItemsRecord.has('src_def_bourse')).toBe(true);
    expect(savedItemsRecord.has('src_def_charisma')).toBe(true);

    expect(savedItemsRecord.get('src_def_usd')).toHaveLength(1);
    expect(savedItemsRecord.get('src_def_bourse')).toHaveLength(2);
    expect(savedItemsRecord.get('src_def_charisma')).toHaveLength(2);
  });

  it('deduplicates network requests when sources share identical (sourceType + endpoint)', async () => {
    // Add two sources that share the exact same feed endpoint
    const sharedEndpointSources = [
      {
        id: 'src_feed_rate1',
        sourceType: 'api_url',
        endpoint: 'https://api.shared.com/rates',
        isActive: true,
      },
      {
        id: 'src_feed_rate2',
        sourceType: 'api_url',
        endpoint: 'https://api.shared.com/rates',
        isActive: true,
      },
    ];
    vi.spyOn(priceSourceRepo, 'dbGetPriceSources').mockResolvedValue(sharedEndpointSources);

    let networkFetchCount = 0;
    vi.spyOn(adapterIndex, 'getAdapterForSource').mockReturnValue({
      fetchRaw: vi.fn(async () => {
        networkFetchCount++;
        return { data: 'shared' };
      }),
      parse: vi.fn(async (raw, src) => ({
        items: [{ id: src.id, name: src.id, price: 100 }],
        datetime: new Date().toISOString(),
      })),
    });

    const result = await syncAllSources(mockEnv, { forceAll: true });
    expect(result.syncedCount).toBe(2);

    // Network request was fetched only ONCE for both sources
    expect(networkFetchCount).toBe(1);
  });

  it('cronPolling.job.js executes syncAllSources and runs a single tick without duplicate fetches', async () => {
    let waitUntilPromise = null;
    const mockCtx = {
      waitUntil: vi.fn((p) => {
        waitUntilPromise = p;
      }),
    };

    await runCronPolling({}, mockEnv, mockCtx);
    expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1);

    await waitUntilPromise;

    // Verify all active sources were fetched at most once
    for (const [, count] of fetchRawCallCounts.entries()) {
      expect(count).toBeLessThanOrEqual(1);
    }
  });

  it('cronPolling.job.js purges expired sessions only on the top-of-hour tick', async () => {
    const ctxFor = () => ({ waitUntil: vi.fn() });

    const atMinute5 = ctxFor();
    await runCronPolling({ scheduledTime: Date.UTC(2026, 0, 1, 10, 5) }, mockEnv, atMinute5);
    expect(atMinute5.waitUntil).toHaveBeenCalledTimes(1);

    const atMinute0 = ctxFor();
    await runCronPolling({ scheduledTime: Date.UTC(2026, 0, 1, 11, 0) }, mockEnv, atMinute0);
    // the sync, expired sessions and expired app_state counters
    expect(atMinute0.waitUntil).toHaveBeenCalledTimes(3);
  });

  it('records the tick\'s prices in one history write, catalog items under their market id', async () => {
    const writer = vi.fn(async () => 0);
    setPriceHistoryWriter(writer);
    try {
      await syncAllSources(mockEnv);
    } finally {
      setPriceHistoryWriter(null);
    }
    expect(writer).toHaveBeenCalledTimes(1);
    const [, points, recordedAt] = writer.mock.calls[0];
    expect(typeof recordedAt).toBe('string');
    const ids = points.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([
      'bourse__foolad', 'bourse__femi', 'bourse__ahrom', 'bourse__kahroba',
    ]));
  });

  it('writes the whole price book as one JSON under the state key "prices"', async () => {
    await syncAllSources(mockEnv);
    const book = mockEnv.DB.json('prices');
    expect(book).toBeTruthy();
    expect(book.items.bourse__foolad).toMatchObject({ price: 540, sourceId: 'src_def_bourse' });
    // A fund from two sources is one id: the first source's (the other's copy is prefixed)
    expect(book.items.bourse__ahrom).toMatchObject({ price: 7500, sourceId: 'src_def_charisma' });
    for (const [id, item] of Object.entries(book.items)) expect(item.id).toBe(id);
  });

  it('writes nothing but the source lists and the book: no second copy of any price', async () => {
    await syncAllSources(mockEnv);
    // Source lists go through saveSourceItems (mocked here); the book, and its sync state apart
    expect([...mockEnv.DB.rows.keys()].sort()).toEqual(['prices', 'source_states']);
    expect(mockEnv.DB.calls.filter((c) => c === 'put')).toHaveLength(2);
    expect(mockEnv.DB.json('source_states')).toEqual(mockEnv.DB.json('prices').sources);
    const book = mockEnv.DB.json('prices');
    expect(book.items.usd).toMatchObject({ price: 95000, sourceId: 'src_def_usd' });
    expect(book.sources.src_def_usd).toMatchObject({ count: 1, fetchedAt: '2026-09-21T10:00:00Z' });
  });

  it('skips a source the book says synced within its interval, and still prices it from its stored items', async () => {
    const now = new Date().toISOString();
    mockEnv.DB = memoryStateDb({ prices: { items: {}, sources: { src_def_usd: { syncedAt: now, fetchedAt: now, count: 1 } } } });
    mockSources[0].items = [{ id: 'src_def_usd', price: 94000 }];

    const result = await syncAllSources(mockEnv);
    expect(fetchRawCallCounts.get('src_def_usd')).toBeUndefined();
    expect(result.dueCount).toBe(3);
    const book = mockEnv.DB.json('prices');
    expect(book.items.usd.price).toBe(94000);
    expect(book.sources.src_def_usd.syncedAt).toBe(now);
  });

  it('fetching one source keeps every other source in the book', async () => {
    mockSources[1].items = [{ id: 'src_def_gold_18k', price: 4100000 }];
    const result = await syncAllSources(mockEnv, { forceAll: true, sourceIds: ['src_def_usd'] });
    expect(result.dueCount).toBe(1);
    expect(fetchRawCallCounts.get('src_def_gold_18k')).toBeUndefined();
    const book = mockEnv.DB.json('prices');
    expect(book.items.usd.price).toBe(95000);
    expect(book.items.gold_18k.price).toBe(4100000);
  });

  it('records a failed source in the book without dropping its last prices', async () => {
    mockSources[1].items = [{ id: 'src_def_gold_18k', price: 4100000 }];
    const base = adapterIndex.getAdapterForSource.getMockImplementation();
    vi.spyOn(adapterIndex, 'getAdapterForSource').mockImplementation((src) => (src.id === 'src_def_gold_18k'
      ? { fetchRaw: async () => { throw new Error('down'); }, parse: async () => ({ items: [] }) }
      : base(src)));

    const result = await syncAllSources(mockEnv, { forceAll: true });
    expect(result.failedCount).toBe(1);
    const book = mockEnv.DB.json('prices');
    expect(book.items.gold_18k.price).toBe(4100000);
    expect(book.sources.src_def_gold_18k).toMatchObject({ error: 'Empty or failed raw fetch' });
  });

  it('holds back an implausible price instead of storing it, and remembers it in the book', async () => {
    mockSources[0].items = [{ id: 'src_def_usd', price: 9500 }]; // the source now says 95,000: ×10
    await syncAllSources(mockEnv, { forceAll: true });
    expect(savedItemsRecord.get('src_def_usd')).toEqual([{ id: 'src_def_usd', price: 9500 }]);
    const book = mockEnv.DB.json('prices');
    expect(book.items.usd.price).toBe(9500);
    expect(book.sources.src_def_usd.held.src_def_usd).toEqual({ value: 95000, ticks: 1 });
  });
});
