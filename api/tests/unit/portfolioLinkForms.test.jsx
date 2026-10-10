// @vitest-environment happy-dom
/**
 * portfolioLinkForms.test.jsx — «سرمایه‌گذاری» in the expense form adds the asset to a portfolio;
 * «فروش دارایی» in the income form takes it out of one (searching what that portfolio holds)
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../../web/src/features/loans/context/LoansContext.jsx', () => ({ useOptionalLoans: () => [] }));
vi.mock('../../../web/src/shared/vault/portfolioFunds.js', () => ({
  CURRENCY_ASSET: { USD: 'usd' },
  newSpendTxId: () => 'txs_1',
  newLinkTxId: () => 'txl_new',
  rateOnDay: vi.fn(async () => null),
  listLinkablePortfolios: vi.fn(async () => [{ id: 'pf_a', name: 'اصلی', isDefault: true }, { id: 'pf_b', name: 'طلا' }]),
  listPortfolioPositions: vi.fn(async () => [
    { portfolioId: 'pf_a', portfolioName: 'اصلی', positions: [
      { assetId: 'full_coin', assetName: 'سکه امامی', unit: 'عدد', amount: 3 },
      { assetId: 'usd', assetName: 'دلار', unit: 'دلار', amount: 0 },
    ] },
  ]),
}));
vi.mock('../../../web/src/shared/vault/useAssetFunds.js', () => ({ useAssetFunds: () => ({ funds: [], loading: false }) }));
vi.mock('../../../web/src/features/market/context/PricingContext.jsx', () => ({
  usePricing: () => ({
    searchAssets: (q) => [
      { id: 'gold_18k', name: 'طلای ۱۸ عیار', category: 'gold_coin', unit: 'گرم', price: 9_000_000 },
      { id: 'usd', name: 'دلار آمریکا', category: 'currency', unit: 'دلار', price: 100_000 },
    ].filter((a) => a.name.includes(q)),
  }),
}));

const { default: ExpenseForm } = await import('../../../web/src/features/expenses/components/ExpenseForm.jsx');
const { default: IncomeForm } = await import('../../../web/src/features/incomes/components/IncomeForm.jsx');

afterEach(cleanup);
const submitOf = (label) => screen.getAllByText(label).map((el) => el.closest('form')).find(Boolean);

describe('an investment expense', () => {
  it('searches the asset, takes a quantity, and saves the purchase link', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm daily onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.click(screen.getByText('سرمایه‌گذاری'));
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '18000000' } });
    const toggle = await screen.findByLabelText(/افزودن به پورتفو/);
    await waitFor(() => expect(toggle.disabled).toBe(false));
    fireEvent.click(toggle);
    // Not complete yet: no asset
    expect(document.querySelector('button[type="submit"]').disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('جستجوی دارایی'), { target: { value: 'طلا' } });
    fireEvent.click(screen.getByText('طلای ۱۸ عیار'));
    fireEvent.change(document.getElementById('portfolio-link-qty-buy'), { target: { value: '2' } });
    await waitFor(() => expect(document.body.textContent).toMatch(/هر گرم ≈ ۹٬۰۰۰٬۰۰۰|هر گرم ≈ ۹,۰۰۰,۰۰۰/));
    // The other portfolio
    fireEvent.click(screen.getByText('طلا', { selector: 'button, button *' }));
    expect(document.querySelector('button[type="submit"]').disabled).toBe(false);
    fireEvent.submit(submitOf('ثبت هزینه روزمره'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      category: 'investment',
      myShare: null,
      investedIn: { portfolioId: 'pf_b', portfolioName: 'طلا', assetId: 'gold_18k', quantity: 2, txId: 'txl_new' },
    });
  });

  it('other categories never add anything', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<ExpenseForm daily onSubmit={onSubmit} onClose={() => {}} />);
    expect(screen.queryByLabelText(/افزودن به پورتفو/)).toBeNull();
    fireEvent.change(document.getElementById('expense-amount'), { target: { value: '1000' } });
    fireEvent.submit(submitOf('ثبت هزینه روزمره'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].investedIn).toBeNull();
  });
});

describe('an asset-sale income', () => {
  it('picks what the portfolio holds, warns above the balance, and saves the sale link', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<IncomeForm onSubmit={onSubmit} onClose={() => {}} />);
    fireEvent.change(document.getElementById('income-title'), { target: { value: 'فروش سکه' } });
    fireEvent.click(screen.getByText('فروش دارایی'));
    fireEvent.change(document.getElementById('income-amount'), { target: { value: '180000000' } });
    const toggle = await screen.findByLabelText(/کم کردن از پورتفو/);
    await waitFor(() => expect(toggle.disabled).toBe(false));
    fireEvent.click(toggle);
    // Only what is held (no dollars left)
    await waitFor(() => expect(screen.getByText('سکه امامی')).toBeTruthy());
    const held = screen.getByText('سکه امامی').closest('.ui-input-group');
    expect(within(held).queryByText('دلار')).toBeNull();
    fireEvent.click(screen.getByText('سکه امامی'));
    fireEvent.change(document.getElementById('portfolio-link-qty-sell'), { target: { value: '5' } });
    expect(document.body.textContent).toMatch(/بیشتر از موجودی/);
    fireEvent.change(document.getElementById('portfolio-link-qty-sell'), { target: { value: '2' } });
    expect(document.body.textContent).not.toMatch(/بیشتر از موجودی/);
    fireEvent.submit(submitOf('ثبت درآمد'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      category: 'asset_sale',
      soldFrom: { portfolioId: 'pf_a', assetId: 'full_coin', quantity: 2, txId: 'txl_new' },
    });
  });
});
