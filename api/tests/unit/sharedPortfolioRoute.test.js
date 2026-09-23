import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/repositories/index.js', () => ({
  dbGetPortfolioByShareSlug: vi.fn(),
  dbGetPortfolioHoldings: vi.fn(),
  dbGetTransactionsByPortfolio: vi.fn(),
}));

import {
  dbGetPortfolioByShareSlug,
  dbGetPortfolioHoldings,
  dbGetTransactionsByPortfolio,
} from '../../src/repositories/index.js';
import { handleGetSharedPortfolio } from '../../src/handlers/portfolioRoutes.js';

describe('handleGetSharedPortfolio (اشتراک‌گذاری عمومی پورتفو)', () => {
  const mockEnv = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes transactions alongside holdings, so transaction-derived positions are never silently missing from the shared view', async () => {
    dbGetPortfolioByShareSlug.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      name: 'پورتفوی من',
      shareSlug: 'abc123',
      shareEnabled: true,
      sharePassword: '',
      isE2ee: false,
      userCustomName: 'کاربر تست',
    });
    dbGetPortfolioHoldings.mockResolvedValue([
      { id: 'h1', assetId: 'gold_18k', amount: 5, buyPrice: 1000000 },
    ]);
    dbGetTransactionsByPortfolio.mockResolvedValue([
      { id: 'tx1', encryptedPayload: JSON.stringify({ assetId: 'USD', transactionType: 'buy', quantity: 100, unitPrice: 500000 }) },
    ]);

    const req = new Request('https://realrate.ir/api/portfolio/shared?slug=abc123');
    const res = await handleGetSharedPortfolio(req, mockEnv);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(dbGetTransactionsByPortfolio).toHaveBeenCalledWith(mockEnv, 'u1', 'p1');
    expect(Array.isArray(body.transactions)).toBe(true);
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0].id).toBe('tx1');
    expect(body.holdings).toHaveLength(1);
  });

  it('does not fetch holdings/transactions when the portfolio is not found or sharing is disabled', async () => {
    dbGetPortfolioByShareSlug.mockResolvedValue(null);

    const req = new Request('https://realrate.ir/api/portfolio/shared?slug=nope');
    await expect(handleGetSharedPortfolio(req, mockEnv)).rejects.toThrow();
    expect(dbGetTransactionsByPortfolio).not.toHaveBeenCalled();
  });

  it('does not leak holdings/transactions before a correct share password is provided', async () => {
    dbGetPortfolioByShareSlug.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      name: 'پورتفوی محافظت‌شده',
      shareSlug: 'abc123',
      shareEnabled: true,
      sharePassword: 'secret',
      isE2ee: false,
    });

    const req = new Request('https://realrate.ir/api/portfolio/shared?slug=abc123');
    const res = await handleGetSharedPortfolio(req, mockEnv);
    const body = await res.json();

    expect(body.requirePassword).toBe(true);
    expect(body.holdings).toBeUndefined();
    expect(body.transactions).toBeUndefined();
    expect(dbGetTransactionsByPortfolio).not.toHaveBeenCalled();
  });
});
