/**
 * flowYear.test.js — Incomes / expenses by Shamsi month and year: the window loaded, the year
 * month by month with the change from the month before, and the month-so-far comparison
 */
import { describe, it, expect } from 'vitest';
import {
  buildYearSeries,
  flowWindow,
  monthProgress,
  shamsiMonthRange,
  shamsiYearRange,
  summarizeYear,
} from '../../../web/src/shared/flow/flowYear.js';

const day = (jy, jm, d = 1) => {
  const { from } = shamsiMonthRange(jy, jm);
  return new Date(Date.parse(from) + (d - 1) * 86400000).toISOString().slice(0, 10);
};

describe('flow year', () => {
  it('loads the year and the month before it', () => {
    expect(shamsiYearRange(1405)).toEqual({ from: '2026-03-21', to: '2027-03-20' });
    expect(flowWindow(1405)).toEqual({ from: shamsiMonthRange(1404, 12).from, to: '2027-03-20' });
    // Several years reach back that many years (and the month before the first)
    expect(flowWindow(1405, 3)).toEqual({ from: shamsiMonthRange(1402, 12).from, to: '2027-03-20' });
  });

  it('builds the year month by month, Farvardin against last Esfand', () => {
    const points = [
      { date: day(1404, 12, 5), amount: 100, category: 'salary' },
      { date: day(1404, 11, 5), amount: 999, category: 'salary' }, // outside: ignored
      { date: day(1405, 1, 2), amount: 150, category: 'salary' },
      { date: day(1405, 1, 20), amount: 50, category: 'gift' },
      { date: day(1405, 3, 1), amount: 100 },
    ];
    const series = buildYearSeries(points, 1405, { throughMonth: 3 });
    expect(series.map((m) => [m.jm, m.total, m.count])).toEqual([[1, 200, 2], [2, 0, 0], [3, 100, 1]]);
    expect(series[0].byCategory).toEqual({ salary: 150, gift: 50 });
    expect(series[0].change).toBe(100);
    expect(series[1].change).toBe(-100);
    expect(series[2].change).toBe(null);
    expect(series[2].byCategory).toEqual({ other: 100 });
    expect(series[0].label).toBe('فروردین ۱۴۰۵');
    expect(buildYearSeries(points, 1405)).toHaveLength(12);
  });

  it('runs through several years, month by month, naming only the years on the axis', () => {
    const points = [
      { date: day(1402, 12, 5), amount: 100 }, // the month before the span: only the first change reads it
      { date: day(1403, 1, 2), amount: 150 },
      { date: day(1404, 2, 3), amount: 50 },
      { date: day(1405, 1, 9), amount: 70 },
      { date: day(1405, 6, 1), amount: 999 }, // after throughMonth: left out
    ];
    const series = buildYearSeries(points, 1405, { throughMonth: 3, years: 3 });
    expect(series).toHaveLength(12 + 12 + 3);
    expect(series[0]).toMatchObject({ key: '1403/01', jy: 1403, total: 150, change: 50 });
    expect(series[13]).toMatchObject({ key: '1404/02', jy: 1404, total: 50 });
    expect(series.at(-1).key).toBe('1405/03');
    expect(series.reduce((sum, m) => sum + m.total, 0)).toBe(270);
    expect(series.filter((m) => m.monthLabel).map((m) => m.jy)).toEqual([1403, 1404, 1405]);
    expect(series[12].label).toBe('فروردین ۱۴۰۴');
  });

  it('summarizes the year', () => {
    const series = buildYearSeries([
      { date: day(1405, 1), amount: 100, category: 'a' },
      { date: day(1405, 2), amount: 300, category: 'b' },
      { date: day(1405, 2), amount: 50, category: 'a' },
    ], 1405, { throughMonth: 4 });
    const s = summarizeYear(series);
    expect(s).toMatchObject({ total: 450, count: 3, months: 4, monthlyAverage: 112.5 });
    expect(s.top.jm).toBe(2);
    expect(s.low.jm).toBe(1);
    expect(s.byCategory).toEqual([{ category: 'b', total: 300 }, { category: 'a', total: 150 }]);
  });

  it('a running month is compared with the same days of the month before', () => {
    const running = monthProgress({ jy: 1405, jm: 2 }, day(1405, 2, 10));
    expect(running).toMatchObject({ current: true, days: 10, cutoff: day(1405, 1, 10) });
    const past = monthProgress({ jy: 1405, jm: 1 }, day(1405, 2, 10));
    expect(past).toMatchObject({ current: false, days: 31, cutoff: shamsiMonthRange(1404, 12).to });
  });

  it('groups by salary month when months start at the salary', () => {
    // Salary on 25 Mehr starts Aban; on 20 Aban starts Azar
    const starts = [day(1405, 8, 20), day(1405, 7, 25)];
    const points = [
      { date: day(1405, 7, 24), amount: 10, category: 'a' }, // Mehr
      { date: day(1405, 7, 25), amount: 100, category: 'a' }, // the salary: Aban
      { date: day(1405, 8, 19), amount: 5, category: 'b' }, // still Aban
      { date: day(1405, 8, 20), amount: 200, category: 'a' }, // Azar
    ];
    const series = buildYearSeries(points, 1405, { throughMonth: 9, starts });
    expect(series.map((m) => m.total).slice(6)).toEqual([10, 105, 200]);
    expect(series[7].byCategory).toEqual({ a: 100, b: 5 });
    // Calendar months without the salary days
    expect(buildYearSeries(points, 1405, { throughMonth: 9 }).map((m) => m.total).slice(6)).toEqual([110, 205, 0]);
  });

  it('reaches the salary year: Farvardin started by an Esfand salary', () => {
    const starts = [day(1404, 12, 20), day(1404, 11, 20)];
    expect(shamsiYearRange(1405, starts).from).toBe(day(1404, 12, 20));
    expect(flowWindow(1405, 1, starts).from).toBe(day(1404, 11, 20));
    const series = buildYearSeries([{ date: day(1404, 12, 25), amount: 7 }], 1405, { throughMonth: 1, starts });
    expect(series[0].total).toBe(7);
  });
});
