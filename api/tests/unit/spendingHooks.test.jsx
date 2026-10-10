// @vitest-environment happy-dom
/**
 * spendingHooks.test.jsx — The pages that move money record it in the expenses: the subscriptions
 * list records the payments each is due when it loads and when one is saved (useSubscriptions);
 * the loans page records an installment paid and an extra payment, and removes the expense when
 * an installment is marked unpaid (useLoanDetail). Not without the expenses feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  auth: { user: { id: 'u1', features: ['expenses'] } },
  vault: { status: 'unlocked', epoch: 1 },
  subs: [],
  recordSubscriptionPayments: vi.fn(async () => null),
  recordInstallmentPayments: vi.fn(async () => {}),
  removeInstallmentPayment: vi.fn(async () => {}),
  recordExtraPayment: vi.fn(async () => {}),
  loan: null,
}));

vi.mock('../../../web/src/features/auth/index.js', () => ({ useAuth: () => m.auth }));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => m.vault }));
vi.mock('../../../web/src/shared/refresh/pageRefresh.js', () => ({ useRefreshHandler: () => {}, refreshScopes: async () => {} }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ isDemoReadOnly: () => false }));
vi.mock('../../../web/src/shared/utils/dates.js', () => ({ todayIso: () => '2026-04-01' }));
vi.mock('../../../web/src/shared/vault/spendingRecords.js', () => ({
  recordSubscriptionPayments: m.recordSubscriptionPayments,
  recordInstallmentPayments: m.recordInstallmentPayments,
  removeInstallmentPayment: m.removeInstallmentPayment,
  recordExtraPayment: m.recordExtraPayment,
}));
vi.mock('../../../web/src/shared/vault/vaultSubscriptions.js', () => ({
  getSubscriptions: async () => ({ success: true, subscriptions: m.subs }),
  saveSubscription: async (input, existing) => ({ success: true, subscription: { id: existing?.id || 'sub_new', ...existing, ...input } }),
  deleteSubscription: vi.fn(),
}));
vi.mock('../../../web/src/features/loans/api/loanApi.js', () => ({
  getLoanDetail: async () => ({ success: true, loan: m.loan }),
  getLoanExtraPayments: async () => ({ success: true, extraPayments: [] }),
  markInstallmentPaid: async (loanId, id, details) => ({
    success: true,
    installment: { id, paidDate: details.paidDate, paidAmount: 4_000_000 },
    cascadedInstallments: [{ id: 'inst_1', paidDate: details.paidDate, paidAmount: 4_000_000 }],
  }),
  unmarkInstallmentPaid: async () => ({ success: true }),
  bulkDistributeInstallments: vi.fn(),
  addLoanExtraPayment: async (loanId, data) => ({ success: true, extraPayment: { id: 'xp_1', ...data } }),
}));

const { useSubscriptions } = await import('../../../web/src/features/subscriptions/hooks/useSubscriptions.js');
const { useLoanDetail } = await import('../../../web/src/features/loans/hooks/useLoanDetail.js');

beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { user: { id: 'u1', features: ['expenses'] } };
  m.subs = [{ id: 'sub_1', name: 'ChatGPT', status: 'active', autoRenew: true }];
  m.loan = {
    id: 'loan_1', title: 'وام مسکن',
    installments: [{ id: 'inst_1', isPaid: false }, { id: 'inst_2', isPaid: true, paidDate: '2026-03-05', paidAmount: 4_000_000 }, { id: 'inst_3', isPaid: false }],
  };
});

describe('subscriptions', () => {
  it('records what each is due when the list loads, and when one is saved', async () => {
    m.recordSubscriptionPayments.mockImplementationOnce(async (sub) => ({ ...sub, lastPaidOn: '2026-03-13' }));
    const { result } = renderHook(() => useSubscriptions());
    await waitFor(() => expect(result.current.subscriptions[0]?.lastPaidOn).toBe('2026-03-13'));
    expect(m.recordSubscriptionPayments).toHaveBeenCalledWith(expect.objectContaining({ id: 'sub_1' }), '2026-04-01', expect.any(Object));

    await act(() => result.current.saveSubscription({ name: 'Spotify', status: 'active' }));
    expect(m.recordSubscriptionPayments).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'sub_new', name: 'Spotify' }), '2026-04-01', expect.any(Object));
  });

  it('records nothing without the expenses feature', async () => {
    m.auth = { user: { id: 'u1', features: [] } };
    const { result } = renderHook(() => useSubscriptions());
    await waitFor(() => expect(result.current.subscriptions).toHaveLength(1));
    expect(m.recordSubscriptionPayments).not.toHaveBeenCalled();
  });
});

describe('the loans page', () => {
  it('an installment paid records it and the earlier ones paid with it; unpaid removes it', async () => {
    const { result } = renderHook(() => useLoanDetail('loan_1'));
    await waitFor(() => expect(result.current.loan?.id).toBe('loan_1'));
    await act(() => result.current.markPaid('inst_3', { paidDate: '2026-04-01', cascade: true }));
    expect(m.recordInstallmentPayments).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'loan_1', title: 'وام مسکن' }),
      [expect.objectContaining({ id: 'inst_3' }), expect.objectContaining({ id: 'inst_1' })],
    );
    await act(() => result.current.unmarkPaid('inst_2'));
    expect(m.removeInstallmentPayment).toHaveBeenCalledWith('loan_1', 'inst_2', '2026-03-05');
  });

  it('an extra payment is recorded too', async () => {
    const { result } = renderHook(() => useLoanDetail('loan_1'));
    await waitFor(() => expect(result.current.loan?.id).toBe('loan_1'));
    await act(() => result.current.addExtraPayment({ amount: 10_000_000, paymentDate: '2026-04-01' }));
    expect(m.recordExtraPayment).toHaveBeenCalledWith(expect.objectContaining({ id: 'loan_1' }), expect.objectContaining({ id: 'xp_1', amount: 10_000_000 }));
  });
});
