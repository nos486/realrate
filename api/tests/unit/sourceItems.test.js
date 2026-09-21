/**
 * sourceItems.test.js — Unit Tests for Unified Storage (DB + KV)
 *
 * Tests Phase 3 acceptance criteria:
 * - Generic roundtrip: saveSourceItems -> getSourceItems across different sources
 * - Single-value items (e.g. currency/gold) and multi-value items (e.g. bourse/funds)
 * - Standard KV keys (primary, backup, last-sync)
 * - D1 mirror row persistence
 * - Fallbacks: primary -> backup -> legacy KV keys -> D1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveSourceItems,
  getSourceItems,
  getSourceLastSync,
  setSourceLastSync,
  SOURCE_ITEMS_KEY_PREFIX,
  SOURCE_ITEMS_BACKUP_KEY_PREFIX,
  SOURCE_ITEMS_LAST_SYNC_KEY_PREFIX,
} from '../../src/repositories/sourceItems.repository.js';
import { hydrateCatalogSourceFromKv } from '../../src/repositories/priceSource.repository.js';

describe('Unified Storage — sourceItems.repository', () => {
  let mockKvStorage;
  let mockDbStatements;
  let mockEnv;

  beforeEach(() => {
    mockKvStorage = new Map();
    mockDbStatements = [];

    mockEnv = {
      REALRATE_KV: {
        get: vi.fn(async (key) => mockKvStorage.get(key) || null),
        put: vi.fn(async (key, val) => {
          mockKvStorage.set(key, String(val));
        }),
      },
      DB: {
        prepare: vi.fn((sql) => {
          let boundParams = [];
          const stmt = {
            bind: vi.fn((...params) => {
              boundParams = params;
              return stmt;
            }),
            run: vi.fn(async () => {
              mockDbStatements.push({ sql, params: boundParams });
              return { success: true };
            }),
            first: vi.fn(async () => {
              const matched = mockDbStatements.find((s) => s.params.includes(boundParams[0]));
              return matched ? { last_price: 100, last_multi_data: '' } : null;
            }),
          };
          return stmt;
        }),
      },
    };
  });

  it('performs roundtrip (saveSourceItems -> getSourceItems) for single-item currency source', async () => {
    const sourceId = 'src_def_usd';
    const items = [{ id: 'src_def_usd', name: 'دلار آمریکا (آزاد)', price: 95500 }];

    const saveOk = await saveSourceItems(mockEnv, sourceId, items, { datetime: '2026-09-21T10:00:00Z' });
    expect(saveOk).toBe(true);

    // Verify KV standard keys
    expect(mockKvStorage.has(`${SOURCE_ITEMS_KEY_PREFIX}${sourceId}`)).toBe(true);
    expect(mockKvStorage.has(`${SOURCE_ITEMS_BACKUP_KEY_PREFIX}${sourceId}`)).toBe(true);
    expect(mockKvStorage.has(`${SOURCE_ITEMS_LAST_SYNC_KEY_PREFIX}${sourceId}`)).toBe(true);

    // Verify D1 mirror
    expect(mockDbStatements.length).toBeGreaterThan(0);
    const lastDbCall = mockDbStatements[mockDbStatements.length - 1];
    expect(lastDbCall.sql).toContain('UPDATE price_sources');
    expect(lastDbCall.params[0]).toBe(95500); // primary price

    // Retrieve via generic getSourceItems
    const retrieved = await getSourceItems(mockEnv, sourceId);
    expect(retrieved).toEqual(items);
    expect(retrieved.length).toBe(1);
    expect(retrieved[0].price).toBe(95500);
  });

  it('performs roundtrip (saveSourceItems -> getSourceItems) for multi-item catalog source (bourse/funds)', async () => {
    const sourceId = 'src_def_charisma';
    const items = [
      { id: 'src_def_charisma__ahrom', name: 'اهرم', price: 7520 },
      { id: 'src_def_charisma__kahroba', name: 'کهربا', price: 21800 },
      { id: 'src_def_charisma__noghran', name: 'نقران', price: 1250 },
    ];

    const saveOk = await saveSourceItems(mockEnv, sourceId, items);
    expect(saveOk).toBe(true);

    // Verify D1 mirror gets total count and multiData json
    const lastDbCall = mockDbStatements[mockDbStatements.length - 1];
    expect(lastDbCall.params[0]).toBe(3); // count as primary price
    expect(typeof lastDbCall.params[1]).toBe('string');
    const multiData = JSON.parse(lastDbCall.params[1]);
    expect(multiData.totalCount).toBe(3);
    expect(multiData.items.length).toBe(3);

    // Retrieve via getSourceItems
    const retrieved = await getSourceItems(mockEnv, sourceId);
    expect(retrieved).toEqual(items);
    expect(retrieved.length).toBe(3);
  });

  it('retrieves from backup KV when primary KV key is missing', async () => {
    const sourceId = 'src_def_emofid';
    const items = [{ id: 'src_def_emofid__pishtaz', name: 'پیشتاز', price: 25000 }];

    // Put directly into backup KV only
    mockKvStorage.set(`${SOURCE_ITEMS_BACKUP_KEY_PREFIX}${sourceId}`, JSON.stringify(items));

    const retrieved = await getSourceItems(mockEnv, sourceId);
    expect(retrieved).toEqual(items);
  });

  it('retrieves from legacy KV keys as seamless backward compatibility fallback', async () => {
    const sourceId = 'src_def_bourse';
    const legacyItems = [{ id: 'bourse__foolad', name: 'فولاد', price: 540 }];

    // Put into legacy key
    mockKvStorage.set('bourse_symbols_toman_v3', JSON.stringify(legacyItems));

    const retrieved = await getSourceItems(mockEnv, sourceId);
    expect(retrieved).toEqual(legacyItems);
  });

  it('retrieves from D1 when KV has no data', async () => {
    const sourceId = 'src_def_quarter_coin';
    const d1Items = [{ id: 'src_def_quarter_coin', name: 'quarter_coin', price: 18500000 }];

    const envWithD1Only = {
      REALRATE_KV: null,
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({
              last_price: 18500000,
              last_multi_data: JSON.stringify({ items: d1Items }),
            })),
          })),
        })),
      },
    };

    const retrieved = await getSourceItems(envWithD1Only, sourceId);
    expect(retrieved).toEqual(d1Items);
  });

  it('sets and gets source last sync timestamp', async () => {
    const sourceId = 'src_def_bourse';
    const now = Date.now();

    await setSourceLastSync(mockEnv, sourceId, now);
    const fetchedSync = await getSourceLastSync(mockEnv, sourceId);
    expect(fetchedSync).toBe(now);
  });

  it('hydrateCatalogSourceFromKv uses unified getSourceItems without conditions on id or priceType', async () => {
    const catalogSource = {
      id: 'src_def_charisma_plans',
      name: 'طرح‌های سرمایه‌گذاری کاریزما',
      priceType: 'charisma_plans',
      lastPrice: 0,
      lastMultiData: '',
    };

    const items = [
      { id: 'src_def_charisma_plans__gold', name: 'طلا', price: 32000000 },
      { id: 'src_def_charisma_plans__silver', name: 'نقره', price: 650000 },
    ];

    // Save items generically
    await saveSourceItems(mockEnv, catalogSource.id, items);

    // Hydrate generically
    const hydrated = await hydrateCatalogSourceFromKv(catalogSource, mockEnv);
    expect(hydrated.lastPrice).toBe(2);
    expect(hydrated.lastMultiData).toBeDefined();

    const parsedMulti = typeof hydrated.lastMultiData === 'string'
      ? JSON.parse(hydrated.lastMultiData)
      : hydrated.lastMultiData;
    expect(parsedMulti.totalCount).toBe(2);
    expect(parsedMulti.items).toHaveLength(2);
  });
});
