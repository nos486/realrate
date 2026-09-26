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
        name: 'دلار آمریکا (آزاد)',
        sourceType: 'telegram',
        endpoint: 'tg://channel/rate_usd',
        isActive: true,
        isCatalog: false,
        fetchIntervalSec: 60,
      },
      {
        id: 'src_def_gold_18k',
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
        fetchIntervalSec: 3600,
      },
      {
        id: 'src_def_charisma',
        name: 'صندوق‌های کاریزما',
        sourceType: 'charisma_funds',
        endpoint: 'https://webapi.charisma.ir/api/fund',
        isActive: true,
        isCatalog: true, // catalog source!
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

    mockEnv = {
      REALRATE_KV: {
        get: vi.fn(async () => null),
        put: vi.fn(async () => {}),
      },
      DB: {},
    };

    // Mock dbGetPriceSources to return our mock sources
    vi.spyOn(priceSourceRepo, 'dbGetPriceSources').mockResolvedValue(mockSources);

    // Mock saveSourceItems
    vi.spyOn(sourceItemsRepo, 'saveSourceItems').mockImplementation(async (env, sourceId, items) => {
      savedItemsRecord.set(sourceId, items);
      return true;
    });

    // Mock getSourceLastSync (default to 0 so all are due)
    vi.spyOn(sourceItemsRepo, 'getSourceLastSync').mockResolvedValue(0);
    vi.spyOn(sourceItemsRepo, 'setSourceLastSync').mockResolvedValue(true);

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
                { id: 'src_def_bourse__foolad', name: 'فولاد', price: 540 },
                { id: 'src_def_bourse__femi', name: 'فملی', price: 680 },
              ],
              datetime: '2026-09-21T10:00:00Z',
            };
          }
          if (src.id === 'src_def_charisma') {
            return {
              items: [
                { id: 'src_def_charisma__ahrom', name: 'اهرم', price: 7500 },
                { id: 'src_def_charisma__kahroba', name: 'کهربا', price: 21000 },
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
    expect(atMinute0.waitUntil).toHaveBeenCalledTimes(2);
  });

  it('records the tick\'s prices in one history write, catalog items under their catalog id', async () => {
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
      'src_def_bourse__foolad', 'src_def_bourse__femi', 'src_def_charisma__ahrom', 'src_def_charisma__kahroba',
    ]));
  });

  it('writes the whole price book as one JSON under the KV key "prices"', async () => {
    await syncAllSources(mockEnv);
    const call = mockEnv.REALRATE_KV.put.mock.calls.find(([key]) => key === 'prices');
    expect(call).toBeTruthy();
    const book = JSON.parse(call[1]);
    expect(book.items['src_def_bourse__foolad']).toMatchObject({ price: 540, sourceId: 'src_def_bourse' });
    for (const [id, item] of Object.entries(book.items)) expect(item.id).toBe(id);
  });
});
