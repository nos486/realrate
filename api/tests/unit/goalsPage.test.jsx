// @vitest-environment happy-dom
/**
 * goalsPage.test.jsx — The goals page: the headline figures, each card's saved amount, percent
 * and next step (a linked portfolio's value counts), a deposit from the form, and a new goal
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render as rtlRender, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const store = vi.hoisted(() => ({ goals: [], saveGoal: null }));
store.saveGoal = vi.fn(async (input, existing) => ({ ...existing, ...input }));

vi.mock('../../../web/src/features/goals/hooks/useGoals.js', () => ({
  useGoals: () => ({
    goals: store.goals, vaultLocked: false, loading: false, submitting: false, error: null,
    clearError: vi.fn(), fetchGoals: vi.fn(), saveGoal: store.saveGoal, deleteGoal: vi.fn(),
  }),
}));
vi.mock('../../../web/src/features/goals/hooks/usePortfolioValues.js', () => ({
  usePortfolioValues: () => ({ portfolios: [{ id: 'pf_1', name: 'اصلی' }], valueOf: (id) => (id === 'pf_1' ? 300_000_000 : 0), loading: false }),
}));
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }) }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({
  useFeedback: () => ({ confirm: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }),
}));
vi.mock('../../../web/src/shared/utils/dates.js', async (orig) => ({ ...(await orig()), todayIso: () => '2026-06-01' }));

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
const { default: GoalsPage } = await import('../../../web/src/features/goals/components/GoalsPage.jsx');

const house = { id: 'goal_a', name: 'پیش‌پرداخت خانه', icon: 'Home', targetAmount: 1_000_000_000, targetDate: '2026-12-01', portfolioId: 'pf_1', deposits: [{ id: 'd1', date: '2026-05-20', amount: 100_000_000 }], createdAt: '2026-01-01T00:00:00Z' };
const trip = { id: 'goal_b', name: 'سفر', icon: 'Plane', targetAmount: 50_000_000, targetDate: '', portfolioId: '', deposits: [{ id: 'd2', date: '2026-05-20', amount: 50_000_000 }], createdAt: '2026-02-01T00:00:00Z' };

beforeEach(() => {
  store.goals = [house, trip];
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('the goals page', () => {
  it('shows each goal with what is saved, the portfolio included, and its percent', () => {
    render(<GoalsPage />);
    const houseCard = screen.getByText('پیش‌پرداخت خانه').closest('li');
    // 100M deposited + 300M portfolio = 400M of 1,000M
    expect(within(houseCard).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40');
    expect(houseCard.textContent).toContain('۴۰٪');
    const tripCard = screen.getByText('سفر').closest('li');
    expect(within(tripCard).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('lists the goal with a day first and the reached one last', () => {
    render(<GoalsPage />);
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names.indexOf('پیش‌پرداخت خانه')).toBeLessThan(names.indexOf('سفر'));
  });

  it('adds a deposit to a goal', async () => {
    render(<GoalsPage />);
    const card = screen.getByText('پیش‌پرداخت خانه').closest('li');
    fireEvent.click(within(card).getByLabelText('واریز'));
    fireEvent.change(await screen.findByPlaceholderText('۰'), { target: { value: '5000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت واریز' }));
    await waitFor(() => expect(store.saveGoal).toHaveBeenCalled());
    const [input, existing] = store.saveGoal.mock.calls[0];
    expect(existing.id).toBe('goal_a');
    expect(input.deposits).toHaveLength(2);
    expect(input.deposits[1]).toMatchObject({ amount: 5_000_000, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('creates a goal from the form', async () => {
    store.goals = [];
    render(<GoalsPage />);
    expect(screen.getByText('هنوز هدفی ثبت نکرده‌اید')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /هدف جدید/ })[0]);
    fireEvent.change(await screen.findByPlaceholderText('۰'), { target: { value: '200000000' } });
    fireEvent.change(screen.getByLabelText(/نام هدف/), { target: { value: 'ماشین' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن هدف' }));
    await waitFor(() => expect(store.saveGoal).toHaveBeenCalled());
    expect(store.saveGoal.mock.calls[0][0]).toMatchObject({ name: 'ماشین', targetAmount: 200_000_000, deposits: [] });
  });
});
