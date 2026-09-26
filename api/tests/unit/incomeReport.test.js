// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildMonthlySeries, monthsSpanned } from '../../../web/src/features/incomes/utils/incomeReport.js';

// 1405/07/04 (Mehr) = 2026-09-26
const TODAY = '1405/07/04';

describe('monthly income chart months', () => {
  it('spans from the oldest income month to the current one', () => {
    expect(monthsSpanned([], TODAY)).toBe(1);
    expect(monthsSpanned([{ incomeDate: '2026-09-24' }], TODAY)).toBe(1);
    // 2026-04-25 is Ordibehesht 1405: Ordibehesht..Mehr
    expect(monthsSpanned([{ incomeDate: '2026-09-01' }, { incomeDate: '2026-04-25' }], TODAY)).toBe(6);
  });

  it('builds exactly the months asked for, oldest first', () => {
    const series = buildMonthlySeries([{ incomeDate: '2026-04-25', amount: 5, category: 'salary' }], 6, TODAY);
    expect(series).toHaveLength(6);
    expect(series[0]).toMatchObject({ key: '1405/02', total: 5 });
    expect(series[5].key).toBe('1405/07');
  });
});
