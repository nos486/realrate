// @vitest-environment happy-dom
/**
 * expensesPage.test.jsx — the expenses page: sections as chips with their totals, the selected
 * section's expenses in tomans and dollars, and the empty state
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

const state = { groups: [], expenses: [] };
vi.mock('../../../web/src/features/expenses/hooks/useExpenses.js', () => ({
  useExpenses: () => ({
    ...state,
    vaultLocked: false,
    loading: false,
    submitting: false,
    deletingId: null,
    error: null,
    clearError: vi.fn(),
    fetchAll: vi.fn(),
    saveGroup: vi.fn(),
    deleteGroup: vi.fn(),
    saveExpense: vi.fn(),
    deleteExpense: vi.fn(),
  }),
}));
vi.mock('../../../web/src/features/market/index.js', () => ({
  usePricing: () => ({ getAssetPrice: (id) => (id === 'usd' ? 100000 : 0), summary: {} }),
}));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }), isDemoReadOnly: () => false }));
vi.mock('../../../web/src/hooks/usePrivacyMode.js', () => ({ usePrivacyMode: () => false }));
vi.mock('../../../web/src/shared/vault/VaultUnlockCard.jsx', () => ({ default: () => null }));

const { FeedbackProvider } = await import('../../../web/src/shared/ui/FeedbackProvider.jsx');
const { default: ExpensesPage } = await import('../../../web/src/features/expenses/components/ExpensesPage.jsx');

const renderPage = (props = {}) => render(<FeedbackProvider><ExpensesPage {...props} /></FeedbackProvider>);

afterEach(() => {
  cleanup();
  state.groups = [];
  state.expenses = [];
});

describe('ExpensesPage', () => {
  it('invites to create the first section when there is none', () => {
    renderPage();
    expect(screen.getByText('هنوز بخشی نساخته‌اید')).toBeTruthy();
    fireEvent.click(screen.getByText('ساخت اولین بخش'));
    expect(screen.getByText('بخش هزینه جدید')).toBeTruthy();
  });

  it('shows the selected section with totals across tomans and dollars', () => {
    state.groups = [
      { id: 'exg_a', name: 'بازسازی', notes: 'آشپزخانه', createdAt: '2026-09-01T00:00:00Z' },
      { id: 'exg_b', name: 'سفر', notes: '', createdAt: '2026-09-02T00:00:00Z' },
    ];
    state.expenses = [
      { id: 'e1', groupId: 'exg_a', title: 'کاشی', amount: 2_000_000, currency: 'IRT', date: '2026-09-10', notes: '' },
      { id: 'e2', groupId: 'exg_a', title: 'هود', amount: 100, currency: 'USD', usdRate: null, date: '2026-09-12', notes: '' },
      { id: 'e3', groupId: 'exg_b', title: 'بلیت', amount: 5_000_000, currency: 'IRT', date: '2026-09-15', notes: '' },
    ];
    const onSelectGroup = vi.fn();
    renderPage({ groupId: 'exg_a', onSelectGroup });

    expect(screen.getByRole('heading', { name: 'بازسازی' })).toBeTruthy();
    expect(screen.getByText('آشپزخانه')).toBeTruthy();
    expect(screen.getAllByText('کاشی').length).toBeGreaterThan(0);
    expect(screen.queryByText('بلیت')).toBeNull();
    // 2,000,000 + 100 × 100,000 (today's rate) = 12,000,000
    expect(screen.getAllByText((12_000_000).toLocaleString('fa-IR')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /سفر/ }));
    expect(onSelectGroup).toHaveBeenCalledWith('exg_b');
  });

  it('opens the expense form for the selected section', () => {
    state.groups = [{ id: 'exg_a', name: 'بازسازی', notes: '', createdAt: '2026-09-01T00:00:00Z' }];
    renderPage({ groupId: 'exg_a' });
    fireEvent.click(screen.getByRole('button', { name: /ثبت هزینه/ }));
    expect(screen.getByText('در بخش «بازسازی»')).toBeTruthy();
    fireEvent.click(screen.getAllByText('دلار').map((el) => el.closest('button')).find(Boolean));
    expect(screen.getByText(/نرخ دلار در روز هزینه/)).toBeTruthy();
  });
});
