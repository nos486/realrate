// @vitest-environment happy-dom
/**
 * subscriptionsPage.test.jsx — The subscriptions page: the monthly total (dollars in tomans at
 * today's rate), each card's days until renewal and the bar of its period left, its menu (not
 * cut off by the list's card), a new subscription from the form, and «ثبت پرداخت» — an everyday expense in
 * «اینترنت و اشتراک‌ها» in the subscription's currency, naming it; one renewed by hand then runs a
 * cycle longer
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render as rtlRender, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const store = vi.hoisted(() => ({ subscriptions: [], saveSubscription: null, saveExpense: null }));
store.saveSubscription = vi.fn(async (input, existing) => ({ ...existing, ...input }));
store.saveExpense = vi.fn(async (input) => ({ expense: { id: 'exp_1', ...input } }));

vi.mock('../../../web/src/features/subscriptions/context/SubscriptionsContext.jsx', () => ({
  useSubscriptionsContext: () => ({
    subscriptions: store.subscriptions, vaultLocked: false, loading: false, submitting: false, error: null,
    clearError: vi.fn(), fetchSubscriptions: vi.fn(), saveSubscription: store.saveSubscription, deleteSubscription: vi.fn(),
  }),
}));
vi.mock('../../../web/src/shared/vault/vaultExpenses.js', () => ({
  ensureDailyGroup: async () => ({ id: 'grp_daily' }),
  getExpenseGroups: async () => ({ groups: [] }),
  saveExpense: (...a) => store.saveExpense(...a),
}));
vi.mock('../../../web/src/features/market/index.js', () => ({ usePricing: () => ({ getAssetPrice: (id) => (id === 'usd' ? 100_000 : 0) }) }));
vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({ loading: false, accounts: [{ id: 'acc_a', name: 'ملت', type: 'bank' }] }),
}));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }) }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({
  useFeedback: () => ({ confirm: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }),
}));
vi.mock('../../../web/src/shared/utils/dates.js', async (orig) => ({ ...(await orig()), todayIso: () => '2026-02-05' }));
// The expense form's own data
vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({ CURRENCY_ASSET: { USD: 'usd' }, newSpendTxId: () => 'txs', newLinkTxId: () => 'tx', rateOnDay: async () => 0 }));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));
vi.mock('../../../web/src/shared/categories/useCategories.js', async () => {
  const { categoryIcon } = await import('../../../web/src/shared/categories/categoryIcons.js');
  const { BUILTIN_CATEGORIES } = await import('../../src/domain/categoryDocument.js');
  return { useCategories: (kind) => BUILTIN_CATEGORIES[kind].map((c) => ({ ...c, Icon: categoryIcon(c.icon) })) };
});

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
const { default: SubscriptionsPage } = await import('../../../web/src/features/subscriptions/components/SubscriptionsPage.jsx');

// 2026-01-12 is 22 Dey 1404: renewals on the 22nd of each Shamsi month (next: 2026-02-11)
const chatgpt = { id: 'sub_a', name: 'ChatGPT', category: 'software', amount: 20, currency: 'USD', cycleMonths: 1, startDate: '2026-01-12', autoRenew: true, status: 'active', accountId: 'acc_a' };
const filimo = { id: 'sub_b', name: 'فیلیمو', category: 'video', amount: 150_000, currency: 'IRT', cycleMonths: 3, startDate: '2025-11-11', autoRenew: false, renewOn: '2026-02-03', status: 'active' };

beforeEach(() => {
  store.subscriptions = [chatgpt, filimo];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the subscriptions page', () => {
  it('shows the monthly total of what runs, dollars in tomans', () => {
    render(<SubscriptionsPage />);
    // ChatGPT: $20 × 100,000; فیلیمو ran out (renewed by hand, not renewed) and is not counted
    // The monthly total and this month's renewals (ChatGPT renews on 2026-02-11)
    expect(screen.getAllByText('۲٬۰۰۰٬۰۰۰')).toHaveLength(2);
    expect(screen.getByText('تمام شده — تمدید نشده')).toBeTruthy();
    expect(screen.getByText('نزدیک تمدید')).toBeTruthy();
  });

  it('shows on each card the days until its renewal and how much of its period is left', () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText('۶ روز تا تمدید')).toBeTruthy();
    expect(screen.getByText('۲ روز از تمدید گذشته')).toBeTruthy();
    const bars = screen.getAllByRole('progressbar');
    expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['0', '20']);
    expect(screen.getByText('نزدیک‌ترین تمدید')).toBeTruthy();
  });

  it('opens a card\'s menu above the page, outside the list\'s clipping card', () => {
    render(<SubscriptionsPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'گزینه‌های بیشتر' })[0]);
    const menu = screen.getByRole('menu');
    expect(menu.parentElement).toBe(document.body);
    expect(menu.closest('.portfolio-table-card')).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'ویرایش' })).toBeTruthy();
  });

  it('records a renewal as an everyday expense in its currency, and moves one renewed by hand on', async () => {
    render(<SubscriptionsPage />);
    // The list puts the one run out first
    fireEvent.click(screen.getAllByText('ثبت پرداخت')[0]);
    const form = screen.getByText('ثبت هزینه روزمره').closest('form') || document.querySelector('form');
    fireEvent.submit(form);
    await waitFor(() => expect(store.saveExpense).toHaveBeenCalled());
    expect(store.saveExpense.mock.calls[0][0]).toMatchObject({
      groupId: 'grp_daily', subscriptionId: 'sub_b', category: 'subscriptions', title: 'فیلیمو', amount: 150_000, currency: 'IRT', date: '2026-02-05',
    });
    await waitFor(() => expect(store.saveSubscription).toHaveBeenCalled());
    const [change, existing] = store.saveSubscription.mock.calls[0];
    expect(existing.id).toBe('sub_b');
    // Paid on 2026-02-05 (16 Bahman), after it ran out: a new 3-month period, to 16 Ordibehesht
    expect(change).toEqual({ renewOn: '2026-05-06', lastPaidOn: '2026-02-05' });
  });

  it('a dollar subscription is paid in dollars', async () => {
    store.subscriptions = [chatgpt];
    render(<SubscriptionsPage />);
    fireEvent.click(screen.getByText('ثبت پرداخت'));
    fireEvent.submit(document.querySelector('form'));
    await waitFor(() => expect(store.saveExpense).toHaveBeenCalled());
    // (a dollar expense is paid from a portfolio's dollars, not an account: ExpenseForm)
    expect(store.saveExpense.mock.calls[0][0]).toMatchObject({ subscriptionId: 'sub_a', currency: 'USD', amount: 20, title: 'ChatGPT' });
    await waitFor(() => expect(store.saveSubscription).toHaveBeenCalledWith({ renewOn: '', lastPaidOn: expect.any(String) }, expect.objectContaining({ id: 'sub_a' })));
  });

  it('adds a subscription from the form', async () => {
    store.subscriptions = [];
    render(<SubscriptionsPage />);
    fireEvent.click(screen.getAllByText('اشتراک جدید')[0]);
    fireEvent.change(document.querySelector('#sub-name'), { target: { value: 'Spotify' } });
    fireEvent.change(document.querySelector('#sub-amount'), { target: { value: '6' } });
    fireEvent.click(screen.getByText('دلار'));
    fireEvent.click(screen.getByText('سالانه'));
    fireEvent.submit(document.querySelector('#sub-name').closest('form'));
    await waitFor(() => expect(store.saveSubscription).toHaveBeenCalled());
    expect(store.saveSubscription.mock.calls[0][0]).toMatchObject({ name: 'Spotify', amount: 6, currency: 'USD', cycleMonths: 12, autoRenew: true, status: 'active' });
  });
});
