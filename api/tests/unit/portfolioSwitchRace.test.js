// @vitest-environment happy-dom
/**
 * portfolioSwitchRace.test.js — Switching portfolios: a slow answer for the portfolio left behind
 * never replaces the current one's rows, the previous rows are cleared while the next load,
 * and one portfolio's key is never used for another
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

// Stable object, like the real AuthContext value — a fresh user per render would refetch forever
const mockAuth = { user: { id: 'u1' } };
vi.mock('../../../web/src/features/auth/index.js', () => ({
  useAuth: () => mockAuth,
}));

// Portfolio A's key is open; B's is not
const keys = vi.hoisted(() => ({ A: { name: 'key-a' }, B: null }));
vi.mock('../../../web/src/shared/vault/usePortfolioVaultKey.js', () => ({
  usePortfolioVaultKey: (portfolio) => ({ accountManaged: true, key: portfolio?.id in keys ? keys[portfolio.id] : { name: `key-${portfolio?.id}` }, resolving: false }),
}));

vi.mock('../../../web/src/shared/vault/vaultPortfolioItems.js', () => ({
  listPortfolioTransactions: vi.fn(),
  savePortfolioTransaction: vi.fn(),
  deletePortfolioTransactionRecord: vi.fn(),
  listPortfolioHoldings: vi.fn(),
  savePortfolioHolding: vi.fn(),
  deletePortfolioHoldingRecord: vi.fn(),
}));

import { listPortfolioTransactions, listPortfolioHoldings, savePortfolioTransaction } from '../../../web/src/shared/vault/vaultPortfolioItems.js';
import { useTransactions } from '../../../web/src/features/transactions/hooks/useTransactions.js';
import { useHoldings } from '../../../web/src/features/portfolio/hooks/useHoldings.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const tx = (id, assetId) => ({ id, assetId, transactionType: 'buy', quantity: 1, unitPrice: 100 });

beforeEach(() => {
  vi.clearAllMocks();
  keys.A = { name: 'key-a' };
  keys.B = { name: 'key-b' };
});

afterEach(() => {
  cleanup();
});

describe('useTransactions — switching portfolios', () => {
  it('ignores a slow response for a portfolio the user already switched away from', async () => {
    const slowA = deferred();
    const fastB = deferred();
    listPortfolioTransactions.mockImplementation((p) => (p.id === 'A' ? slowA.promise : fastB.promise));

    const { result, rerender } = renderHook(({ portfolio }) => useTransactions(portfolio), {
      initialProps: { portfolio: { id: 'A' } },
    });
    rerender({ portfolio: { id: 'B' } });

    await act(async () => {
      fastB.resolve([tx('tb', 'usd')]);
    });
    await waitFor(() => expect(result.current.transactions.map((t) => t.id)).toEqual(['tb']));

    // A's response lands late — it must not replace B's transactions
    await act(async () => {
      slowA.resolve([tx('ta', 'gold_18k')]);
    });
    expect(result.current.transactions.map((t) => t.id)).toEqual(['tb']);
    expect(result.current.loadingTransactions).toBe(false);
  });

  it('clears the previous portfolio rows while the next one is loading', async () => {
    const pendingB = deferred();
    listPortfolioTransactions.mockImplementation((p) => (p.id === 'A' ? Promise.resolve([tx('ta', 'usd')]) : pendingB.promise));

    const { result, rerender } = renderHook(({ portfolio }) => useTransactions(portfolio), {
      initialProps: { portfolio: { id: 'A' } },
    });
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    rerender({ portfolio: { id: 'B' } });
    await waitFor(() => expect(result.current.transactions).toHaveLength(0));
  });

  it("never uses one portfolio's key for another", async () => {
    keys.B = null;
    listPortfolioTransactions.mockResolvedValue([]);

    const { result, rerender } = renderHook(({ portfolio }) => useTransactions(portfolio), {
      initialProps: { portfolio: { id: 'A' } },
    });
    await waitFor(() => expect(result.current.isVaultLocked).toBe(false));

    rerender({ portfolio: { id: 'B' } });
    expect(result.current.isVaultLocked).toBe(true);
    expect(result.current.activeVaultKey).toBeNull();
    await expect(result.current.addTransaction({ assetId: 'usd', quantity: 1 })).rejects.toThrow();
    expect(savePortfolioTransaction).not.toHaveBeenCalled();
  });
});

describe('useHoldings — switching portfolios', () => {
  it('ignores a slow response for a portfolio the user already switched away from', async () => {
    const slowA = deferred();
    const fastB = deferred();
    listPortfolioHoldings.mockImplementation((p) => (p.id === 'A' ? slowA.promise : fastB.promise));

    const { result, rerender } = renderHook(({ portfolio }) => useHoldings(portfolio), {
      initialProps: { portfolio: { id: 'A' } },
    });
    rerender({ portfolio: { id: 'B' } });

    await act(async () => {
      fastB.resolve([{ id: 'hb', assetId: 'usd', amount: 1 }]);
    });
    await waitFor(() => expect(result.current.holdings.map((h) => h.id)).toEqual(['hb']));

    await act(async () => {
      slowA.resolve([{ id: 'ha', assetId: 'gold_18k', amount: 1 }]);
    });
    expect(result.current.holdings.map((h) => h.id)).toEqual(['hb']);
    expect(result.current.loadingHoldings).toBe(false);
  });
});
