/**
 * creditAccount.test.js — A bank credit line as an account, with no bank rules assumed: its limit
 * and debt (spending is an expense from it, paying back a transfer into it), a settlement's fee
 * worked out from the debt settled and what was paid, and installments entered by hand — each
 * with its own day and amount — their fee worked out from what they add up to
 */
import { describe, it, expect } from 'vitest';
import {
  validateCreditTerms,
  validateConversion,
  settlementOf,
  conversionCost,
  monthlyDates,
  creditStatus,
  creditCostsPaid,
} from '../../src/domain/creditAccount.js';
import { validateAccount, isCreditAccount } from '../../src/domain/accountDocument.js';
import { validateExpense } from '../../src/domain/expenseDocument.js';
import { summarizeTransfersByAccount } from '../../src/domain/transferDocument.js';

const TODAY = '2026-10-07'; // 15 Mehr 1405
const terms = (patch = {}) => validateCreditTerms({ limit: 100_000_000, startDate: '2026-08-01', ...patch }).value;
const account = (patch) => ({ id: 'c1', type: 'credit', name: 'اعتبار', credit: terms(patch) });
const buy = (date, amount, accountId = 'c1') => ({ id: `e-${date}-${amount}`, accountId, date, amount, currency: 'IRT' });
const pay = (date, amount, fee = 0) => ({ id: `t-${date}-${amount}`, fromAccountId: 'bank', toAccountId: 'c1', date, amount, fee });
const plan = (patch = {}) => ({
  id: 'cv1',
  date: '2026-09-20',
  principal: 10_000_000,
  installments: [
    { dueDate: '2026-10-01', amount: 3_700_000 },
    { dueDate: '2026-11-01', amount: 3_700_000 },
    { dueDate: '2026-12-01', amount: 3_700_000 },
  ],
  ...patch,
});

describe('terms', () => {
  it('only a limit, the debt already owed and the day to count from', () => {
    expect(validateCreditTerms({}).error).toBeTruthy();
    expect(validateCreditTerms({ limit: '100,000,000', openingDebt: '5,000,000' }, TODAY).value).toEqual({ limit: 100_000_000, openingDebt: 5_000_000, startDate: TODAY });
    // Rules of an earlier version are dropped
    expect(validateCreditTerms({ limit: 1, closingDay: 15, settleFeePct: 2 }, TODAY).value).toEqual({ limit: 1, openingDebt: 0, startDate: TODAY });
  });

  it('a credit is an account of its own type, in tomans, with its bank and card', () => {
    const { value } = validateAccount({ type: 'credit', name: 'اوانو', bankId: 'ayandeh', bankName: 'آینده', cardLast4: '1234', currency: 'USD', credit: { limit: 50_000_000 } });
    expect(value).toMatchObject({ type: 'credit', bankId: 'ayandeh', cardLast4: '1234', currency: 'IRT', credit: { limit: 50_000_000 } });
    expect(isCreditAccount(value)).toBe(true);
    expect(validateAccount({ type: 'credit', name: 'x', credit: {} }).error).toBeTruthy();
    expect(validateAccount({ type: 'bank', name: 'x', credit: { limit: 1 } }).value.credit).toBeUndefined();
  });

  it("a credit's fee is an expense that names the credit", () => {
    const { value } = validateExpense({ groupId: 'g1', title: 'کارمزد', amount: 200_000, currency: 'IRT', date: TODAY, category: 'credit_fees', accountId: 'bank', creditAccountId: 'c1' });
    expect(value).toMatchObject({ category: 'credit_fees', accountId: 'bank', creditAccountId: 'c1' });
    expect(creditCostsPaid('c1', [value, { ...value, creditAccountId: 'other' }])).toBe(200_000);
  });
});

describe('fees from the amounts entered', () => {
  it('a settlement: «۱۰ میلیون بدهی، ۱۰٫۲ میلیون پرداخت» is a 200,000 (2%) fee', () => {
    expect(settlementOf(10_000_000, 10_200_000)).toEqual({ fee: 200_000, pct: 2 });
    expect(settlementOf('10,000,000', '10,000,000')).toEqual({ fee: 0, pct: 0 });
    expect(settlementOf(10_000_000, 9_000_000).error).toBeTruthy();
  });

  it('installments: what they add up to beyond the amount is their fee', () => {
    expect(conversionCost(plan())).toEqual({ total: 11_100_000, cost: 1_100_000, pct: 11 });
  });
});

