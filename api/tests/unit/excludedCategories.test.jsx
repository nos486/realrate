// @vitest-environment happy-dom
/**
 * excludedCategories.test.jsx — categories left out of the totals («مدیریت نقدینگی»,
 * «سرمایه‌گذاری»): listed with a badge, not counted, and hidden on request
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

const today = new Date().toISOString().slice(0, 10);
const data = vi.hoisted(() => ({ expenses: [] }));

vi.mock('../../../web/src/shared/vault/vaultApi.js', () => ({ listVaultRecords: vi.fn(async () => ({ records: [] })) }));
vi.mock('../../../web/src/shared/vault/vaultRecordMeta.js', () => ({ putRecord: vi.fn() }));
vi.mock('../../../web/src/shared/vault/vaultStore.js', () => ({
  encryptVaultRecord: vi.fn(async (plain) => JSON.stringify(plain)),
  decryptVaultRecord: vi.fn(async (payload) => JSON.parse(payload)),
}));
vi.mock('../../../web/src/shared/vault/useVault.js', () => ({ useVault: () => ({ status: 'unlocked', epoch: 1 }) }));
vi.mock('../../../web/src/features/expenses/hooks/useDailyExpenses.js', () => ({
  useDailyExpenses: () => ({
    expenses: data.expenses,
    previousExpenses: [],
    range: { from: today.slice(0, 8) + '01', days: 30 },
    budgets: {},
    loading: false,
    submitting: false,
    deletingId: null,
    error: null,
    clearError: () => {},
    fetchMonth: () => {},
    saveExpense: vi.fn(),
    saveBudgets: vi.fn(),
    deleteExpense: vi.fn(),
  }),
}));
vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({ useAccounts: () => ({ accounts: [] }) }));
vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }) }));
vi.mock('../../../web/src/shared/hooks/useQuickAddParam.js', () => ({ useQuickAddParam: () => {} }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({ useFeedback: () => ({ confirm: vi.fn(), toast: {} }) }));

const { default: DailyExpensesView } = await import('../../../web/src/features/expenses/components/DailyExpensesView.jsx');

const expense = (id, category, amount) => ({ id, groupId: 'daily', title: `t-${id}`, category, amount, currency: 'IRT', date: today, createdAt: today });

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  data.expenses = [
    expense('e1', 'groceries', 1_000_000),
    expense('e2', 'cash_management', 50_000_000),
    expense('e3', 'investment', 20_000_000),
  ];
});
afterEach(cleanup);

describe('daily expenses with categories left out of the totals', () => {
  it('counts only spending, lists the rest with a badge and their own sums', () => {
    render(<DailyExpensesView />);
    // Only the groceries: not the 50M moved between accounts nor the 20M invested
    const total = document.querySelector('.expense-month-total strong').textContent.replace(/[^۰-۹0-9]/g, '');
    expect(total).toMatch(/^(۱۰۰۰۰۰۰|1000000)$/);
    expect(document.body.textContent).toMatch(/خارج از جمع/);
    expect(document.querySelectorAll('.excluded-badge').length).toBeGreaterThanOrEqual(2);
    const side = [...document.querySelectorAll('.expense-side-card')].find((el) => el.textContent.includes('این دسته‌ها هزینه حساب نمی‌شوند'));
    expect(side.textContent).toMatch(/مدیریت نقدینگی/);
    expect(side.textContent).toMatch(/سرمایه‌گذاری/);
  });

  it('hides them from the list on request, and remembers it', () => {
    render(<DailyExpensesView />);
    expect(screen.getAllByText(/^t-e/).length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByTitle(/پنهان کردن سرمایه‌گذاری/));
    expect(screen.queryAllByText('t-e2')).toHaveLength(0);
    expect(screen.getAllByText('t-e1').length).toBeGreaterThan(0);
    expect(localStorage.getItem('realrate_show_excluded_expense')).toBe('0');
    // The icon button says how many are hidden (its name and a small count on it)
    expect(screen.getByRole('button', { name: /خارج از جمع: .* مورد پنهان/ })).toBeTruthy();
  });
});
