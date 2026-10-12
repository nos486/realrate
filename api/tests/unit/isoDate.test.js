import { describe, it, expect } from 'vitest';
import { isValidIsoDate } from '../../src/domain/isoDate.js';

describe('ISO calendar dates', () => {
  it.each(['2026-09-25', '2024-02-29', '1900-01-01', '2200-12-31'])('accepts %s', (value) => {
    expect(isValidIsoDate(value)).toBe(true);
  });

  it.each([
    ['a Shamsi date in ISO shape', '1404-07-03'],
    ['an impossible day', '2026-02-30'],
    ['a non-leap Feb 29', '2025-02-29'],
    ['month 13', '2026-13-01'],
    ['a timestamp', '2026-09-25T10:00:00Z'],
    ['slashes', '2026/09/25'],
    ['empty', ''],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    expect(isValidIsoDate(value)).toBe(false);
  });
});

describe('tehranToday', () => {
  it('flips at Tehran midnight (UTC+3:30), not UTC midnight', async () => {
    const { tehranToday } = await import('../../src/domain/isoDate.js');
    expect(tehranToday(new Date('2026-10-12T20:29:00Z'))).toBe('2026-10-12');
    expect(tehranToday(new Date('2026-10-12T20:31:00Z'))).toBe('2026-10-13');
  });
});
