// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const puts = [];
let records = [];
let deleted = [];

vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  putVaultRecord: vi.fn(async (kind, id, payload, options) => {
    puts.push({ kind, id, payload, ...options });
    return { success: true };
  }),
  listVaultRecords: vi.fn(async (kind, options, filters) => {
    return { records, total: records.length };
  }),
  deleteVaultRecord: vi.fn(async (kind, id) => {
    deleted.push({ kind, id });
    return { success: true };
  }),
}));

const { e2eeEncrypt, e2eeDecrypt, deriveE2eeKey, generateE2eeSalt } = await import(
  '../../../web/src/lib/e2ee.js'
);
const {
  loadPortfolioLayout,
  savePortfolioLayoutRecord,
  deletePortfolioLayoutRecord,
} = await import('../../../web/src/shared/vault/vaultPortfolioLayout.js');

describe('vaultPortfolioLayout E2EE storage', () => {
  let key;

  beforeEach(async () => {
    puts.length = 0;
    records = [];
    deleted = [];
    key = key || (await deriveE2eeKey('test-pass-phrase', generateE2eeSalt()));
  });

  it('loads and decrypts portfolio layout from vault records', async () => {
    const rawLayout = {
      version: 1,
      groups: [
        { id: 'g_gold', title: 'طلا و مسکوکات', icon: 'gold', items: ['gold_18k'] },
        { id: 'g_fx', title: 'ارز', icon: 'currency', items: ['usd'] },
      ],
    };
    records = [
      {
        id: 'layout_1',
        payload: await e2eeEncrypt(key, rawLayout),
        parentId: 'p1',
      },
    ];

    const res = await loadPortfolioLayout('p1', key);
    expect(res.recordId).toBe('layout_1');
    expect(res.layout).toEqual(rawLayout);
  });

  it('returns null when no record exists or invalid input', async () => {
    const emptyRes = await loadPortfolioLayout('p1', key);
    expect(emptyRes.layout).toBeNull();
    expect(emptyRes.recordId).toBeNull();

    const noKeyRes = await loadPortfolioLayout('p1', null);
    expect(noKeyRes.layout).toBeNull();
  });

  it('saves encrypted layout to vault with parentId', async () => {
    const layout = {
      version: 1,
      groups: [
        { id: 'g_test', title: 'دسته تستی', icon: 'wallet', items: ['usd', 'eur'] },
      ],
    };

    const res = await savePortfolioLayoutRecord('p1', key, layout, 'existing_layout_id');
    expect(res.success).toBe(true);
    expect(res.recordId).toBe('existing_layout_id');

    expect(puts).toHaveLength(1);
    expect(puts[0].kind).toBe('portfolio_layout');
    expect(puts[0].id).toBe('existing_layout_id');
    expect(puts[0].parentId).toBe('p1');
    expect(puts[0].payload).toMatch(/^enc:e2ee:v1:/);

    // Decrypting the saved payload matches the clean layout
    const decrypted = await e2eeDecrypt(key, puts[0].payload);
    expect(decrypted.groups[0].title).toBe('دسته تستی');
    expect(decrypted.groups[0].items).toEqual(['usd', 'eur']);
  });

  it('deletes portfolio layout record', async () => {
    await deletePortfolioLayoutRecord('layout_123');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toEqual({ kind: 'portfolio_layout', id: 'layout_123' });
  });
});
