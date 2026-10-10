// @vitest-environment happy-dom
/**
 * expenseDollarForm.test.jsx — a foreign expense's rate on its day comes from the price history:
 * shown under the amount with the tomans it makes, never typed, never stored (an older record's
 * stored rate is not sent back, so saving drops it); a toman expense shows no rate
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));
const history = vi.hoisted(() => ({ priceOnDay: vi.fn(async () => 100_000) }));
vi.mock('../../../web/src/features/market/dailyHistory.js', async (importOriginal) => ({
  ...(await importOriginal()),
  priceOnDay: history.priceOnDay,
}));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  CURRENCY_ASSET: { USD: 'usd' },
  newSpendTxId: () => 'txs_1',
}));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));

const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');

afterEach(() => {
  cleanup();
  history.priceOnDay.mockReset();
  history.priceOnDay.mockImplementation(async () => 100_000);
});
const project = { id: 'exg_1', name: 'تعمیر خانه', type: 'project' };
const fa = (n) => n.toLocaleString('fa-IR');
const submit = () => fireEvent.submit(document.getElementById('expense-amount').closest('form'));
const dollars = (title, amount) => {
  fireEvent.click(screen.getByRole('tab', { name: 'دلار' }));
  fireEvent.change(document.getElementById('expense-title'), { target: { value: title } });
  fireEvent.change(document.getElementById('expense-amount'), { target: { value: amount } });
};

describe('the rate of a dollar expense', () => {
  it("shows today's rate and the tomans, with nothing to type and no rate sent", async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    dollars('هاست', '20');
    expect(document.getElementById('expense-usd-rate')).toBeNull();
    await waitFor(() => expect(document.body.textContent).toMatch(new RegExp(fa(125_000))));
    expect(document.body.textContent).toMatch(new RegExp(fa(2_500_000)));
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const sent = onSubmit.mock.calls[0][0];
    expect(sent).toMatchObject({ currency: 'USD', amount: 20 });
    expect(sent).not.toHaveProperty('usdRate');
    expect(sent).not.toHaveProperty('rate');
  });

  it("a past day reads that day's rate from the history", async () => {
    history.priceOnDay.mockResolvedValue(61_500);
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    dollars('هاست', '10');
    fireEvent.change(document.querySelector('.date-text-input'), { target: { value: '1403/01/15' } });
    await waitFor(() => expect(history.priceOnDay).toHaveBeenCalledWith('usd', '2024-04-03'));
    await waitFor(() => expect(document.body.textContent).toMatch(new RegExp(fa(615_000))));
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ date: '2024-04-03' });
  });

  it('an older record\'s stored rate is not sent back (saving drops it: the history is used)', async () => {
    const onSubmit = vi.fn(async () => {});
    const expense = { id: 'exp_1', title: 'هاست', amount: 10, currency: 'USD', date: '2024-04-03', usdRate: 58_000, groupId: 'exg_1' };
    render(<ExpenseForm group={project} expense={expense} usdToman={125_000} onSubmit={onSubmit} onClose={() => {}} />);
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('usdRate');
  });

  it('says so when the history has no rate for that day', async () => {
    history.priceOnDay.mockResolvedValue(null);
    render(<ExpenseForm group={project} usdToman={125_000} onSubmit={vi.fn()} onClose={() => {}} />);
    dollars('هاست', '10');
    fireEvent.change(document.querySelector('.date-text-input'), { target: { value: '1390/01/15' } });
    await waitFor(() => expect(document.body.textContent).toMatch(/در تاریخچه‌ی قیمت نیست/));
  });
});

describe('a toman expense', () => {
  it('shows no rate', () => {
    const expense = { id: 'exp_3', title: 'کاشی', amount: 1_000_000, currency: 'IRT', date: '2024-04-03', groupId: 'exg_1' };
    render(<ExpenseForm group={project} expense={expense} usdToman={125_000} onSubmit={vi.fn()} onClose={() => {}} />);
    expect(document.body.textContent).not.toMatch(/نرخ دلار همان روز/);
  });
});
