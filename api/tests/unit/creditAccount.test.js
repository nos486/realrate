/**
 * creditAccount.test.js — A bank credit line as an account: its terms (a fee or an installment
 * rate given as a percent or worked out from amounts), its statements (closed on a Shamsi day of
 * the month), settling them on time (with a fee), and what isn't settled turned into installments
 * by the user, as the bank set them; paying back is a transfer into the credit, spending an
 * expense from it
 */
import { describe, it, expect } from 'vitest';
import {
  validateCreditTerms,
  closingDateOf,
  installmentPlanOf,
  creditStatus,
  conversionDraft,
  validateConversion,
  feePctFromAmounts,
  installmentRateFromAmounts,
  creditCostsPaid,
  addDaysIso,
} from '../../src/domain/creditAccount.js';
import { validateAccount, isCreditAccount } from '../../src/domain/accountDocument.js';
import { validateExpense } from '../../src/domain/expenseDocument.js';

const terms = (patch = {}) => validateCreditTerms({
  limit: 100_000_000, closingDay: 15, graceDays: 0, payMode: 'due_day', settleFeePct: 2,
  installmentCount: 6, installmentRatePct: 0, startDate: '2026-08-01', ...patch,
}).value;
const account = (patch) => ({ id: 'c1', type: 'credit', name: 'اعتبار', credit: terms(patch) });
const buy = (date, amount, accountId = 'c1') => ({ id: `e-${date}-${amount}`, accountId, date, amount, currency: 'IRT' });
const pay = (date, amount) => ({ id: `t-${date}-${amount}`, fromAccountId: 'bank', toAccountId: 'c1', date, amount });

// 15 Mehr 1405 = 2026-10-07; 15 Aban = 2026-11-06; 15 Azar = 2026-12-06
const MEHR_15 = '2026-10-07';
const ABAN_15 = '2026-11-06';

describe('terms', () => {
  it('needs a limit and keeps every term in range', () => {
    expect(validateCreditTerms({}).error).toBeTruthy();
    expect(validateCreditTerms({ limit: 1000, closingDay: 32 }).error).toBeTruthy();
    expect(validateCreditTerms({ limit: 1000, installmentCount: 0 }).error).toBeTruthy();
    expect(validateCreditTerms({ limit: '100,000,000' }, '2026-10-07').value).toMatchObject({
      limit: 100_000_000, closingDay: 1, graceDays: 0, payMode: 'anytime', settleFeePct: 0, installmentCount: 6, startDate: '2026-10-07',
    });
  });

  it('a credit is an account of its own type, in tomans, with its bank and card', () => {
    const { value } = validateAccount({ type: 'credit', name: 'اوانو', bankId: 'ayandeh', bankName: 'آینده', cardLast4: '1234', currency: 'USD', credit: { limit: 50_000_000, closingDay: 15 } });
    expect(value).toMatchObject({ type: 'credit', bankId: 'ayandeh', cardLast4: '1234', currency: 'IRT', credit: { limit: 50_000_000, closingDay: 15 } });
    expect(isCreditAccount(value)).toBe(true);
    expect(validateAccount({ type: 'credit', name: 'x', credit: {} }).error).toBeTruthy();
    expect(validateAccount({ type: 'bank', name: 'x', credit: { limit: 1 } }).value.credit).toBeUndefined();
  });

  it("a credit's fee is an expense that names the credit", () => {
    const { value } = validateExpense({ groupId: 'g1', title: 'کارمزد', amount: 300000, currency: 'IRT', date: MEHR_15, category: 'credit_fees', accountId: 'bank', creditAccountId: 'c1' });
    expect(value).toMatchObject({ category: 'credit_fees', accountId: 'bank', creditAccountId: 'c1' });
    expect(creditCostsPaid('c1', [value, { ...value, creditAccountId: 'other' }])).toBe(300000);
  });
});

