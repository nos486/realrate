/**
 * sharedPortfolioRoute.test.js — A shared portfolio's public answer: its encrypted records
 * (holdings, transactions, layout) for the link key to open in the viewer's browser, and
 * nothing before the share password
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repositories/index.js', () => ({
  dbGetPortfolioByShareSlug: vi.fn(),
  dbListVaultRecords: vi.fn(),
}));

import { dbGetPortfolioByShareSlug, dbListVaultRecords } from '../../src/repositories/index.js';
import { handleGetSharedPortfolio } from '../../src/handlers/portfolioRoutes.js';

describe('handleGetSharedPortfolio (اشتراک‌گذاری عمومی پورتفو)', () => {
  const mockEnv = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not read any record when the portfolio is not found or sharing is disabled', async () => {
    dbGetPortfolioByShareSlug.mockResolvedValue(null);
    const req = new Request('https://realrate.ir/api/portfolio/shared?slug=nope');
    await expect(handleGetSharedPortfolio(req, mockEnv)).rejects.toThrow();
    expect(dbListVaultRecords).not.toHaveBeenCalled();
  });

  it('does not leak records before a correct share password is provided', async () => {
    dbGetPortfolioByShareSlug.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      name: 'پورتفوی محافظت‌شده',
      shareSlug: 'abc123',
      shareEnabled: true,
      sharePassword: 'secret',
      e2eeWrappedKey: 'wrapped-portfolio-key',
    });

    const req = new Request('https://realrate.ir/api/portfolio/shared?slug=abc123');
    const body = await (await handleGetSharedPortfolio(req, mockEnv)).json();

    expect(body.requirePassword).toBe(true);
    // Not even the names before the password
    expect(body.portfolio.name).toBeUndefined();
    expect(body.user.name).toBeUndefined();
    expect(body.vaultHoldings).toBeUndefined();
    expect(body.vaultTransactions).toBeUndefined();
    expect(dbListVaultRecords).not.toHaveBeenCalled();
  });

  it('returns the encrypted holdings, transactions and layout (transaction-built positions included)', async () => {
    dbGetPortfolioByShareSlug.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      name: 'پورتفوی رمزشده',
      shareSlug: 'e2ee-slug',
      shareEnabled: true,
      sharePassword: '',
      e2eeWrappedKey: 'wrapped-portfolio-key',
    });
    dbListVaultRecords.mockImplementation(async (env, userId, kind) => {
      if (kind === 'holding') return [{ id: 'h1', payload: 'enc:h1', recordDate: '2026-01-01' }];
      if (kind === 'transaction') return [{ id: 't1', payload: 'enc:t1', recordDate: '2026-01-01' }];
      if (kind === 'portfolio_layout') return [{ id: 'l1', payload: 'enc:l1', recordDate: '' }];
      return [];
    });

    const req = new Request('https://realrate.ir/api/portfolio/shared?slug=e2ee-slug');
    const body = await (await handleGetSharedPortfolio(req, mockEnv)).json();

    expect(body.success).toBe(true);
    expect(body.portfolio.e2eeLinkKey).toBe(true);
    expect(dbListVaultRecords).toHaveBeenCalledWith(mockEnv, 'u1', 'transaction', { parentId: 'p1' });
    expect(body.vaultHoldings).toHaveLength(1);
    expect(body.vaultTransactions).toHaveLength(1);
    expect(body.vaultLayout).toEqual([{ id: 'l1', payload: 'enc:l1', recordDate: '' }]);
    expect(body.holdings).toBeUndefined();
  });
});
