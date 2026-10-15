/**
 * netWorth.test.js — the reports page's net worth: portfolios plus open received cheques, minus
 * the loans' unpaid installments and open issued cheques, at each month's end, against the dollar
 */
import { describe, it, expect } from 'vitest';
import {
  previousDay,
  loanDebtAt,
  chequeStatusAt,
  chequesAt,
  firstNetWorthDay,
  seriesValueAt,
  netWorthAt,
  buildNetWorthYear,
  compareWithDollar,
  changeByMonth,
} from '../../../web/src/features/reports/netWorth.js';

// 1405: Farvardin 1 = 2026-03-21, Ordibehesht 1 = 2026-04-21, Khordad 1 = 2026-05-22
const loan = {
  startDate: '2026-03-25',
  installments: [
    { dueDate: '2026-04-25', totalAmount: 100, isPaid: true, paidDate: '2026-04-20' },
    { dueDate: '2026-05-25', totalAmount: 100, isPaid: true, paidDate: '' },
    { dueDate: '2026-06-25', totalAmount: 100, isPaid: false },
  ],
  extraPayments: [{ paymentDate: '2026-05-01', amount: 50 }],
};

const cheque = (direction, amount, history) => ({ direction, amount, status: history[history.length - 1].status, history });

describe('previousDay', () => {
  it('steps back across a month and a year', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
  });
});

describe('loanDebtAt', () => {
  it('owes nothing before the loan starts', () => {
    expect(loanDebtAt(loan, '2026-03-24')).toBe(0);
  });

  it('counts the installments not paid by that day, and the extra payments made after it', () => {
    expect(loanDebtAt(loan, '2026-03-25')).toBe(350);
    // The first was paid on the 20th
    expect(loanDebtAt(loan, '2026-04-20')).toBe(250);
    // The extra payment is made
    expect(loanDebtAt(loan, '2026-05-01')).toBe(200);
    // A paid installment with no date counts as paid on its due date
    expect(loanDebtAt(loan, '2026-05-25')).toBe(100);
  });
});

describe('cheques', () => {
  const received = cheque('received', 500, [{ status: 'pending', date: '2026-04-01' }, { status: 'cleared', date: '2026-04-10' }]);
  const issued = cheque('issued', 200, [{ status: 'pending', date: '2026-04-05' }]);

  it('reads the status the tracking log gives on a day', () => {
    expect(chequeStatusAt(received, '2026-03-31')).toBeNull();
    expect(chequeStatusAt(received, '2026-04-09')).toBe('pending');
    expect(chequeStatusAt(received, '2026-04-10')).toBe('cleared');
  });

  it('counts a cheque with no log from its issue date', () => {
    expect(chequeStatusAt({ status: 'pending', issueDate: '2026-04-02' }, '2026-04-01')).toBeNull();
    expect(chequeStatusAt({ status: 'pending', issueDate: '2026-04-02' }, '2026-04-02')).toBe('pending');
  });

  it('adds the open received ones and takes away the open issued ones', () => {
    expect(chequesAt([received, issued], '2026-04-06')).toEqual({ receivable: 500, payable: 200 });
    expect(chequesAt([received, issued], '2026-04-11')).toEqual({ receivable: 0, payable: 200 });
  });
});

describe('seriesValueAt', () => {
  const series = { days: ['2026-04-01', '2026-04-02', '2026-04-03'], toman: [10, 20, 30] };
  it('is 0 before the series, its value inside, and its last value after', () => {
    expect(seriesValueAt(series, '2026-03-31')).toBe(0);
    expect(seriesValueAt(series, '2026-04-02')).toBe(20);
    expect(seriesValueAt(series, '2026-05-01')).toBe(30);
    expect(seriesValueAt(null, '2026-04-02')).toBe(0);
  });
});

describe('netWorthAt', () => {
  it('adds what is owned and takes away what is owed, and divides by the day\'s dollar', () => {
    const p = netWorthAt({
      portfolioSeries: { days: ['2026-04-01'], toman: [1000] },
      loans: [loan],
      cheques: [cheque('issued', 200, [{ status: 'pending', date: '2026-04-01' }])],
      usdAt: () => 10,
    }, '2026-04-01');
    expect(p).toMatchObject({ assets: 1000, loans: 350, payable: 200, receivable: 0, net: 450, usdRate: 10, usd: 45 });
  });

  it('takes today\'s portfolio value when there is no series, and no dollar view without a rate', () => {
    const p = netWorthAt({ portfolioSeries: null, portfolioToday: 700 }, '2026-04-01');
    expect(p.net).toBe(700);
    expect(p.usd).toBeNull();
  });
});

describe('firstNetWorthDay', () => {
  it('is the earliest of a portfolio\'s first day, a loan\'s start and a cheque\'s first entry', () => {
    expect(firstNetWorthDay({
      portfolioSeries: { days: ['2026-04-01'] },
      loans: [loan],
      cheques: [cheque('issued', 1, [{ status: 'pending', date: '2026-03-30' }])],
    })).toBe('2026-03-25');
    expect(firstNetWorthDay({})).toBe('');
  });
});

describe('buildNetWorthYear', () => {
  // The portfolio holds 1000 tomans from 1404's end; the dollar doubles over Farvardin
  const days = ['2026-03-20', '2026-03-21'];
  const input = {
    portfolioSeries: { days, toman: [1000, 1000] },
    loans: [],
    cheques: [],
    usdAt: (d) => (d < '2026-03-21' ? 10 : d <= '2026-04-20' ? 20 : 25),
    today: '2026-05-01',
  };

  it('values the end of each month so far (today for this month), from the end of the year before', () => {
    const year = buildNetWorthYear(input, 1405, { throughMonth: 2 });
    expect(year.start.day).toBe('2026-03-20');
    expect(year.months.map((m) => m.point.day)).toEqual(['2026-04-20', '2026-05-01']);
    expect(year.end.day).toBe('2026-05-01');
    expect(year.end.usd).toBe(40);
  });

  it('leaves out a month that ended before anything was recorded, and starts from the first month with data', () => {
    const later = { ...input, portfolioSeries: { days: ['2026-04-25'], toman: [1000] } };
    const year = buildNetWorthYear(later, 1405, { throughMonth: 2 });
    expect(year.months[0].point).toBeNull();
    expect(year.start.day).toBe('2026-05-01');
  });

  it('compares the change with the dollar\'s', () => {
    const year = buildNetWorthYear(input, 1405, { throughMonth: 2 });
    const c = compareWithDollar(year.start, year.end);
    expect(c).toMatchObject({ change: 0, pct: 0, dollarPct: 150, usdPct: -60, beatDollar: false });
    const months = changeByMonth(year);
    expect(months.map((m) => m.dollarPct)).toEqual([100, 150]);
    expect(months.map((m) => m.netPct)).toEqual([0, 0]);
  });

  it('is empty when nothing is recorded', () => {
    const year = buildNetWorthYear({ ...input, portfolioSeries: null }, 1405, { throughMonth: 2 });
    expect(year.start).toBeNull();
    expect(year.end).toBeNull();
    expect(compareWithDollar(year.start, year.end)).toBeNull();
  });
});
