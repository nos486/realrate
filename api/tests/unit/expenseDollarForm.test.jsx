// @vitest-environment happy-dom
/**
 * expenseDollarForm.test.jsx — a dollar expense's rate on its day comes from the price history
 * (shown, not stored); a typed rate is stored over it; a toman expense asks for no rate
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

describe('the dollar rate of a dollar expense', () => {
  const submit = () => fireEvent.submit(document.getElementById('expense-amount').closest('form'));
  const dollars = (title, amount) => {
    fireEvent.click(screen.getByRole('tab', { name: 'دلار' }));
    fireEvent.change(document.getElementById('expense-title'), { target: { value: title } });
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: amount } });
  };

  it("shows the day's rate and the tomans, and stores no rate of its own", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    dollars('هاست', '20');
    // The date picker starts on today: today's rate
    await waitFor(() => expect(document.getElementById('expense-usd-rate').placeholder).toMatch(/۱۲۵/));
    expect(document.getElementById('expense-usd-rate').value).toBe('');
    expect(document.body.textContent).toMatch(/۲٬۵۰۰٬۰۰۰|۲,۵۰۰,۰۰۰/);
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ currency: 'USD', amount: 20, usdRate: null });
  });

  it('a typed rate is stored and used instead', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    dollars('هاست', '20');
    fireEvent.change(document.getElementById('expense-usd-rate'), { target: { value: '100000' } });
    await waitFor(() => expect(document.body.textContent).toMatch(/نرخ واردشده به جای نرخ همان روز/));
    expect(document.body.textContent).toMatch(/۲٬۰۰۰٬۰۰۰|۲,۰۰۰,۰۰۰/);
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].usdRate).toBe(100_000);
  });

  it("changing the date reads that day's rate and drops a typed one", async () => {
    funds.rateOnDay.mockClear();
    funds.rateOnDay.mockResolvedValueOnce(61_500);
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    dollars('هاست', '10');
    fireEvent.change(document.getElementById('expense-usd-rate'), { target: { value: '90000' } });
    fireEvent.change(document.querySelector('.date-text-input'), { target: { value: '1403/01/15' } });
    await waitFor(() => expect(document.getElementById('expense-usd-rate').placeholder).toMatch(/۶۱/));
    expect(funds.rateOnDay).toHaveBeenCalledWith('usd', '2024-04-03');
    expect(document.getElementById('expense-usd-rate').value).toBe('');
    expect(document.body.textContent).toMatch(/۶۱۵٬۰۰۰|۶۱۵,۰۰۰/);
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ date: '2024-04-03', usdRate: null });
  });

  it("an edited expense whose saved rate is the day's own drops it; a different one is kept", async () => {
    funds.rateOnDay.mockResolvedValue(60_000);
    const onSubmit = vi.fn(async () => {});
    const expense = { id: 'exp_1', title: 'هاست', amount: 10, currency: 'USD', date: '2024-04-03', usdRate: 60_000, groupId: 'exg_1' };
    const { unmount } = render(<ExpenseForm group={project} expense={expense} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    await waitFor(() => expect(document.getElementById('expense-usd-rate').placeholder).toMatch(/۶۰/));
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].usdRate).toBeNull();
    unmount();

    const onSubmit2 = vi.fn(async () => {});
    render(<ExpenseForm group={project} expense={{ ...expense, usdRate: 58_000 }} usdToman={125_000} onSubmit={onSubmit2} onClose={() => {}} />);
    await waitFor(() => expect(document.getElementById('expense-usd-rate').placeholder).toMatch(/۶۰/));
    submit();
    await waitFor(() => expect(onSubmit2).toHaveBeenCalled());
    expect(onSubmit2.mock.calls[0][0].usdRate).toBe(58_000);
    funds.rateOnDay.mockReset();
    funds.rateOnDay.mockImplementation(async () => 100_000);
  });

  it('says so when the history has no rate for that day', async () => {
    funds.rateOnDay.mockResolvedValueOnce(null);
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={vi.fn()} onClose={() => {}} />);
    dollars('هاست', '10');
    fireEvent.change(document.querySelector('.date-text-input'), { target: { value: '1390/01/15' } });
    await waitFor(() => expect(document.body.textContent).toMatch(/در تاریخچه نیست/));
  });
});

describe('a toman expense', () => {
  it('asks for no rate, and drops one an older version stored', async () => {
    const onSubmit = vi.fn(async () => {});
    const expense = { id: 'exp_3', title: 'کاشی', amount: 1_000_000, currency: 'IRT', date: '2024-04-03', usdRate: 60_000, groupId: 'exg_1' };
    render(<ExpenseForm group={project} expense={expense} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    expect(document.getElementById('expense-usd-rate')).toBeNull();
    fireEvent.submit(document.getElementById('expense-amount').closest('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].usdRate).toBeNull();
  });
});
