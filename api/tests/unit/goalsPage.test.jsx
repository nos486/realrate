// @vitest-environment happy-dom
/**
 * goalsPage.test.jsx — The goals page: the headline figures, each card's saved amount, percent
 * and next step (a linked portfolio's value counts), a deposit from the form, and a new goal
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render as rtlRender, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pickRow } from '../helpers/entryForm.js';

const store = vi.hoisted(() => ({ goals: [], saveGoal: null }));
store.saveGoal = vi.fn(async (input, existing) => ({ ...existing, ...input }));

vi.mock('../../../web/src/features/goals/hooks/useGoals.js', () => ({
  useGoals: () => ({
    goals: store.goals, vaultLocked: false, loading: false, submitting: false, error: null,
    clearError: vi.fn(), fetchGoals: vi.fn(), saveGoal: store.saveGoal, deleteGoal: vi.fn(),
  }),
}));
vi.mock('../../../web/src/features/goals/hooks/useGoalProgress.js', async () => {
  const { goalProgress } = await import('../../src/domain/goalDocument.js');
  return {
    useGoalProgress: (goals) => ({
      // The portfolio asset is worth 300M tomans to the goal that reserved it
      progressOf: (goal) => goalProgress(goal, { today: '2026-06-01', rates: { usdToman: 100_000 }, allocations: (goal.allocations || []).map((a) => ({ date: a.date, toman: 300_000_000 })) }),
      resolved: { leftOf: () => 4 },
      assets: [{ key: 'pf_1|gold18', portfolioId: 'pf_1', portfolioName: 'اصلی', assetId: 'gold18', assetName: 'طلا', unit: 'گرم', amount: 10, unitPrice: 5_000_000, value: 50_000_000 }],
      portfolios: [{ id: 'pf_1', name: 'اصلی' }], rates: {}, loading: false, today: '2026-06-01', goals,
    }),
  };
});
vi.mock('../../../web/src/features/demo/index.js', () => ({ useDemo: () => ({ readOnly: false }) }));
vi.mock('../../../web/src/shared/ui/FeedbackProvider.jsx', () => ({
  useFeedback: () => ({ confirm: vi.fn(async () => true), toast: { success: vi.fn(), error: vi.fn() } }),
}));
vi.mock('../../../web/src/shared/utils/dates.js', async (orig) => ({ ...(await orig()), todayIso: () => '2026-06-01' }));

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);
const { default: GoalsPage } = await import('../../../web/src/features/goals/components/GoalsPage.jsx');

const house = { id: 'goal_a', name: 'پیش‌پرداخت خانه', icon: 'Home', targetAmount: 1_000_000_000, targetDate: '2026-12-01', currency: 'IRT', allocations: [{ id: 'a1', date: '2026-05-21', portfolioId: 'pf_1', assetId: 'gold18', assetName: 'طلا', unit: 'گرم', mode: 'amount', value: 6 }], deposits: [{ id: 'd1', date: '2026-05-20', amount: 100_000_000, currency: 'IRT' }], createdAt: '2026-01-01T00:00:00Z' };
const trip = { id: 'goal_b', name: 'سفر', icon: 'Plane', targetAmount: 50_000_000, targetDate: '', currency: 'IRT', allocations: [], deposits: [{ id: 'd2', date: '2026-05-20', amount: 50_000_000, currency: 'IRT' }], createdAt: '2026-02-01T00:00:00Z' };

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
    // 100M deposited + 300M of the reserved asset = 400M of 1,000M
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
    expect(input.allocations).toHaveLength(1);
    expect(input.deposits[1]).toMatchObject({ amount: 5_000_000, currency: 'IRT', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });

  it('reserves a percent of a portfolio asset for a goal', async () => {
    render(<GoalsPage />);
    const card = screen.getByText('سفر').closest('li');
    fireEvent.click(within(card).getByLabelText('واریز'));
    fireEvent.click(await screen.findByRole('tab', { name: 'از پورتفو' }));
    pickRow('دارایی', 'طلا · اصلی');
    fireEvent.click(screen.getByRole('tab', { name: 'درصد' }));
    fireEvent.change(screen.getByPlaceholderText('۰'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'اختصاص به هدف' }));
    await waitFor(() => expect(store.saveGoal).toHaveBeenCalled());
    const [input] = store.saveGoal.mock.calls[0];
    expect(input.allocations).toHaveLength(1);
    expect(input.allocations[0]).toMatchObject({ portfolioId: 'pf_1', assetId: 'gold18', mode: 'percent', value: 20 });
  });

  it('refuses to reserve more of an asset than is free', async () => {
    render(<GoalsPage />);
    const card = screen.getByText('سفر').closest('li');
    fireEvent.click(within(card).getByLabelText('واریز'));
    fireEvent.click(await screen.findByRole('tab', { name: 'از پورتفو' }));
    pickRow('دارایی', 'طلا · اصلی');
    // 10 grams held, 6 already reserved by the other goal: 4 are free
    fireEvent.change(screen.getByPlaceholderText('۰'), { target: { value: '5' } });
    expect(screen.getByRole('alert').textContent).toMatch(/آزاد/);
    expect(screen.getByRole('button', { name: 'اختصاص به هدف' }).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('۰'), { target: { value: '4' } });
    expect(screen.getByRole('button', { name: 'اختصاص به هدف' }).disabled).toBe(false);
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
