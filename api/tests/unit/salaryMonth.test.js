import { describe, it, expect } from 'vitest';
import { salaryMonthOf, salaryMonthRange, currentSalaryMonth, validateSalaryMonths } from '../../src/domain/salaryMonth.js';
import { shamsiMonthRange } from '../../src/domain/expenseDocument.js';

const mehr = shamsiMonthRange(1405, 7);
const shahrivar = shamsiMonthRange(1405, 6);
const day = (iso, n) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

describe('salary months', () => {
  it('is the calendar month without marks', () => {
    expect(salaryMonthRange(1405, 7, [])).toEqual(mehr);
    expect(currentSalaryMonth(mehr.from, [])).toEqual({ jy: 1405, jm: 7 });
  });

  it('a late-month mark starts the next month and ends the one before it the day before', () => {
    const mark = day(shahrivar.to, -5); // day 26 of Shahrivar
    expect(salaryMonthOf(mark)).toEqual({ jy: 1405, jm: 7 });
    expect(salaryMonthRange(1405, 7, [mark]).from).toBe(mark);
    expect(salaryMonthRange(1405, 6, [mark]).to).toBe(day(mark, -1));
    expect(currentSalaryMonth(mark, [mark])).toEqual({ jy: 1405, jm: 7 });
    expect(currentSalaryMonth(day(mark, -1), [mark])).toEqual({ jy: 1405, jm: 6 });
  });

  it('an early-month mark starts the month it is in', () => {
    const mark = day(mehr.from, 2);
    expect(salaryMonthOf(mark)).toEqual({ jy: 1405, jm: 7 });
    expect(salaryMonthRange(1405, 7, [mark]).from).toBe(mark);
    expect(salaryMonthRange(1405, 6, [mark]).to).toBe(day(mark, -1));
  });

  it('keeps months in a row without gaps', () => {
    const marks = [day(shahrivar.to, -5), day(mehr.to, -3)];
    const a = salaryMonthRange(1405, 7, marks);
    const b = salaryMonthRange(1405, 8, marks);
    expect(day(a.to, 1)).toBe(b.from);
  });

  it('validates and sorts the days, dropping invalid ones', () => {
    expect(validateSalaryMonths({ starts: ['2026-09-01', 'x', '2026-10-01', '2026-09-01'] }).value.starts).toEqual(['2026-10-01', '2026-09-01']);
  });
});
