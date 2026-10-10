// @vitest-environment happy-dom
/**
 * chequeSettlement.test.jsx — A cheque's money follows its status on the cheques page
 * (features/cheques/hooks/useCheques.js): clearing it records an income or an expense for it, and
 * undoing the quick «پاس شد» (or another status) removes that record
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  stored: new Map(),
  settleCheque: vi.fn(async () => 'income'),
  unsettleCheque: vi.fn(async () => {}),
  auth: { user: { id: 'u1', features: ['expenses'] } },
  vault: { status: 'unlocked', epoch: 1 },
}));

// The same objects every render, as the real hooks give
vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => m.auth }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => m.vault }));
vi.mock('../../../web/src/shared/refresh/pageRefresh.js', () => ({ useRefreshHandler: () => {} }));
vi.mock('../../../web/src/shared/vault/recordLinks.js', () => ({ settleCheque: m.settleCheque, unsettleCheque: m.unsettleCheque }));
vi.mock('../../../web/src/features/cheques/api/chequeApi.js', () => ({
  getCheques: async () => ({ success: true, cheques: [...m.stored.values()] }),
  createCheque: vi.fn(),
  updateCheque: async (id, input) => {
    const cheque = { ...m.stored.get(id), ...input, id };
    m.stored.set(id, cheque);
    return { success: true, cheque };
  },
  deleteCheque: vi.fn(),
}));

const { useCheques } = await import('../../../web/src/features/cheques/hooks/useCheques.js');

const pending = {
  id: 'chq_1', direction: 'received', status: 'pending', amount: 3_000_000, dueDate: '2026-02-01', counterparty: 'شرکت',
  history: [{ status: 'pending', date: '2026-01-01', note: '' }], settlement: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  m.stored = new Map([[pending.id, pending]]);
});

describe('a cheque\'s money follows its status', () => {
  it('clearing records it; undoing the quick clear removes it', async () => {
    const { result } = renderHook(() => useCheques());
    await waitFor(() => expect(result.current.cheques).toHaveLength(1));

    await act(() => result.current.changeStatus(pending, 'cleared', '2026-02-03'));
    expect(m.settleCheque).toHaveBeenCalledWith(expect.objectContaining({ id: 'chq_1', status: 'cleared' }), { date: '2026-02-03', expenses: true });

    // The income recorded it: the stored cheque points at it (recordLinks does this on save)
    m.stored.set('chq_1', { ...m.stored.get('chq_1'), settlement: { side: 'income', id: 'inc_1' } });
    await act(() => result.current.fetchCheques());
    await act(() => result.current.restoreCheque(pending));
    expect(m.unsettleCheque).toHaveBeenCalledWith(expect.objectContaining({ id: 'chq_1', status: 'pending', settlement: { side: 'income', id: 'inc_1' } }));
  });

  it('a status change that doesn\'t clear or unclear it records nothing', async () => {
    const { result } = renderHook(() => useCheques());
    await waitFor(() => expect(result.current.cheques).toHaveLength(1));
    await act(() => result.current.changeStatus(pending, 'deposited', '2026-02-02'));
    expect(m.settleCheque).not.toHaveBeenCalled();
    expect(m.unsettleCheque).not.toHaveBeenCalled();
  });
});