describe('fee and installments from amounts', () => {
  it('«۱۰ میلیون استفاده، ۱۰٫۲ میلیون برگشت»: a 2% fee', () => {
    expect(feePctFromAmounts(10_000_000, 10_200_000)).toEqual({ pct: 2 });
    expect(feePctFromAmounts('10,000,000', '10,215,000')).toEqual({ pct: 2.15 });
    expect(feePctFromAmounts(10_000_000, 9_000_000).error).toBeTruthy();
    const t = terms({ settleFeePct: 0, feeSample: { used: 10_000_000, repaid: 10_200_000 } });
    expect(t).toMatchObject({ settleFeePct: 2, feeSample: { used: 10_000_000, repaid: 10_200_000 } });
  });

  it('the installments\' rate from the installment the bank quotes, like a loan', () => {
    const { ratePct, total } = installmentRateFromAmounts(10_000_000, 1_850_000, 6);
    expect(total).toBe(11_100_000);
    expect(ratePct).toBeGreaterThan(36);
    expect(installmentRateFromAmounts(10_000_000, 1_000_000, 6).error).toBeTruthy();
    expect(installmentRateFromAmounts(12_000_000, 2_000_000, 6).ratePct).toBe(0);
    const t = terms({ installmentRatePct: 0, installmentSample: { principal: 10_000_000, payment: 1_850_000 } });
    expect(t.installmentRatePct).toBe(ratePct);
    expect(t.installmentSample).toEqual({ principal: 10_000_000, payment: 1_850_000 });
  });
});

