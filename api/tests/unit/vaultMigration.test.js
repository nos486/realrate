// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';


const lists = { '/api/loans': { loans: [{ id: 'loan_1', title: 'وام' }] }, '/api/incomes': { incomes: [{ id: 'inc_1', title: 'حقوق', userId: 'u1' }] }, '/api/cheques': { cheques: [] }, '/api/incomes/recurring': { rules: [] } };
const failing = new Set();
const puts = [];

vi.mock('../../../web/src/shared/api/httpClient.js', () => ({
  httpClient: {
    get: vi.fn(async (path) => {
      if (failing.has(path)) throw new Error('network');
      return lists[path];
    }),
  },
}));
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({
  getPortfolios: vi.fn(async () => {
    if (failing.has('portfolios')) throw new Error('network');
    return { portfolios: [] };
  }),
  updatePortfolio: vi.fn(),
  getPortfolio: vi.fn(),
  updatePortfolioHolding: vi.fn(),
}));
vi.mock('../../../web/src/features/transactions/api/transactionApi.js', () => ({ getTransactions: vi.fn(), updateTransaction: vi.fn() }));
vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({
  listVaultRecords: vi.fn(),
  putVaultRecord: vi.fn(async (kind, id, payload, options) => { puts.push({ kind, id, payload, replacePlain: options?.replacePlain }); }),
  restoreVaultRecord: vi.fn(),
  deleteVault: vi.fn(),
  getLoanDocument: vi.fn(async (id) => ({ document: { loan: { id } } })),
}));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async () => 'enc:e2ee:v1:cipher'),
  decryptVaultRecord: vi.fn(),
  createPortfolioKey: vi.fn(),
  getPortfolioKey: vi.fn(),
  wrapPortfolioKey: vi.fn(),
  markVaultOff: vi.fn(),
  bumpVaultEpoch: vi.fn(),
  isAccountVaultPortfolio: vi.fn(() => false),
}));

const { encryptAccountData, findPendingPlaintext } = await import('../../../web/src/shared/vault/vaultMigration.js');

describe('encrypting an account', () => {
  beforeEach(() => {
    failing.clear();
    puts.length = 0;
  });

  it('still encrypts loans and incomes when the portfolio list cannot be fetched', async () => {
    failing.add('portfolios');
    const report = await encryptAccountData();
    expect(puts.map((p) => `${p.kind}:${p.id}:${p.replacePlain}`)).toEqual(['loan:loan_1:true', 'income:inc_1:true']);
    expect(report.failed).toEqual(['دریافت فهرست پورتفوها']);
  });

  it('reports a section it could not list and carries on with the next', async () => {
    failing.add('/api/loans');
    const report = await encryptAccountData();
    expect(puts.map((p) => p.kind)).toEqual(['income']);
    expect(report.failed).toEqual(['دریافت فهرست وام‌ها']);
  });

  it('finds pending plaintext even when one list fails', async () => {
    failing.add('/api/cheques');
    const pending = await findPendingPlaintext();
    expect(pending).toMatchObject({ plainLoans: 1, plainIncomes: 1, plainCheques: 0 });
  });
});
