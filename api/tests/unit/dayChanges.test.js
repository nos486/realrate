/**
 * dayChanges.test.js — The full cards' 24-hour change: against yesterday's close in the history
 */
import { describe, it, expect } from 'vitest';
import { previousClose, changeSince } from '../../../web/src/features/home/useDayChanges.js';

describe('24-hour change', () => {
  const series = { days: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], points: [100, 110, 120, 125] };

  it('the close before today: yesterday\'s, or the last day recorded before', () => {
    expect(previousClose(series, '2026-10-04')).toBe(120);
    expect(previousClose({ days: ['2026-10-01'], points: [90] }, '2026-10-04')).toBe(90);
    expect(previousClose({ days: ['2026-10-04'], points: [90] }, '2026-10-04')).toBeNull();
    expect(previousClose(null, '2026-10-04')).toBeNull();
  });

  it('the change in percent, null without both prices', () => {
    expect(changeSince(120, 126)).toBeCloseTo(5);
    expect(changeSince(null, 126)).toBeNull();
    expect(changeSince(120, 0)).toBeNull();
  });
});
