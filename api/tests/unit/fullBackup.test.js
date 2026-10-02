/**
 * fullBackup.test.js — «پشتیبان کامل»: every kind and every portfolio in one file, an optional
 * password, and a restore that keeps ids, creates missing portfolios and custom banks and points
 * the records at them
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// An in-memory vault: records by kind, "encryption" that only tags the JSON with its key
const vault = vi.hoisted(() => ({ records: [], portfolios: [], banks: [], home: null, nextPortfolio: 1, nextBank: 1 }));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: vi.fn(async (kind, _opts, filters = {}) => ({
    records: vault.records.filter((r) => r.kind === kind && (!filters.parent || r.parentId === filters.parent)),
  })),
  putVaultRecord: vi.fn(async (kind, id, payload, { recordDate = '', parentId = '' } = {}) => {
    vault.records = vault.records.filter((r) => !(r.kind === kind && r.id === id));
    vault.records.push({ kind, id, payload, recordDate, parentId });
  }),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: async (value) => `acct:${JSON.stringify(value)}`,
  decryptVaultRecord: async (payload) => JSON.parse(payload.replace(/^acct:/, '')),
  isAccountVaultPortfolio: (p) => Boolean(p?.e2eeWrappedKey),
  getPortfolioKey: async (p) => `key-${p.id}`,
  createPortfolioKey: async () => ({ wrapped: 'wrapped-new' }),
}));
vi.mock('../../../web/src/lib/e2ee.js', async (orig) => ({
  ...(await orig()),
  e2eeEncrypt: async (key, data) => (typeof key === 'string' ? `${key}:${JSON.stringify(data)}` : (await orig()).e2eeEncrypt(key, data)),
  e2eeDecrypt: async (key, payload) => {
    if (typeof key !== 'string') return (await orig()).e2eeDecrypt(key, payload);
    return payload.startsWith(`${key}:`) ? JSON.parse(payload.slice(key.length + 1)) : null;
  },
}));
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({
  getPortfolios: async () => ({ portfolios: vault.portfolios }),
  createPortfolio: async ({ name, e2eeWrappedKey }) => {
    const portfolio = { id: `pf_new${vault.nextPortfolio++}`, name, e2eeWrappedKey };
    vault.portfolios.push(portfolio);
    return { success: true, portfolio };
  },
}));
vi.mock('../../../web/src/shared/banks/bankApi.js', () => ({
  listCustomBanks: async () => ({ banks: vault.banks }),
  createCustomBank: async (name) => {
    const bank = { id: `custom_new${vault.nextBank++}`, name };
    vault.banks.push(bank);
    return { bank };
  },
}));
vi.mock('../../../web/src/features/home/homeApi.js', () => ({
  getHomeLayout: async () => ({ layout: vault.home }),
  saveHomeLayout: async (layout) => { vault.home = layout; },
}));

import { buildFullBackup, serializeBackup, parseBackup, restoreFullBackup, summarizeBackup } from '../../../web/src/shared/vault/fullBackup.js';

const acct = (kind, id, data, parentId = '') => ({ kind, id, payload: `acct:${JSON.stringify({ id, ...data })}`, recordDate: '', parentId });
const item = (pf, kind, id, data) => ({ kind, id, payload: `key-${pf}:${JSON.stringify({ id, ...data })}`, recordDate: '', parentId: pf });

function seed() {
  vault.portfolios = [{ id: 'pf_1', name: 'اصلی', e2eeWrappedKey: 'w1' }];
  vault.banks = [{ id: 'custom_1', name: 'صندوق محله' }];
  vault.home = { version: 1, sections: [] };
  vault.records = [
    acct('loan', 'loan_1', { loan: { id: 'loan_1', title: 'وام', bankId: 'custom_1' }, installments: [{ n: 1, paid: true }], extraPayments: [{ amount: 5 }] }),
    acct('expense_group', 'exg_1', { name: 'روزمره', type: 'daily' }),
    acct('expense', 'exp_1', { title: 'سفر', amount: 30, currency: 'USD', paidFrom: { portfolioId: 'pf_1', txId: 'tx_spend' }, myShare: 10, reimbursements: [{ amount: 5 }] }, 'exg_1'),
    acct('bank_account', 'acc_1', { name: 'صندوق', type: 'bank', bankId: 'custom_1' }),
    acct('transfer', 'trf_1', { fromAccountId: 'acc_1', toAccountId: 'acc_2', amount: 100, date: '2026-09-01' }),
    item('pf_1', 'holding', 'h_1', { assetId: 'usd', amount: 100 }),
    item('pf_1', 'transaction', 'tx_spend', { assetId: 'usd', transactionType: 'spend', quantity: 30 }),
    item('pf_1', 'portfolio_layout', 'layout_1', { groups: [], targets: { g_currency: 100 } }),
  ];
}

beforeEach(() => {
  vault.nextPortfolio = 1;
  vault.nextBank = 1;
  seed();
});

describe('full backup', () => {
  it('holds every kind and every portfolio\'s entries, decrypted', async () => {
    const backup = await buildFullBackup();
    const { counts, portfolios } = summarizeBackup(backup);
    expect(portfolios).toBe(1);
    expect(counts).toMatchObject({ loan: 1, expense_group: 1, expense: 1, bank_account: 1, transfer: 1, holding: 1, transaction: 1, portfolio_layout: 1 });
    expect(backup.records.find((r) => r.kind === 'loan').data.installments).toEqual([{ n: 1, paid: true }]);
    expect(backup.portfolios[0].records.find((r) => r.kind === 'portfolio_layout').data.targets).toEqual({ g_currency: 100 });
    expect(backup.customBanks).toEqual([{ id: 'custom_1', name: 'صندوق محله' }]);
  });

  it('a password encrypts the whole file; the wrong one is refused', async () => {
    const text = await serializeBackup(await buildFullBackup(), 'رمز-فایل');
    expect(text).not.toContain('صندوق');
    await expect(parseBackup(text)).rejects.toMatchObject({ code: 'NEEDS_PASSWORD' });
    await expect(parseBackup(text, 'اشتباه')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    expect((await parseBackup(text, 'رمز-فایل')).records.length).toBe(5);
    await expect(parseBackup('{"x":1}')).rejects.toMatchObject({ code: 'INVALID' });
  });

  it('restores into an empty account: a new portfolio and bank, and records pointing at them', async () => {
    const backup = await parseBackup(await serializeBackup(await buildFullBackup()));
    // Another (empty) account
    vault.records = [];
    vault.portfolios = [];
    vault.banks = [];
    vault.home = null;

    const result = await restoreFullBackup(backup);
    expect(result).toEqual({ restored: 8, skipped: 0, createdPortfolios: 1 });
    const read = (kind) => vault.records.filter((r) => r.kind === kind);
    expect(read('holding')[0]).toMatchObject({ id: 'h_1', parentId: 'pf_new1' });
    expect(read('holding')[0].payload.startsWith('key-pf_new1:')).toBe(true);
    const expense = JSON.parse(read('expense')[0].payload.replace(/^acct:/, ''));
    expect(expense.paidFrom).toEqual({ portfolioId: 'pf_new1', txId: 'tx_spend' });
    expect(read('expense')[0].parentId).toBe('exg_1');
    const loan = JSON.parse(read('loan')[0].payload.replace(/^acct:/, ''));
    expect(loan.loan.bankId).toBe('custom_new1');
    expect(loan.extraPayments).toEqual([{ amount: 5 }]);
    expect(vault.home).toEqual({ version: 1, sections: [] });
  });

  it('restores into the same account: records replaced in place, nothing duplicated', async () => {
    const backup = await buildFullBackup();
    const before = vault.records.length;
    const result = await restoreFullBackup(backup);
    expect(result.createdPortfolios).toBe(0);
    expect(vault.records).toHaveLength(before);
    expect(vault.banks).toHaveLength(1);
  });
});
