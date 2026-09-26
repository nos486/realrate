import { describe, it, expect } from 'vitest';
import { monthsAgo, periodFrom, periodMonths, RECENT_PERIODS, DEFAULT_RECENT_PERIOD } from '../../../web/src/shared/utils/recentPeriods.js';
import { pageLocally } from '../../../web/src/shared/utils/pageLocally.js';

describe('recent periods', () => {
  it('offers last month / 3 / 6 months / a year / all, 6 months by default', () => {
    expect(RECENT_PERIODS.map((p) => p.value)).toEqual(['1m', '3m', '6m', '1y', 'all']);
    expect(DEFAULT_RECENT_PERIOD).toBe('6m');
    expect(periodMonths('1y')).toBe(12);
    expect(periodMonths('all')).toBeNull();
  });

  it('starts the day after the same date N months back', () => {
    expect(monthsAgo(1, '2026-09-26')).toBe('2026-08-27');
    expect(monthsAgo(6, '2026-09-26')).toBe('2026-03-27');
    expect(monthsAgo(12, '2026-01-15')).toBe('2025-01-16');
    // Past the end of a shorter month: its last day, then the next one
    expect(monthsAgo(1, '2026-03-31')).toBe('2026-03-01');
    expect(monthsAgo(3, '2026-05-31')).toBe('2026-03-01');
  });

  it('has no start for «all»', () => {
    expect(periodFrom('all', '2026-09-26')).toBe('');
    expect(periodFrom('3m', '2026-09-26')).toBe('2026-06-27');
  });
});

describe('local paging (older plaintext API)', () => {
  const items = [
    { id: 'a', d: '2026-01-10', createdAt: '1' },
    { id: 'b', d: '2026-05-01', createdAt: '2' },
    { id: 'c', d: '', createdAt: '3' },
    { id: 'd', d: '2026-07-20', createdAt: '4' },
    { id: 'e', d: '2026-07-20', createdAt: '5' },
  ];
  const dateOf = (i) => i.d;

  it('filters by date, sorts by date, and pages like the server', () => {
    const first = pageLocally(items, { from: '2026-02-01', limit: 2 }, dateOf);
    expect(first.total).toBe(3);
    expect(first.items.map((i) => i.id)).toEqual(['e', 'd']);
    expect(pageLocally(items, { from: '2026-02-01', limit: 2, offset: 2 }, dateOf).items.map((i) => i.id)).toEqual(['b']);
    expect(pageLocally(items, { order: 'asc' }, dateOf).items.map((i) => i.id)).toEqual(['c', 'a', 'b', 'd', 'e']);
    expect(pageLocally(items, { to: '2026-06-01' }, dateOf).items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});
