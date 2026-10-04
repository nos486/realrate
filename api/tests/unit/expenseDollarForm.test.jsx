// @vitest-environment happy-dom
/**
 * expenseDollarForm.test.jsx — a project's toman expense asks (optionally) for the dollar's rate
 * on its day, fills it in from the price history, and shows the dollars and today's tomans;
 * everyday expenses don't ask
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));
const funds = vi.hoisted(() => ({ rateOnDay: vi.fn(async () => 100_000) }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  CURRENCY_ASSET: { USD: 'usd' },
  newSpendTxId: () => 'txs_1',
  rateOnDay: funds.rateOnDay,
}));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));

const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');

afterEach(cleanup);
const project = { id: 'exg_1', name: 'تعمیر خانه', type: 'project' };

describe('a project expense in dollars', () => {
  it('fills the day\'s rate from the history and shows the dollars and today\'s value', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.change(document.getElementById('expense-title'), { target: { value: 'کاشی' } });
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '50000000' } });
    // The date picker starts on today: today's rate
    await waitFor(() => expect(document.getElementById('expense-usd-rate').value).toMatch(/125/));
    fireEvent.change(document.getElementById('expense-usd-rate'), { target: { value: '100000' } });
    await waitFor(() => expect(document.body.textContent).toMatch(/۵۰۰\s*دلار/));
    expect(document.body.textContent).toMatch(/به نرخ امروز\s*۶۲٬۵۰۰٬۰۰۰|به نرخ امروز\s*۶۲,۵۰۰,۰۰۰/);
    fireEvent.submit(screen.getAllByText('ثبت هزینه').map((el) => el.closest('form')).find(Boolean));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ currency: 'IRT', amount: 50_000_000, usdRate: 100_000 });
  });

  it('is optional: cleared, the expense is saved without it', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.change(document.getElementById('expense-title'), { target: { value: 'دستمزد' } });
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '1000000' } });
    await waitFor(() => expect(document.getElementById('expense-usd-rate').value).not.toBe(''));
    fireEvent.change(document.getElementById('expense-usd-rate'), { target: { value: '' } });
    fireEvent.submit(screen.getAllByText('ثبت هزینه').map((el) => el.closest('form')).find(Boolean));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].usdRate).toBeNull();
  });

  it('changing the date fills that day\'s rate, also over a typed one', async () => {
    funds.rateOnDay.mockClear();
    funds.rateOnDay.mockResolvedValueOnce(61_500);
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={vi.fn()} onClose={() => {}} />);
    await waitFor(() => expect(document.getElementById('expense-usd-rate').value).toMatch(/125/));
    fireEvent.change(document.getElementById('expense-usd-rate'), { target: { value: '90000' } });
    fireEvent.change(document.querySelector('.date-text-input'), { target: { value: '1403/01/15' } });
    await waitFor(() => expect(document.getElementById('expense-usd-rate').value).toMatch(/61/));
    expect(funds.rateOnDay).toHaveBeenCalledWith('usd', '2024-04-03');
    expect(document.body.textContent).toMatch(/نرخ دلار همان روز/);
  });

  it('an edited expense keeps its saved rate until its date changes', async () => {
    funds.rateOnDay.mockClear();
    funds.rateOnDay.mockResolvedValueOnce(70_000);
    const expense = { id: 'exp_1', title: 'کاشی', amount: 1_000_000, currency: 'IRT', date: '2024-04-03', usdRate: 60_000, groupId: 'exg_1' };
    render(<ExpenseForm group={project} expense={expense} usdToman={125_000} onSubmit={vi.fn()} onClose={() => {}} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(document.getElementById('expense-usd-rate').value).toMatch(/60/);
    expect(funds.rateOnDay).not.toHaveBeenCalled();
    fireEvent.change(document.querySelector('.date-text-input'), { target: { value: '1403/02/01' } });
    await waitFor(() => expect(document.getElementById('expense-usd-rate').value).toMatch(/70/));
  });

  it('a dollar expense without a rate fills the rate of its day', async () => {
    funds.rateOnDay.mockClear();
    funds.rateOnDay.mockResolvedValueOnce(58_000);
    const expense = { id: 'exp_2', title: 'هاست', amount: 20, currency: 'USD', date: '2024-04-03', usdRate: null, groupId: 'exg_1' };
    render(<ExpenseForm group={project} expense={expense} usdToman={125_000} onSubmit={vi.fn()} onClose={() => {}} />);
    await waitFor(() => expect(document.getElementById('expense-usd-rate').value).toMatch(/58/));
    expect(funds.rateOnDay).toHaveBeenCalledWith('usd', '2024-04-03');
  });

  it('says so when the history has no rate for that day', async () => {
    funds.rateOnDay.mockResolvedValueOnce(null);
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={vi.fn()} onClose={() => {}} />);
    fireEvent.change(document.querySelector('.date-text-input'), { target: { value: '1390/01/15' } });
    await waitFor(() => expect(document.body.textContent).toMatch(/در تاریخچه نیست/));
    expect(document.getElementById('expense-usd-rate').value).toBe('');
  });

  it('everyday expenses in tomans do not ask', () => {
    render(<ExpenseForm daily onSubmit={vi.fn()} onClose={() => {}} />);
    expect(document.getElementById('expense-usd-rate')).toBeNull();
  });
});
