/**
 * toolCalculators.test.js — The math of the calculation tools: loans, deposits, gold, conversion,
 * the dowry at today's value, salary and the rent/deposit exchange
 */
import { describe, it, expect } from 'vitest';
import {
  monthlyPayment, loanCost, loanRateFromPayment, depositReturn, goldPurchase, convertAmount, inflationFactor, mahrToday,
  mahrCoinsValue, monthlyTax, salaryBreakdown, eidiAndSanavat, rentExchange, cappedRent,
} from '../../src/domain/toolCalculators.js';

describe('loans', () => {
  it('computes the standard installment, and splits it to zero balance', () => {
    expect(Math.round(monthlyPayment(100_000_000, 0, 10))).toBe(10_000_000);
    const loan = loanCost({ principal: 100_000_000, annualRatePct: 23, months: 12 });
    expect(loan.payment).toBeGreaterThan(9_000_000);
    expect(loan.schedule).toHaveLength(12);
    expect(loan.schedule.at(-1).balance).toBe(0);
    expect(loan.effectiveAnnualPct).toBeGreaterThan(23);
  });

  it('a fee raises the real rate and inflation lowers what the loan costs in today\'s money', () => {
    const plain = loanCost({ principal: 100_000_000, annualRatePct: 23, months: 24 });
    const withFee = loanCost({ principal: 100_000_000, annualRatePct: 23, months: 24, feePct: 2 });
    expect(withFee.effectiveAnnualPct).toBeGreaterThan(plain.effectiveAnnualPct);
    const inflated = loanCost({ principal: 100_000_000, annualRatePct: 23, months: 24, inflationPct: 40 });
    expect(inflated.realCost).toBeLessThan(plain.realCost);
    expect(inflated.realRatePct).toBeLessThan(0);
  });

  it('gives nothing for empty input', () => {
    expect(loanCost({ principal: 0, annualRatePct: 20, months: 12 })).toBeNull();
  });
});

describe('loan rate from the installment', () => {
  it('finds the rate of 100M paid back as 10M a month for 12 months', () => {
    const r = loanRateFromPayment({ received: 100_000_000, payment: 10_000_000, months: 12 });
    expect(r.totalPaid).toBe(120_000_000);
    expect(r.interest).toBe(20_000_000);
    expect(r.monthlyPct).toBeCloseTo(2.92, 1);
    expect(r.nominalAnnualPct).toBeCloseTo(35.0, 0);
    expect(r.effectiveAnnualPct).toBeGreaterThan(r.nominalAnnualPct);
    expect(r.withCost).toBeNull();
  });

  it('round-trips with the installment formula', () => {
    const pay = monthlyPayment(200_000_000, 24, 36);
    expect(loanRateFromPayment({ received: 200_000_000, payment: pay, months: 36 }).nominalAnnualPct).toBeCloseTo(24, 1);
  });

  it('a blocked deposit or fee raises the rate', () => {
    const r = loanRateFromPayment({ received: 100_000_000, payment: 10_000_000, months: 12, upfrontCost: 5_000_000 });
    expect(r.withCost.nominalAnnualPct).toBeGreaterThan(r.nominalAnnualPct);
    expect(r.withCost.totalCost).toBe(25_000_000);
  });

  it('gives nothing for empty input', () => {
    expect(loanRateFromPayment({ received: 0, payment: 1, months: 12 })).toBeNull();
  });
});

describe('deposits', () => {
  it('pays simple and compound profit and shows the real return', () => {
    const simple = depositReturn({ principal: 100_000_000, annualRatePct: 24, months: 12 });
    expect(simple.profit).toBe(24_000_000);
    const compound = depositReturn({ principal: 100_000_000, annualRatePct: 24, months: 12, compounding: 'monthly' });
    expect(compound.profit).toBeGreaterThan(simple.profit);
    const real = depositReturn({ principal: 100_000_000, annualRatePct: 24, months: 12, inflationPct: 40 });
    expect(real.realProfit).toBeLessThan(0);
    expect(real.realAnnualPct).toBeCloseTo(-11.43, 1);
  });
});

