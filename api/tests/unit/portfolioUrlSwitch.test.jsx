// @vitest-environment happy-dom
/**
 * portfolioUrlSwitch.test.jsx — the portfolio the address names (/portfolio/:id) is the open one:
 * it is picked when the list loads, and followed when the address changes (back / forward)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';

const mockAuth = { user: { id: 'u1' } };
vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => mockAuth }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ epoch: 0 }) }));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({ isVaultOn: () => false, createPortfolioKey: vi.fn() }));
vi.mock('../../../web/src/shared/refresh/pageRefresh.js', () => ({ useRefreshHandler: vi.fn() }));
vi.mock('../../../web/src/features/portfolio/api/portfolioApi.js', () => ({
  getPortfolios: vi.fn(),
  createPortfolio: vi.fn(),
  updatePortfolio: vi.fn(),
  deletePortfolio: vi.fn(),
}));

import { getPortfolios } from '../../../web/src/features/portfolio/api/portfolioApi.js';
import { usePortfolio } from '../../../web/src/features/portfolio/hooks/usePortfolio.js';

const LIST = [
  { id: 'p_default', name: 'اصلی', isDefault: true },
  { id: 'p_gold', name: 'طلا' },
  { id: 'p_usd', name: 'دلار' },
];

beforeEach(() => {
  localStorage.clear();
  getPortfolios.mockReset();
  getPortfolios.mockResolvedValue({ success: true, portfolios: LIST });
});
afterEach(cleanup);

describe('usePortfolio and the address', () => {
  it('opens the portfolio the address names, over the default', async () => {
    const { result } = renderHook(() => usePortfolio('p_gold'));
    await waitFor(() => expect(result.current.activePortfolio?.id).toBe('p_gold'));
  });

  it('follows the address when it changes, without reading the list again', async () => {
    const { result, rerender } = renderHook(({ id }) => usePortfolio(id), { initialProps: { id: 'p_gold' } });
    await waitFor(() => expect(result.current.activePortfolio?.id).toBe('p_gold'));
    const reads = getPortfolios.mock.calls.length;

    rerender({ id: 'p_usd' });
    await waitFor(() => expect(result.current.activePortfolio?.id).toBe('p_usd'));
    rerender({ id: 'p_gold' });
    await waitFor(() => expect(result.current.activePortfolio?.id).toBe('p_gold'));
    expect(getPortfolios.mock.calls.length).toBe(reads);
  });

  it('keeps the open portfolio when the address names none', async () => {
    const { result, rerender } = renderHook(({ id }) => usePortfolio(id), { initialProps: { id: 'p_usd' } });
    await waitFor(() => expect(result.current.activePortfolio?.id).toBe('p_usd'));
    rerender({ id: null });
    expect(result.current.activePortfolio?.id).toBe('p_usd');
  });
});
