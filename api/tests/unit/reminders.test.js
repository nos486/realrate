import { describe, it, expect } from 'vitest';
import {
  validateReminder,
  reminderOf,
  occurrencesBetween,
  REMINDER_KINDS,
} from '../../src/domain/reminders.js';
import { createLoanDoc, markInstallmentPaidDoc } from '../../src/domain/loanDocument.js';
import { validateChequeInput } from '../../src/domain/chequeDocument.js';
import { validateRecurringIncome } from '../../src/domain/recurringIncome.js';

describe('validateReminder', () => {
  it('accepts valid reminder objects for all kinds', () => {
    const loanRem = {
      kind: 'loan',
      recordId: 'loan_123',
      dueDate: '2026-10-15',
      intervalMonths: 1,
      remaining: 12,
      direction: '',
      muted: false,
    };
    const res = validateReminder(loanRem);
    expect(res.error).toBeUndefined();
    expect(res.value).toEqual(loanRem);

    const chequeRem = {
      kind: 'cheque',
      recordId: 'chq_456',
      dueDate: '2026-11-01',
      intervalMonths: 0,
      remaining: 1,
      direction: 'issued',
      muted: true,
    };
    const res2 = validateReminder(chequeRem);
    expect(res2.error).toBeUndefined();
    expect(res2.value).toEqual(chequeRem);

    const rincRem = {
      kind: 'recurring_income',
      recordId: 'rinc_789',
      dueDate: '2026-10-20',
      intervalMonths: 3,
      remaining: null,
      direction: '',
      muted: false,
    };
    const res3 = validateReminder(rincRem);
    expect(res3.error).toBeUndefined();
    expect(res3.value).toEqual(rincRem);
  });

  it('rejects bad input', () => {
    expect(validateReminder(null).error).toBeTruthy();
    expect(validateReminder({}).error).toBeTruthy();
    expect(validateReminder({ kind: 'unknown', recordId: '1', dueDate: '2026-10-10' }).error).toMatch(/نوع یادآوری/);
    expect(validateReminder({ kind: 'loan', recordId: '', dueDate: '2026-10-10' }).error).toMatch(/شناسه رکورد/);
    expect(validateReminder({ kind: 'loan', recordId: 'l1', dueDate: 'invalid-date' }).error).toMatch(/تاریخ سررسید/);
    expect(validateReminder({ kind: 'loan', recordId: 'l1', dueDate: '2026-02-31' }).error).toMatch(/تاریخ سررسید/);
    expect(validateReminder({ kind: 'loan', recordId: 'l1', dueDate: '2026-10-10', intervalMonths: -1 }).error).toMatch(/فاصله تکرار/);
    expect(validateReminder({ kind: 'loan', recordId: 'l1', dueDate: '2026-10-10', intervalMonths: 13 }).error).toMatch(/فاصله تکرار/);
    expect(validateReminder({ kind: 'loan', recordId: 'l1', dueDate: '2026-10-10', remaining: -1 }).error).toMatch(/تعداد دفعات/);
    expect(validateReminder({ kind: 'loan', recordId: 'l1', dueDate: '2026-10-10', remaining: 601 }).error).toMatch(/تعداد دفعات/);
    expect(validateReminder({ kind: 'cheque', recordId: 'c1', dueDate: '2026-10-10', direction: 'invalid' }).error).toMatch(/جهت چک/);
  });
});