describe('gold', () => {
  it('adds wage, profit and VAT on those two only', () => {
    const g = goldPurchase({ grams: 10, pricePerGram: 1_000_000, wagePct: 10, profitPct: 7, taxPct: 10 });
    expect(g.metal).toBe(10_000_000);
    expect(g.wage).toBe(1_000_000);
    expect(g.profit).toBe(770_000);
    expect(g.tax).toBe(177_000);
    expect(g.total).toBe(11_947_000);
  });
});

describe('conversion', () => {
  it('goes through tomans', () => {
    expect(convertAmount(10, 100_000, 1)).toBe(1_000_000);
    expect(convertAmount(1_000_000, 1, 100_000)).toBe(10);
    expect(convertAmount(5, 0, 1)).toBeNull();
  });
});

describe('mahr', () => {
  it('compounds each year\'s inflation after the marriage year', () => {
    expect(inflationFactor(1400, 1400)).toBe(1);
    expect(inflationFactor(1400, 1402, 0, { 1401: 50, 1402: 100 })).toBeCloseTo(3);
    // A year the table lacks takes the assumed rate
    expect(inflationFactor(1400, 1402, 10, { 1401: 50 })).toBeCloseTo(1.65);
  });

  it('values the dowry today, in tomans and in coins', () => {
    const r = mahrToday({ amount: 100_000_000, marriageYear: 1401, currentYear: 1403, coinPrice: 50_000_000 });
    expect(r.today).toBe(Math.round(100_000_000 * (1.446) * 1.325));
    expect(r.coins).toBeCloseTo(r.today / 50_000_000, 1);
    expect(mahrCoinsValue(110, 50_000_000)).toBe(5_500_000_000);
  });
});

describe('salary', () => {
  it('taxes by brackets', () => {
    const brackets = [{ upTo: 10, ratePct: 0 }, { upTo: 20, ratePct: 10 }, { upTo: null, ratePct: 20 }];
    expect(monthlyTax(5, brackets)).toBe(0);
    expect(monthlyTax(25, brackets)).toBe(2);
    expect(monthlyTax(40, brackets)).toBe(5);
  });

  it('deducts insurance and tax and adds the employer\'s share', () => {
    const s = salaryBreakdown({ base: 20_000_000, allowances: 5_000_000 });
    expect(s.gross).toBe(25_000_000);
    expect(s.insurance).toBe(1_750_000);
    expect(s.net).toBe(s.gross - s.insurance - s.tax);
    expect(s.employerCost).toBe(25_000_000 + 5_750_000);
  });

  it('computes eidi and sanavat', () => {
    const e = eidiAndSanavat({ base: 30_000_000, lastPay: 36_000_000, monthsWorked: 12, serviceMonths: 30 });
    expect(e.eidi).toBe(60_000_000);
    expect(e.sanavat).toBe(90_000_000);
    expect(e.eidiTaxable).toBeGreaterThan(0);
  });
});

describe('rent and deposit', () => {
  it('exchanges deposit for rent at the yearly rate', () => {
    const x = rentExchange({ deposit: 1_000_000_000, rent: 0, annualRatePct: 24, newDeposit: 500_000_000 });
    expect(x.result).toEqual({ deposit: 500_000_000, rent: 10_000_000 });
    expect(x.allRent).toBe(20_000_000);
    const y = rentExchange({ deposit: 500_000_000, rent: 10_000_000, annualRatePct: 24, newRent: 0 });
    expect(y.result.deposit).toBe(1_000_000_000);
    expect(y.allDeposit).toBe(1_000_000_000);
  });

  it('caps a rent raise', () => {
    expect(cappedRent(10_000_000, 25)).toBe(12_500_000);
  });
});
