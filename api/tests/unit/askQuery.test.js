/**
 * askQuery.test.js — «از داده‌هایت بپرس»: a Persian question is read into a period, category,
 * amount bounds and intent, and answered from the period's records
 */
import { describe, it, expect } from 'vitest';
import { parseQuestion, answerQuestion, parsePeriod } from '../../../web/src/features/reports/askQuery.js';

// 1405-08-14 (Aban 14)
const TODAY = '2026-11-05';
const categories = {
  expense: [
    { value: 'dining', label: 'رستوران و کافه' },
    { value: 'groceries', label: 'خوراک و خواربار' },
    { value: 'investment', label: 'سرمایه‌گذاری' },
  ],
  income: [{ value: 'salary', label: 'حقوق' }],
};
const ask = (q) => parseQuestion(q, { today: TODAY, categories });

describe('parseQuestion', () => {
  it('reads category and a several-month period', () => {
    const q = ask('خرج رستوران سه ماه اخیر؟');
    expect(q.kind).toBe('expense');
    expect(q.categories).toEqual(['dining']);
    expect(q.period.key).toBe('months');
    expect(q.period.params.n).toBe(3);
    expect(q.period.to).toBe(TODAY);
    expect(q.terms).toEqual([]);
  });

  it('reads Persian digits and amount bounds', () => {
    const q = ask('هزینه‌های بیشتر از ۵ میلیون امسال');
    expect(q.min).toBe(5_000_000);
    expect(q.period.key).toBe('year');
  });

  it('reads incomes, counts and free words', () => {
    expect(ask('درآمد ماه قبل').kind).toBe('income');
    expect(ask('چند بار تاکسی رفتم').intent).toBe('count');
    expect(ask('چند بار تاکسی رفتم').terms).toContain('تاکسی');
    expect(ask('بیشترین خرج دیروز').intent).toBe('top');
  });

  it('defaults to this month and handles a named month', () => {
    expect(ask('خرج غذا').period.key).toBe('thisMonth');
    const p = parsePeriod('خرج مهر', TODAY);
    expect(p.params.month).toBe('مهر');
    expect(p.from).toBe('2026-09-23');
    expect(p.to).toBe('2026-10-22');
  });
});

describe('answerQuestion', () => {
  const records = [
    { id: '1', title: 'ناهار', date: '2026-10-25', category: 'dining', amount: 300 },
    { id: '2', title: 'شام', date: '2026-11-01', category: 'dining', amount: 700 },
    { id: '3', title: 'میوه', date: '2026-11-02', category: 'groceries', amount: 100 },
    { id: '4', title: 'خرید طلا', date: '2026-11-02', category: 'investment', amount: 9000 },
  ];
  const helpers = { toToman: (r) => r.amount, isExcluded: (c) => c === 'investment', labelOf: (c) => c };

  it('sums a category over the period', () => {
    const a = answerQuestion(ask('خرج رستوران سه ماه اخیر'), records, helpers);
    expect(a.count).toBe(2);
    expect(a.total).toBe(1000);
    expect(a.average).toBe(500);
    expect(a.top[0].title).toBe('شام');
  });

  it('leaves excluded categories out unless asked by name', () => {
    expect(answerQuestion(ask('خرج این ماه'), records, helpers).total).toBe(1100);
    expect(answerQuestion(ask('سرمایه‌گذاری این ماه'), records, helpers).total).toBe(9000);
  });

  it('filters by amount and by words', () => {
    expect(answerQuestion(ask('خرج کمتر از ۵۰۰ سه ماه اخیر'), records, helpers).count).toBe(2);
    expect(answerQuestion(ask('خرج میوه'), records, helpers).total).toBe(100);
  });
});