describe('reminderOf', () => {
  it('loan: unpaid installments, after paying one, fully paid, Shamsi start dates', () => {
    // 1. Initial loan with 3 installments
    const doc = createLoanDoc({
      id: 'loan_test_1',
      title: 'وام مسکن',
      principalAmount: 30_000_000,
      installmentCount: 3,
      intervalMonths: 1,
      startDate: '2026-10-01',
      annualInterestRate: 0,
    }, { now: '2026-10-01T00:00:00Z' });

    const rem1 = reminderOf('loan', doc);
    expect(rem1).toMatchObject({
      kind: 'loan',
      recordId: 'loan_test_1',
      intervalMonths: 1,
      remaining: 3,
      direction: '',
      muted: false,
    });
    expect(rem1.dueDate).toBeTruthy();

    // 2. After paying installment 1
    const inst1Id = doc.states[0]?.id || '1';
    const { doc: paidDoc1 } = markInstallmentPaidDoc(doc, inst1Id, { paidDate: '2026-10-01' }, { now: '2026-10-01T00:00:00Z' });
    const rem2 = reminderOf('loan', paidDoc1);
    expect(rem2).toMatchObject({
      kind: 'loan',
      recordId: 'loan_test_1',
      intervalMonths: 1,
      remaining: 2,
    });
    // Due date moved to installment 2
    expect(rem2.dueDate).not.toBe(rem1.dueDate);

    // 3. Fully paid loan
    const inst2Id = paidDoc1.states.find((s) => !s.isPaid)?.id || '2';
    const { doc: paidDoc2 } = markInstallmentPaidDoc(paidDoc1, inst2Id, { paidDate: '2026-11-01' }, { now: '2026-11-01T00:00:00Z' });
    const inst3Id = paidDoc2.states.find((s) => !s.isPaid)?.id || '3';
    const { doc: fullyPaidDoc } = markInstallmentPaidDoc(paidDoc2, inst3Id, { paidDate: '2026-12-01' }, { now: '2026-12-01T00:00:00Z' });

    expect(reminderOf('loan', fullyPaidDoc)).toBeNull();

    // 4. Shamsi start date
    const shamsiDoc = createLoanDoc({
      id: 'loan_shamsi',
      title: 'وام با تاریخ شمسی',
      principalAmount: 10_000_000,
      installmentCount: 2,
      intervalMonths: 1,
      startDate: '1405-07-01',
    }, { now: '2026-09-23T00:00:00Z' });
    const remShamsi = reminderOf('loan', shamsiDoc);
    expect(remShamsi).not.toBeNull();
    expect(remShamsi.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('cheque: open and closed, direction on and off', () => {
    const { value: openCheque } = validateChequeInput({
      direction: 'received',
      status: 'pending',
      amount: 5_000_000,
      dueDate: '2026-10-15',
      counterparty: 'طرف حساب',
    });
    openCheque.id = 'chq_open';

    // Direction off
    const remNoDir = reminderOf('cheque', openCheque, { includeDirection: false });
    expect(remNoDir).toEqual({
      kind: 'cheque',
      recordId: 'chq_open',
      dueDate: '2026-10-15',
      intervalMonths: 0,
      remaining: 1,
      direction: '',
      muted: false,
    });

    // Direction on
    const remWithDir = reminderOf('cheque', openCheque, { includeDirection: true });
    expect(remWithDir.direction).toBe('received');

    // Closed cheques (cleared, cancelled, bounced) return null
    for (const status of ['cleared', 'cancelled', 'bounced']) {
      const closed = { ...openCheque, status };
      expect(reminderOf('cheque', closed)).toBeNull();
    }
  });

  it('fixed income: active and ended', () => {
    const { value: activeRule } = validateRecurringIncome({
      title: 'حقوق ماهانه',
      amount: 25_000_000,
      startDate: '2026-10-01',
      intervalMonths: 1,
      dayOfMonth: 10,
    });
    activeRule.id = 'rinc_active';

    const remActive = reminderOf('recurring_income', activeRule);
    expect(remActive).toMatchObject({
      kind: 'recurring_income',
      recordId: 'rinc_active',
      intervalMonths: 1,
      remaining: null,
      muted: false,
    });
    expect(remActive.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Paused rule
    const pausedRule = { ...activeRule, active: false };
    expect(reminderOf('recurring_income', pausedRule)).toBeNull();

    // Ended rule (endDate passed and generated through end)
    const { value: endedRule } = validateRecurringIncome({
      title: 'اجاره تمام‌شده',
      amount: 10_000_000,
      startDate: '2026-01-01',
      endDate: '2026-03-01',
      generatedThrough: '2026-03-01',
      intervalMonths: 1,
    });
    expect(reminderOf('recurring_income', endedRule)).toBeNull();
  });

  it('muted flag is respected and passed on per-record', () => {
    const loanDoc = createLoanDoc({
      id: 'l_muted',
      title: 'وام سایلنت',
      principalAmount: 5_000_000,
      installmentCount: 2,
      remindersMuted: true,
      startDate: '2026-10-01',
    });
    expect(reminderOf('loan', loanDoc).muted).toBe(true);

    const cheque = {
      id: 'c_muted',
      direction: 'issued',
      status: 'pending',
      amount: 1_000_000,
      dueDate: '2026-10-25',
      remindersMuted: true,
    };
    expect(reminderOf('cheque', cheque).muted).toBe(true);

    const rinc = {
      id: 'r_muted',
      title: 'درآمد سایلنت',
      amount: 100_000,
      startDate: '2026-10-01',
      intervalMonths: 1,
      dayOfMonth: 5,
      remindersMuted: true,
      active: true,
    };
    expect(reminderOf('recurring_income', rinc).muted).toBe(true);
  });
});

describe('occurrencesBetween', () => {
  it('monthly: rolls forward 1 month at a time in Jalali calendar', () => {
    // Starting on 2026-10-15
    const rem = {
      dueDate: '2026-10-15',
      intervalMonths: 1,
      remaining: 4,
    };
    // Window spanning 3 months
    const dates = occurrencesBetween(rem, '2026-10-01', '2026-12-31');
    expect(dates).toHaveLength(3);
    expect(dates[0]).toBe('2026-10-15');
    // Each date is strictly increasing
    expect(dates[1] > dates[0]).toBe(true);
    expect(dates[2] > dates[1]).toBe(true);
  });

  it('every 3 months: rolls forward 3 months at a time', () => {
    const rem = {
      dueDate: '2026-10-15',
      intervalMonths: 3,
      remaining: 4,
    };
    const dates = occurrencesBetween(rem, '2026-10-01', '2027-06-01');
    expect(dates.length).toBe(3);
    expect(dates[0]).toBe('2026-10-15');
  });

  it('end-of-month clamping: clamps 31st to 30th/29th in Persian calendar', () => {
    // 2026-09-22 is 1405-06-31 (Shahrivar 31)
    const rem = {
      dueDate: '2026-09-22',
      intervalMonths: 1,
      remaining: 6,
    };
    const dates = occurrencesBetween(rem, '2026-09-01', '2026-12-01');
    expect(dates.length).toBe(3);
    expect(dates[0]).toBe('2026-09-22'); // Shahrivar 31
    // Next is Mehr 30 (Mehr has 30 days) -> 2026-10-22
    expect(dates[1]).toBe('2026-10-22');
    // Next is Aban 30 (Aban has 30 days) -> 2026-11-21
    expect(dates[2]).toBe('2026-11-21');
  });

  it('remaining exhaustion: stops when remaining occurrences are reached', () => {
    const rem = {
      dueDate: '2026-10-01',
      intervalMonths: 1,
      remaining: 2, // only 2 left
    };
    // Window spans 6 months
    const dates = occurrencesBetween(rem, '2026-10-01', '2027-04-01');
    expect(dates).toHaveLength(2);
  });

  it('open-ended: remaining is null (fixed income)', () => {
    const rem = {
      dueDate: '2026-10-01',
      intervalMonths: 1,
      remaining: null,
    };
    const dates = occurrencesBetween(rem, '2026-10-01', '2027-03-31');
    expect(dates.length).toBe(7);
  });

  it('returns empty when window does not overlap or reminder is invalid', () => {
    const rem = { dueDate: '2026-10-15', intervalMonths: 0, remaining: 1 };
    expect(occurrencesBetween(rem, '2026-11-01', '2026-11-30')).toEqual([]);
    expect(occurrencesBetween(null, '2026-10-01', '2026-10-31')).toEqual([]);
    expect(occurrencesBetween(rem, '2026-10-31', '2026-10-01')).toEqual([]);
  });
});
