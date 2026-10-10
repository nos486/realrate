// @vitest-environment happy-dom
/**
 * creditSettlementIncome.test.jsx — An income in «تسویه بدهی اعتباری»: a deposit that pays a bank
 * credit's debt. It names the credit, takes that much off the credit's debt, and is left out of
 * the income totals by default.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { pickCategory } from '../helpers/entryForm.js';
import { BUILTIN_CATEGORIES, splitByExclusion, mergeCategories } from '../../src/domain/categoryDocument.js';
import { creditStatus, validateCreditTerms, CREDIT_SETTLEMENT_CATEGORY } from '../../src/domain/creditAccount.js';
import { INCOME_CATEGORIES } from '../../src/config/constants.js';

vi.mock('../../../web/src/features/accounts/hooks/useAccounts.js', () => ({
  useAccounts: () => ({
    loading: false,
    accounts: [
      { id: 'bank_1', name: 'ملت', type: 'bank' },
      { id: 'cr_1', name: 'اعتبار سازمانی', type: 'credit', credit: { limit: 50_000_000 } },
      { id: 'cr_old', name: 'اعتبار قدیمی', type: 'credit', credit: { limit: 1 }, archived: true },
    ],
  }),
}));
vi.mock('../../../web/src/shared/categories/useCategories.js', async () => {
  const { categoryIcon } = await import('../../../web/src/shared/categories/categoryIcons.js');
  const { BUILTIN_CATEGORIES: built } = await import('../../src/domain/categoryDocument.js');
  return { useCategories: () => built.income.map((c) => ({ ...c, Icon: categoryIcon(c.icon) })) };
});

const { parseIncomeInput } = await import('../../../web/src/shared/vault/vaultIncomes.js');
const { default: IncomeForm } = await import('../../../web/src/features/incomes/components/IncomeForm.jsx');

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const deposit = (patch = {}) => ({ title: 'واریز شرکت', category: CREDIT_SETTLEMENT_CATEGORY, amount: 5_000_000, incomeDate: '2026-10-05', creditAccountId: 'cr_1', ...patch });

describe('the category', () => {
  it('is a built-in income category, left out of the totals by default, and known to the server', () => {
    const cat = BUILTIN_CATEGORIES.income.find((c) => c.value === CREDIT_SETTLEMENT_CATEGORY);
    expect(cat).toMatchObject({ label: 'تسویه بدهی اعتباری', excluded: true });
    expect(INCOME_CATEGORIES).toContain(CREDIT_SETTLEMENT_CATEGORY);
    // The user's list (nothing stored yet: the built-ins) decides what is left out
    const isExcluded = (value) => Boolean(mergeCategories('income', null).find((c) => c.value === value)?.excluded);
    const { counted, excluded } = splitByExclusion([deposit(), deposit({ category: 'salary' })], isExcluded);
    expect(counted.map((i) => i.category)).toEqual(['salary']);
    expect(excluded.map((i) => i.category)).toEqual([CREDIT_SETTLEMENT_CATEGORY]);
  });

  it('a deposit keeps the credit it pays; another category drops it', () => {
    expect(parseIncomeInput(deposit())).toMatchObject({ category: CREDIT_SETTLEMENT_CATEGORY, creditAccountId: 'cr_1' });
    expect(parseIncomeInput(deposit({ category: 'salary' })).creditAccountId).toBe('');
    expect(parseIncomeInput(deposit({ creditAccountId: 'bad id!' })).creditAccountId).toBe('');
  });
});

describe("the credit's debt", () => {
  it('goes down by the deposits that pay it — only its own, in its category, from its start', () => {
    const account = { id: 'cr_1', type: 'credit', credit: validateCreditTerms({ limit: 50_000_000, startDate: '2026-09-01' }).value };
    const expenses = [{ id: 'e', accountId: 'cr_1', date: '2026-09-10', amount: 20_000_000, currency: 'IRT' }];
    const incomes = [
      deposit(),
      deposit({ creditAccountId: 'cr_other' }),
      deposit({ category: 'salary' }),
      deposit({ incomeDate: '2026-08-20' }),
    ];
    const s = creditStatus(account, { expenses, incomes }, '2026-10-07');
    expect(s).toMatchObject({ debt: 15_000_000, available: 35_000_000 });
  });
});

describe('the income form', () => {
  it('«تسویه بدهی اعتباری» asks which credit it pays, and saves it', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<IncomeForm onSubmit={onSubmit} onClose={vi.fn()} draft={{ title: 'واریز', amount: 5_000_000, incomeDate: '2026-10-05' }} />);
    expect(screen.queryByText('برای کدام اعتبار *')).toBeNull();
    pickCategory('تسویه بدهی اعتباری');
    expect(screen.getByText('برای کدام اعتبار *')).toBeTruthy();
    // Archived credits are not offered for a new deposit
    expect(screen.queryByText('اعتبار قدیمی')).toBeNull();
    const form = screen.getByText('برای کدام اعتبار *').closest('form');
    expect(form.querySelector('button[type="submit"]').disabled).toBe(true);
    fireEvent.click(screen.getByText('اعتبار سازمانی'));
    fireEvent.submit(form);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ category: CREDIT_SETTLEMENT_CATEGORY, creditAccountId: 'cr_1', amount: 5_000_000 });
  });
});
