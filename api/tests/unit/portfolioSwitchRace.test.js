// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

// Stable object, like the real AuthContext value — a fresh user per render would refetch forever
const mockAuth = { user: { id: 'u1' } };
vi.mock('../../../web/src/features/auth/index.js', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../../../web/src/features/transactions/api/transactionApi.js', () => ({
  getTransactions: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({
  getPortfolio: vi.fn(),
  addPortfolioHolding: vi.fn(),
  updatePortfolioHolding: vi.fn(),
  deletePortfolioHolding: vi.fn(),
  searchBourseSymbols: vi.fn(async () => ({ success: false })),
}));

import { getTransactions } from '../../../web/src/features/transactions/api/transactionApi.js';
import { getPortfolio } from '../../../web/src/features/portfolio/api/portfolioApi.js';
import { useTransactions } from '../../../web/src/features/transactions/hooks/useTransactions.js';
import { useHoldings } from '../../../web/src/features/portfolio/hooks/useHoldings.js';
import {
  generateE2eeSalt,
  deriveE2eeKey,
  createE2eeVerifier,
  saveVaultPassphraseToSession,
  clearVaultPassphraseFromSession,
} from '../../../web/src/lib/e2ee.js';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const plainTx = (id, assetId) => ({
  id,
  encryptedPayload: JSON.stringify({ assetId, transactionType: 'buy', quantity: 1, unitPrice: 100 }),
});

async function makeVaultPortfolio(id, passphrase) {
  const e2eeSalt = generateE2eeSalt();
  const key = await deriveE2eeKey(passphrase, e2eeSalt);
  return { id, isE2ee: true, e2eeSalt, e2eeVerifier: await createE2eeVerifier(key) };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('useTransactions — switching portfolios', () => {
  it('ignores a slow response for a portfolio the user already switched away from', async () => {
    const slowA = deferred();
    const fastB = deferred();
    getTransactions.mockImplementation((id) => (id === 'A' ? slowA.promise : fastB.promise));

    const { result, rerender } = renderHook(({ portfolio }) => useTransactions(portfolio), {
      initialProps: { portfolio: { id: 'A' } },
    });
    rerender({ portfolio: { id: 'B' } });

    await act(async () => {
      fastB.resolve({ success: true, transactions: [plainTx('tb', 'usd')] });
    });
    await waitFor(() => expect(result.current.transactions.map((t) => t.id)).toEqual(['tb']));

    // A's response lands late — it must not replace B's transactions
    await act(async () => {
      slowA.resolve({ success: true, transactions: [plainTx('ta', 'gold_18k')] });
    });
    expect(result.current.transactions.map((t) => t.id)).toEqual(['tb']);
    expect(result.current.loadingTransactions).toBe(false);
  });

  it('clears the previous portfolio rows while the next one is loading', async () => {
    const pendingB = deferred();
    getTransactions.mockImplementation((id) =>
      id === 'A' ? Promise.resolve({ success: true, transactions: [plainTx('ta', 'usd')] }) : pendingB.promise
    );

    const { result, rerender } = renderHook(({ portfolio }) => useTransactions(portfolio), {
      initialProps: { portfolio: { id: 'A' } },
    });
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    rerender({ portfolio: { id: 'B' } });
    await waitFor(() => expect(result.current.transactions).toHaveLength(0));
  });

  it("never reuses one vault's key for another encrypted portfolio", async () => {
    getTransactions.mockResolvedValue({ success: true, transactions: [] });
    const vaultA = await makeVaultPortfolio('A', 'pass-a');
    const vaultB = await makeVaultPortfolio('B', 'pass-b');
    saveVaultPassphraseToSession('A', 'pass-a');

    const { result, rerender } = renderHook(({ portfolio }) => useTransactions(portfolio), {
      initialProps: { portfolio: vaultA },
    });
    await waitFor(() => expect(result.current.isVaultLocked).toBe(false));

    rerender({ portfolio: vaultB });
    expect(result.current.isVaultLocked).toBe(true);
    expect(result.current.activeVaultKey).toBeNull();
    await expect(result.current.addTransaction({ assetId: 'usd', quantity: 1 })).rejects.toThrow();
  });

  it('locks again once the vault passphrase is cleared', async () => {
    getTransactions.mockResolvedValue({ success: true, transactions: [] });
    const vaultA = await makeVaultPortfolio('A', 'pass-a');
    saveVaultPassphraseToSession('A', 'pass-a');

    const { result, rerender } = renderHook(({ portfolio }) => useTransactions(portfolio), {
      initialProps: { portfolio: vaultA },
    });
    await waitFor(() => expect(result.current.isVaultLocked).toBe(false));

    clearVaultPassphraseFromSession('A');
    rerender({ portfolio: { ...vaultA } });
    expect(result.current.isVaultLocked).toBe(true);
  });
});

describe('useHoldings — switching portfolios', () => {
  it('ignores a slow response for a portfolio the user already switched away from', async () => {
    const slowA = deferred();
    const fastB = deferred();
    getPortfolio.mockImplementation((id) => (id === 'A' ? slowA.promise : fastB.promise));

    const portfolioA = { id: 'A' };
    const portfolioB = { id: 'B' };
    const { result, rerender } = renderHook(({ portfolio }) => useHoldings(portfolio), {
      initialProps: { portfolio: portfolioA },
    });
    rerender({ portfolio: portfolioB });

    await act(async () => {
      fastB.resolve({ success: true, holdings: [{ id: 'hb', assetId: 'usd', amount: 1 }] });
    });
    await waitFor(() => expect(result.current.holdings.map((h) => h.id)).toEqual(['hb']));

    await act(async () => {
      slowA.resolve({ success: true, holdings: [{ id: 'ha', assetId: 'gold_18k', amount: 1 }] });
    });
    expect(result.current.holdings.map((h) => h.id)).toEqual(['hb']);
    expect(result.current.loadingHoldings).toBe(false);
  });
});