describe('installments entered by hand', () => {
  it('each installment its own day and amount; checked', () => {
    const { value } = validateConversion(plan({ installments: [{ dueDate: '2026-11-01', amount: '4,000,000' }, { dueDate: '2026-10-01', amount: 7_000_000, paidOn: '2026-10-01', transferId: 'trf_1' }] }));
    // Sorted by day; paid ones keep when and how
    expect(value.installments).toEqual([
      { dueDate: '2026-10-01', amount: 7_000_000, paidOn: '2026-10-01', transferId: 'trf_1' },
      { dueDate: '2026-11-01', amount: 4_000_000 },
    ]);
    expect(validateConversion(plan({ installments: [] })).error).toBeTruthy();
    expect(validateConversion(plan({ installments: [{ dueDate: '2026-10-01', amount: 1_000_000 }] })).error).toBeTruthy();
    expect(validateConversion(plan({ installments: [{ dueDate: '', amount: 11_000_000 }] })).error).toBeTruthy();
    expect(validateCreditTerms({ limit: 1, conversions: [plan({ principal: 0 })] }).error).toBeTruthy();
  });

  it('rows can be filled monthly on one Shamsi day, then edited', () => {
    // 15 Mehr, 15 Aban, 15 Azar
    expect(monthlyDates(TODAY, 3)).toEqual(['2026-10-07', '2026-11-06', '2026-12-06']);
    // 31 Shahrivar → the last day of the 30-day months
    expect(monthlyDates('2026-09-22', 2)).toEqual(['2026-09-22', '2026-10-22']);
  });

  it('a plan from the earlier version (a count and one amount) becomes its rows', () => {
    const { value } = validateConversion({ id: 'old', date: '2026-09-20', closeDate: '2026-09-15', principal: 6_000_000, count: 3, payment: 2_100_000, firstDueDate: TODAY });
    expect(value.installments.map((i) => [i.dueDate, i.amount])).toEqual([['2026-10-07', 2_100_000], ['2026-11-06', 2_100_000], ['2026-12-06', 2_100_000]]);
  });
});

describe('where a credit stands', () => {
  it('the debt: what was spent from it (and the debt already owed) less what was paid into it', () => {
    const a = account({ openingDebt: 3_000_000 });
    const s = creditStatus(a, {
      expenses: [buy('2026-09-05', 10_000_000), buy('2026-07-20', 9_000_000), buy('2026-09-06', 7_000_000, 'other')],
      transfers: [pay('2026-09-10', 4_000_000)],
    }, TODAY);
    expect(s).toMatchObject({ limit: 100_000_000, debt: 9_000_000, available: 91_000_000, freeDebt: 9_000_000, installmentDebt: 0, plans: [], next: null });
  });

  it('a settlement with a fee: only the debt settled leaves the debt, and the transfer shows the fee', () => {
    // Paid 10.2M from the bank for 10M of debt: the transfer's amount left the bank, its fee never reached the credit
    const settle = pay('2026-10-07', 10_200_000, 200_000);
    const s = creditStatus(account(), { expenses: [buy('2026-09-05', 10_000_000)], transfers: [settle] }, TODAY);
    expect(s).toMatchObject({ debt: 0, available: 100_000_000, prepaid: 0 });
    const moved = summarizeTransfersByAccount([settle]);
    expect(moved.get('bank').out).toBe(10_200_000);
    expect(moved.get('c1').in).toBe(10_000_000);
  });

  it('cash taken out of the credit is owed in full; an overpayment is prepaid', () => {
    const cash = { id: 't', fromAccountId: 'c1', toAccountId: 'bank', date: '2026-09-07', amount: 2_020_000, fee: 20_000 };
    expect(creditStatus(account(), { transfers: [cash] }, TODAY).debt).toBe(2_020_000);
    const over = creditStatus(account(), { expenses: [buy('2026-09-05', 1_000_000)], transfers: [pay('2026-09-06', 1_500_000)] }, TODAY);
    expect(over).toMatchObject({ debt: 0, prepaid: 500_000 });
  });

  it('installments: the plan with its fee, each installment\'s status, the next and the overdue ones', () => {
    // 10M spent, turned into 3 × 3.7M: the 1.1M fee is an expense charged to the credit
    const fee = { ...buy('2026-09-20', 1_100_000), creditAccountId: 'c1' };
    const a = account({ conversions: [plan()] });
    const s = creditStatus(a, { expenses: [buy('2026-09-05', 10_000_000), fee] }, TODAY);
    expect(s).toMatchObject({ debt: 11_100_000, installmentDebt: 11_100_000, freeDebt: 0 });
    expect(s.plans[0]).toMatchObject({ total: 11_100_000, cost: 1_100_000, pct: 11, remaining: 11_100_000 });
    expect(s.plans[0].installments.map((i) => i.status)).toEqual(['overdue', 'upcoming', 'upcoming']);
    expect(s.overdue).toEqual({ count: 1, amount: 3_700_000 });
    expect(s.next).toMatchObject({ n: 1, count: 3, dueDate: '2026-10-01', amount: 3_700_000 });

    // The first one paid by hand
    const paid = account({ conversions: [plan({ installments: plan().installments.map((i, k) => (k === 0 ? { ...i, paidOn: '2026-10-05' } : i)) })] });
    const after = creditStatus(paid, { expenses: [buy('2026-09-05', 10_000_000), fee], transfers: [pay('2026-10-05', 3_700_000)] }, TODAY);
    expect(after).toMatchObject({ debt: 7_400_000, installmentDebt: 7_400_000, freeDebt: 0, overdue: { count: 0, amount: 0 } });
    expect(after.plans[0].installments[0]).toMatchObject({ status: 'paid', paidOn: '2026-10-05' });
    expect(after.next).toMatchObject({ n: 2, dueDate: '2026-11-01' });
  });

  it('only a credit account has a status', () => {
    expect(creditStatus({ id: 'b', type: 'bank' }, {}, TODAY)).toBeNull();
  });
});