describe('statements', () => {
  it('purchases up to the closing day are one statement; after it, the next', () => {
    expect(closingDateOf('2026-09-10', 15)).toBe(MEHR_15); // 19 Shahrivar → 15 Mehr
    expect(closingDateOf(MEHR_15, 15)).toBe(MEHR_15);
    expect(closingDateOf(addDaysIso(MEHR_15, 1), 15)).toBe(ABAN_15);
    // Day 31 in a 30-day month: its last day
    expect(closingDateOf('2026-10-20', 31)).toBe('2026-10-22'); // 30 Mehr
  });

  it('settled on the due day (with its fee): nothing owed, the credit free again', () => {
    const a = account();
    const expenses = [buy('2026-09-10', 10_000_000), buy('2026-10-01', 5_000_000)];
    const before = creditStatus(a, { expenses }, MEHR_15);
    expect(before).toMatchObject({ debt: 15_000_000, available: 85_000_000 });
    expect(before.next).toMatchObject({ kind: 'statement', dueDate: MEHR_15, principal: 15_000_000, cost: 300_000, amount: 15_300_000 });

    const after = creditStatus(a, { expenses, transfers: [pay(MEHR_15, 15_000_000)] }, ABAN_15);
    expect(after).toMatchObject({ debt: 0, available: 100_000_000, plans: [], next: null });
  });

  it('not settled by the due day: owed and overdue — never turned into installments by itself', () => {
    const s = creditStatus(account(), { expenses: [buy('2026-09-10', 12_000_000)] }, ABAN_15);
    expect(s.plans).toEqual([]);
    expect(s.statements[0]).toMatchObject({ closeDate: MEHR_15, remaining: 12_000_000, overdue: true, open: false });
    expect(s.overdue).toEqual({ count: 1, amount: 12_240_000 });
    expect(s.next).toMatchObject({ kind: 'statement', dueDate: MEHR_15 });
  });

  it('the user turns it into installments as the bank set them: count, first due day, each installment', () => {
    const a = account({ installmentSample: { principal: 10_000_000, payment: 1_850_000 } });
    const today = addDaysIso(MEHR_15, 13);
    const before = creditStatus(a, { expenses: [buy('2026-09-10', 12_000_000)] }, today);
    const draft = conversionDraft(a, before.statements[0], today);
    // The quoted installment scaled to this amount; the first due a month after the statement's
    expect(draft).toMatchObject({ closeDate: MEHR_15, principal: 12_000_000, count: 6, payment: 2_220_000, firstDueDate: ABAN_15, date: today });

    // The bank moved the first due to the 20th
    a.credit = terms({ conversions: [{ id: 'cv1', ...draft, firstDueDate: '2026-11-11' }] });
    const s = creditStatus(a, { expenses: [buy('2026-09-10', 12_000_000)] }, today);
    expect(s.statements).toEqual([]);
    expect(s.debt).toBe(12_000_000);
    const [plan] = s.plans;
    expect(plan).toMatchObject({ id: 'cv1', principal: 12_000_000, count: 6, payment: 2_220_000 });
    expect(plan.ratePct).toBeGreaterThan(36);
    expect(plan.installments.map((i) => i.dueDate)).toEqual(['2026-11-11', '2026-12-11', '2027-01-10', '2027-02-09', '2027-03-11', '2027-04-09']);
    expect(plan.installments.reduce((sum, i) => sum + i.principal, 0)).toBe(12_000_000);
    expect(plan.installments.every((i) => i.principal + i.interest === 2_220_000)).toBe(true);
    expect(s.next).toMatchObject({ kind: 'installment', dueDate: '2026-11-11', amount: 2_220_000, label: 'قسط ۱ از ۶' });
  });

  it('a conversion is checked; only what was left of the statement leaves it', () => {
    const base = { id: 'cv', date: MEHR_15, closeDate: MEHR_15, principal: 6_000_000, count: 6, payment: 1_000_000, firstDueDate: ABAN_15 };
    expect(validateConversion(base).value).toEqual(base);
    expect(validateConversion({ ...base, payment: 900_000 }).error).toBeTruthy();
    expect(validateConversion({ ...base, firstDueDate: '2026-10-01' }).error).toBeTruthy();
    expect(validateCreditTerms({ limit: 1, conversions: [{ ...base, count: 0 }] }).error).toBeTruthy();

    const a = account({ conversions: [{ ...base, date: addDaysIso(MEHR_15, 1) }] });
    const s = creditStatus(a, { expenses: [buy('2026-09-10', 12_000_000)], transfers: [pay(MEHR_15, 6_000_000)] }, ABAN_15);
    expect(s.statements).toEqual([]);
    expect(s.plans[0].installments[0]).toMatchObject({ principal: 1_000_000, interest: 0, status: 'due' });
  });

  it('a payment goes to the earliest due; overdue installments are counted', () => {
    const conversions = [{ id: 'cv', date: addDaysIso(MEHR_15, 1), closeDate: MEHR_15, principal: 6_000_000, count: 6, payment: 1_000_000, firstDueDate: ABAN_15 }];
    const a = account({ conversions });
    const expenses = [buy('2026-09-10', 6_000_000)];
    const later = '2026-12-10'; // after 15 Aban and 15 Azar
    const s = creditStatus(a, { expenses }, later);
    expect(s.overdue).toEqual({ count: 2, amount: 2_000_000 });
    const paid = creditStatus(a, { expenses, transfers: [pay(later, 1_500_000)] }, later);
    expect(paid.overdue).toEqual({ count: 1, amount: 500_000 });
    expect(paid.next).toMatchObject({ kind: 'installment', principal: 500_000 });
  });

  it('installments with profit: the principal adds up, each the same payment', () => {
    const plan = installmentPlanOf(12_000_000, { count: 6, payment: 2_200_000 }, MEHR_15);
    expect(plan.reduce((sum, i) => sum + i.principal, 0)).toBe(12_000_000);
    expect(plan.every((i) => i.principal + i.interest === 2_200_000)).toBe(true);
    expect(plan[5].interest).toBeLessThan(plan[0].interest);
    expect(plan[0].dueDate).toBe(MEHR_15);
  });

  it('paid back any day: the credit is free again at once, and an overpayment covers the next purchases', () => {
    const a = account({ payMode: 'anytime', settleFeePct: 0, closingDay: 30, graceDays: 10 });
    const s = creditStatus(a, { expenses: [buy('2026-10-01', 40_000_000)], transfers: [pay('2026-10-03', 50_000_000)] }, '2026-10-04');
    expect(s).toMatchObject({ debt: 0, available: 100_000_000, prepaid: 10_000_000 });
    const s2 = creditStatus(a, { expenses: [buy('2026-10-01', 40_000_000), buy('2026-10-04', 15_000_000)], transfers: [pay('2026-10-03', 50_000_000)] }, '2026-10-04');
    expect(s2).toMatchObject({ debt: 5_000_000, prepaid: 0 });
    expect(s2.statements[0]).toMatchObject({ charged: 55_000_000, paid: 50_000_000, remaining: 5_000_000, fee: 0 });
  });

  it('cash taken out of the credit is owed too (with the bank fee); other accounts and older records are ignored', () => {
    const a = account({ startDate: '2026-09-01', openingDebt: 3_000_000 });
    const s = creditStatus(a, {
      expenses: [buy('2026-09-05', 1_000_000), buy('2026-08-20', 9_000_000), buy('2026-09-06', 7_000_000, 'other')],
      transfers: [{ id: 't', fromAccountId: 'c1', toAccountId: 'bank', date: '2026-09-07', amount: 2_000_000, fee: 20_000 }],
    }, '2026-09-08');
    expect(s.debt).toBe(3_000_000 + 1_000_000 + 2_020_000);
  });

  it('only a credit account has a status', () => {
    expect(creditStatus({ id: 'b', type: 'bank' }, {}, MEHR_15)).toBeNull();
  });
});
