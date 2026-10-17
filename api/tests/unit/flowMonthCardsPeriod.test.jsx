// @vitest-environment happy-dom
/**
 * flowMonthCardsPeriod.test.jsx — A salary month's total card says the day the month began
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { FlowMonthCards } from '../../../web/src/shared/flow/FlowCards.jsx';

afterEach(cleanup);

const props = { kind: 'expense', monthLabel: 'آبان ۱۴۰۵', total: 1000, count: 2, previousTotal: 0, previousCount: 0, current: true, days: 5, top: null };

describe('FlowMonthCards period start', () => {
  it('writes the start day under the total when the month starts at a salary', () => {
    render(<FlowMonthCards {...props} periodStart="2026-11-06" />);
    expect(screen.getByText(/شروع/).textContent).toContain('۱۴۰۵');
  });

  it('writes nothing for a calendar month', () => {
    render(<FlowMonthCards {...props} />);
    expect(screen.queryByText(/شروع/)).toBeNull();
  });
});
