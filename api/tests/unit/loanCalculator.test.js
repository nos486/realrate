import { describe, it, expect } from 'vitest';
import {
  calculateFixedInstallmentAmount,
  generateAmortizationSchedule,
  recalculateFromBalance,
  calculatePayoffScheduleFixedAmount,
} from '../../src/domain/loanCalculator.js';

describe('Loan Calculator Domain (ماشین حساب وام و اقساط)', () => {
  describe('calculateFixedInstallmentAmount', () => {
    it('returns equal principal division for zero interest rate (قرض‌الحسنه)', () => {
      const amount = calculateFixedInstallmentAmount({
        principal: 12000000,
        annualRatePct: 0,
        installmentCount: 12,
      });
      expect(amount).toBe(1000000);
    });

    it('returns correctly calculated PMT installment for standard interest rate', () => {
      // 100,000,000 Tomans at 23% for 12 months
      // r = 0.23 / 12 = 0.019166666666666665
      // PMT = 100,000,000 * [r * (1 + r)^12] / [(1 + r)^12 - 1] = 9407632
      const amount = calculateFixedInstallmentAmount({
        principal: 100000000,
        annualRatePct: 23,
        installmentCount: 12,
      });
      expect(amount).toBe(9407632);
    });

    it('handles zero or invalid input gracefully', () => {
      expect(calculateFixedInstallmentAmount({ principal: 0, installmentCount: 10 })).toBe(0);
      expect(calculateFixedInstallmentAmount({ principal: 10000000, installmentCount: 0 })).toBe(0);
    });
  });

  describe('generateAmortizationSchedule — Zero Interest / قرض‌الحسنه', () => {
    it('generates equal installments with zero interest and exact principal reconciliation', () => {
      const principal = 10000000;
      const installmentCount = 3;
      const schedule = generateAmortizationSchedule({
        principal,
        annualRatePct: 0,
        installmentCount,
        startDateIso: '2026-01-15',
      });

      expect(schedule).toHaveLength(3);

      // Every installment must have 0 interest
      schedule.forEach((inst) => {
        expect(inst.interestPortion).toBe(0);
        expect(inst.totalAmount).toBe(inst.principalPortion);
      });

      // Sum of principalPortion must exactly equal original principal
      const sumPrincipal = schedule.reduce((acc, inst) => acc + inst.principalPortion, 0);
      expect(sumPrincipal).toBe(principal);

      // Final remaining balance must be exactly 0
      expect(schedule[schedule.length - 1].remainingBalanceAfter).toBe(0);

      // Correct installment numbering
      expect(schedule.map((s) => s.installmentNumber)).toEqual([1, 2, 3]);
    });
  });

  describe('generateAmortizationSchedule — Standard Interest Rate (نرخ معمولی)', () => {
    it('generates accurate schedule where sum of principal portions equals principal and final balance is zero', () => {
      const principal = 120000000; // 120 million tomans
      const annualRatePct = 23; // 23%
      const installmentCount = 12; // 12 months
      const startDateIso = '2026-01-10';

      const schedule = generateAmortizationSchedule({
        principal,
        annualRatePct,
        installmentCount,
        startDateIso,
      });

      expect(schedule).toHaveLength(12);

      // Interest should be positive and decreasing, principal should be increasing
      expect(schedule[0].interestPortion).toBeGreaterThan(0);
      expect(schedule[0].interestPortion).toBeGreaterThan(schedule[11].interestPortion);
      expect(schedule[11].principalPortion).toBeGreaterThan(schedule[0].principalPortion);

      // Total amount should match sum of principal and interest portions
      schedule.forEach((inst) => {
        expect(inst.totalAmount).toBe(inst.principalPortion + inst.interestPortion);
      });

      // Crucial requirement: Sum of principalPortion must EXACTLY equal principal
      const sumPrincipal = schedule.reduce((acc, inst) => acc + inst.principalPortion, 0);
      expect(sumPrincipal).toBe(principal);

      // Crucial requirement: remaining balance after last installment must be exactly 0
      expect(schedule[11].remainingBalanceAfter).toBe(0);
    });

    it('works correctly with different installment counts and rates', () => {
      const testCases = [
        { principal: 50000000, annualRatePct: 18, installmentCount: 24 },
        { principal: 250000000, annualRatePct: 21, installmentCount: 36 },
        { principal: 7350000, annualRatePct: 4, installmentCount: 10 },
      ];

      for (const tc of testCases) {
        const schedule = generateAmortizationSchedule({
          ...tc,
          startDateIso: '2026-05-01',
        });

        expect(schedule).toHaveLength(tc.installmentCount);

        const sumPrincipal = schedule.reduce((acc, inst) => acc + inst.principalPortion, 0);
        expect(sumPrincipal).toBe(tc.principal);
        expect(schedule[schedule.length - 1].remainingBalanceAfter).toBe(0);
      }
    });
  });

  describe('Date Clamping (جلوگیری از Overflow روزهای ماه)', () => {
    it('clamps 31st to 28th/29th in February and 30th in 30-day months without overflowing', () => {
      // Start date: 2026-01-31 (not a leap year)
      const schedule = generateAmortizationSchedule({
        principal: 6000000,
        annualRatePct: 0,
        installmentCount: 4,
        startDateIso: '2026-01-31',
      });

      expect(schedule[0].dueDateIso).toBe('2026-02-28'); // Month 2 clamped to 28
      expect(schedule[1].dueDateIso).toBe('2026-03-31'); // Month 3 restored to 31
      expect(schedule[2].dueDateIso).toBe('2026-04-30'); // Month 4 clamped to 30
      expect(schedule[3].dueDateIso).toBe('2026-05-31'); // Month 5 restored to 31
    });

    it('handles leap years correctly for February 29th', () => {
      // 2028 is a leap year
      const schedule = generateAmortizationSchedule({
        principal: 1000000,
        annualRatePct: 0,
        installmentCount: 2,
        startDateIso: '2028-01-31',
      });

      expect(schedule[0].dueDateIso).toBe('2028-02-29'); // Leap year Feb has 29 days
      expect(schedule[1].dueDateIso).toBe('2028-03-31');
    });

    it('supports custom intervalMonths (e.g. quarterly payments)', () => {
      const schedule = generateAmortizationSchedule({
        principal: 12000000,
        annualRatePct: 12,
        installmentCount: 4,
        startDateIso: '2026-01-31',
        intervalMonths: 3,
      });

      expect(schedule).toHaveLength(4);
      expect(schedule[0].dueDateIso).toBe('2026-04-30'); // Jan 31 + 3 months -> Apr 30
      expect(schedule[1].dueDateIso).toBe('2026-07-31'); // Apr + 3 months -> Jul 31
      expect(schedule[2].dueDateIso).toBe('2026-10-31'); // Jul + 3 months -> Oct 31
      expect(schedule[3].dueDateIso).toBe('2027-01-31'); // Oct + 3 months -> Jan 31 (next year)

      const sumPrincipal = schedule.reduce((acc, inst) => acc + inst.principalPortion, 0);
      expect(sumPrincipal).toBe(12000000);
      expect(schedule[3].remainingBalanceAfter).toBe(0);
    });
  });

  describe('recalculateFromBalance (بازمحاسبه از مانده مشخص)', () => {
    it('amortizes remaining balance starting from anchorInstallmentNumber + 1', () => {
      // 4 installments already paid, 6 remaining out of 10
      // anchorBalance = 60,000,000 at 23%
      const remainingSchedule = recalculateFromBalance({
        anchorBalance: 60000000,
        anchorInstallmentNumber: 4,
        remainingCount: 6,
        annualRatePct: 23,
        intervalMonths: 1,
        startDateIso: '2026-01-10',
      });

      expect(remainingSchedule).toHaveLength(6);

      // Installment numbers start from 5 to 10
      expect(remainingSchedule.map((s) => s.installmentNumber)).toEqual([5, 6, 7, 8, 9, 10]);

      // Due dates offset correctly from start date (month 1 + 5 = month 6 June, etc.)
      expect(remainingSchedule[0].dueDateIso).toBe('2026-06-10');
      expect(remainingSchedule[5].dueDateIso).toBe('2026-11-10');

      // Sum of principal portions must exactly equal anchorBalance
      const sumPrincipal = remainingSchedule.reduce((sum, item) => sum + item.principalPortion, 0);
      expect(sumPrincipal).toBe(60000000);

      // Final remaining balance must be 0
      expect(remainingSchedule[5].remainingBalanceAfter).toBe(0);
    });

    it('handles zero remaining count or zero balance gracefully', () => {
      expect(recalculateFromBalance({ anchorBalance: 0, remainingCount: 5, startDateIso: '2026-01-01' })).toEqual([]);
      expect(recalculateFromBalance({ anchorBalance: 1000000, remainingCount: 0, startDateIso: '2026-01-01' })).toEqual([]);
    });
  });

  describe('calculatePayoffScheduleFixedAmount (کاهش تعداد اقساط با قسط ثابت)', () => {
    it('simulates faster payoff when fixed installment is higher than standard PMT', () => {
      // 50,000,000 Tomans at 18%
      // Standard 12-month PMT is ~4,584,000
      // User pays fixed amount of 10,000,000 monthly
      const schedule = calculatePayoffScheduleFixedAmount({
        remainingBalance: 50000000,
        fixedInstallmentAmount: 10000000,
        annualRatePct: 18,
        intervalMonths: 1,
        startDateIso: '2026-01-01',
        anchorInstallmentNumber: 2,
      });

      // At 10M per month, it should finish in 6 installments (installments 3, 4, 5, 6, 7, 8)
      expect(schedule.length).toBeLessThan(12);
      expect(schedule[0].installmentNumber).toBe(3);

      // Sum of principal portions must equal 50,000,000
      const totalPrincipal = schedule.reduce((sum, item) => sum + item.principalPortion, 0);
      expect(totalPrincipal).toBe(50000000);

      // Last installment must reach exact zero balance
      expect(schedule[schedule.length - 1].remainingBalanceAfter).toBe(0);

      // Last installment principal is clamped to exact remaining balance
      const lastInst = schedule[schedule.length - 1];
      expect(lastInst.principalPortion).toBeLessThanOrEqual(10000000);
      expect(lastInst.totalAmount).toBe(lastInst.principalPortion + lastInst.interestPortion);
    });

    it('handles edge case: fixed installment amount >= entire remaining balance', () => {
      // 5,000,000 remaining, user pays 6,000,000
      const schedule = calculatePayoffScheduleFixedAmount({
        remainingBalance: 5000000,
        fixedInstallmentAmount: 6000000,
        annualRatePct: 12,
        intervalMonths: 1,
        startDateIso: '2026-01-01',
        anchorInstallmentNumber: 5,
      });

      expect(schedule).toHaveLength(1);
      expect(schedule[0].installmentNumber).toBe(6);
      expect(schedule[0].principalPortion).toBe(5000000); // Clamped to balance
      expect(schedule[0].remainingBalanceAfter).toBe(0);
      // Interest = 5,000,000 * 0.01 = 50,000
      expect(schedule[0].interestPortion).toBe(50000);
      expect(schedule[0].totalAmount).toBe(5050000);
    });

    it('handles zero interest (قرض‌الحسنه) correctly', () => {
      const schedule = calculatePayoffScheduleFixedAmount({
        remainingBalance: 30000000,
        fixedInstallmentAmount: 10000000,
        annualRatePct: 0,
        startDateIso: '2026-01-01',
      });

      expect(schedule).toHaveLength(3);
      schedule.forEach((inst) => {
        expect(inst.interestPortion).toBe(0);
        expect(inst.totalAmount).toBe(inst.principalPortion);
      });
      expect(schedule[2].remainingBalanceAfter).toBe(0);
    });

    it('throws meaningful error if fixed installment is less than periodic interest (never ends)', () => {
      // 100,000,000 at 24% annual rate -> periodic monthly rate = 2% -> interest = 2,000,000
      // User specifies fixed installment of 1,500,000 (less than 2,000,000 interest)
      expect(() => {
        calculatePayoffScheduleFixedAmount({
          remainingBalance: 100000000,
          fixedInstallmentAmount: 1500000,
          annualRatePct: 24,
          intervalMonths: 1,
          startDateIso: '2026-01-01',
        });
      }).toThrow('مبلغ قسط ثابت کمتر یا مساوی بهره دوره‌ای است و وام هرگز تسویه نخواهد شد.');
    });

    it('returns empty array when remainingBalance is 0 or negative', () => {
      expect(calculatePayoffScheduleFixedAmount({
        remainingBalance: 0,
        fixedInstallmentAmount: 1000000,
        startDateIso: '2026-01-01',
      })).toEqual([]);
    });
  });
});
