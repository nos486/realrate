import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCreateTransaction, handleUpdateTransaction } from '../../src/handlers/transactionRoutes.js';
import { handleAddPortfolio } from '../../src/handlers/portfolioRoutes.js';
import * as authLib from '../../src/lib/auth.js';
import * as repoIndex from '../../src/repositories/index.js';

describe('E2EE Vault Security Guard Tests', () => {
  const mockUser = {
    userId: 'user_test_123',
    email: 'user@test.com',
  };

  const e2eePortfolio = {
    id: 'p_e2ee_1',
    userId: 'user_test_123',
    name: 'گاوصندوق امن',
    isE2ee: 1,
    isDefault: 0,
  };

  const normalPortfolio = {
    id: 'p_normal_1',
    userId: 'user_test_123',
    name: 'پورتفوی عادی',
    isE2ee: 0,
    isDefault: 1,
  };

  const mockEnv = {
    DB: {},
    KV: {},
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authLib, 'getAuthenticatedUser').mockResolvedValue(mockUser);
  });

  describe('Transactions E2EE Guard', () => {
    it('rejects plaintext payload on an E2EE portfolio with 400 Bad Request', async () => {
      vi.spyOn(repoIndex, 'dbGetPortfolioById').mockResolvedValue(e2eePortfolio);

      const request = new Request('https://api.realrate.ir/api/portfolios/p_e2ee_1/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedPayload: JSON.stringify({ assetId: 'gold_18k', quantity: 10 }),
        }),
      });

      await expect(
        handleCreateTransaction(request, mockEnv, { portfolioId: 'p_e2ee_1' })
      ).rejects.toThrow('این پورتفو دارای رمزنگاری مبدا به مقصد (E2EE) است');
    });

    it('accepts valid enc:e2ee:v1: encrypted payload on an E2EE portfolio', async () => {
      vi.spyOn(repoIndex, 'dbGetPortfolioById').mockResolvedValue(e2eePortfolio);
      vi.spyOn(repoIndex, 'dbCreateTransaction').mockResolvedValue({
        id: 'tx_1',
        portfolioId: 'p_e2ee_1',
        encryptedPayload: 'enc:e2ee:v1:abcdef123456',
      });

      const request = new Request('https://api.realrate.ir/api/portfolios/p_e2ee_1/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedPayload: 'enc:e2ee:v1:abcdef123456',
        }),
      });

      const res = await handleCreateTransaction(request, mockEnv, { portfolioId: 'p_e2ee_1' });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('rejects plaintext payload when updating transaction on an E2EE portfolio', async () => {
      vi.spyOn(repoIndex, 'dbGetPortfolioById').mockResolvedValue(e2eePortfolio);

      const request = new Request('https://api.realrate.ir/api/portfolios/p_e2ee_1/transactions/tx_1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'tx_1',
          encryptedPayload: '{"unencrypted":"leak"}',
        }),
      });

      await expect(
        handleUpdateTransaction(request, mockEnv, { portfolioId: 'p_e2ee_1', txId: 'tx_1' })
      ).rejects.toThrow('این پورتفو دارای رمزنگاری مبدا به مقصد (E2EE) است');
    });

    it('allows plaintext payload on non-E2EE normal portfolio', async () => {
      vi.spyOn(repoIndex, 'dbGetPortfolioById').mockResolvedValue(normalPortfolio);
      vi.spyOn(repoIndex, 'dbCreateTransaction').mockResolvedValue({
        id: 'tx_normal',
        portfolioId: 'p_normal_1',
        encryptedPayload: '{"plain": true}',
      });

      const request = new Request('https://api.realrate.ir/api/portfolios/p_normal_1/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedPayload: '{"plain": true}',
        }),
      });

      const res = await handleCreateTransaction(request, mockEnv, { portfolioId: 'p_normal_1' });
      expect(res.status).toBe(201);
    });
  });

  describe('Holdings E2EE Guard', () => {
    it('rejects unencrypted holding on an E2EE portfolio with 400 Bad Request', async () => {
      vi.spyOn(repoIndex, 'dbGetPortfolioById').mockResolvedValue(e2eePortfolio);

      const request = new Request('https://api.realrate.ir/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: 'p_e2ee_1',
          assetId: 'gold_18k',
          amount: 5,
          buyPrice: 3500000,
          notes: 'Plaintext notes',
        }),
      });

      await expect(
        handleAddPortfolio(request, mockEnv)
      ).rejects.toThrow('این پورتفو دارای رمزنگاری مبدا به مقصد (E2EE) است');
    });

    it('accepts encrypted holding with enc:e2ee:v1: notes on an E2EE portfolio', async () => {
      vi.spyOn(repoIndex, 'dbGetPortfolioById').mockResolvedValue(e2eePortfolio);
      vi.spyOn(repoIndex, 'dbAddPortfolioHolding').mockResolvedValue({
        id: 'h_1',
        userId: 'user_test_123',
        portfolioId: 'p_e2ee_1',
        assetId: 'gold_18k',
        amount: 0,
        buyPrice: 0,
        notes: 'enc:e2ee:v1:secretCiphertext',
      });

      const request = new Request('https://api.realrate.ir/api/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: 'p_e2ee_1',
          assetId: 'gold_18k',
          amount: 0,
          buyPrice: 0,
          notes: 'enc:e2ee:v1:secretCiphertext',
        }),
      });

      const res = await handleAddPortfolio(request, mockEnv);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
