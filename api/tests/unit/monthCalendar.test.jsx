// @vitest-environment happy-dom
/**
 * monthCalendar.test.jsx — The Shamsi month grid: all the month's days, the marked ones
 * highlighted, a tap handed back as the Gregorian day
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import MonthCalendar from '../../../web/src/shared/ui/MonthCalendar.jsx';
import { shamsiMonthRange } from '../../src/domain/expenseDocument.js';

afterEach(cleanup);

const month = { jy: 1405, jm: 7 };
const { from, days } = shamsiMonthRange(1405, 7);

describe('MonthCalendar', () => {
  it('shows every day of the month and marks the given ones', () => {
    const marked = [new Date(Date.parse(from) + 4 * 86_400_000).toISOString().slice(0, 10)];
    render(<MonthCalendar month={month} onMonthChange={() => {}} marked={marked} today={from} onDayClick={() => {}} />);
    const buttons = screen.getAllByRole('button').filter((b) => b.className.includes('month-calendar-day'));
    expect(buttons).toHaveLength(days);
    expect(buttons.filter((b) => b.className.includes('is-marked'))).toHaveLength(1);
    expect(buttons[4].className).toContain('is-marked');
    expect(buttons[0].className).toContain('is-today');
  });

  it('hands a tapped day back as its Gregorian date', () => {
    const onDayClick = vi.fn();
    render(<MonthCalendar month={month} onMonthChange={() => {}} onDayClick={onDayClick} />);
    fireEvent.click(screen.getAllByRole('button').filter((b) => b.className.includes('month-calendar-day'))[0]);
    expect(onDayClick).toHaveBeenCalledWith(from);
  });

  it('asks for the neighbouring month', () => {
    const onMonthChange = vi.fn();
    render(<MonthCalendar month={month} onMonthChange={onMonthChange} />);
    fireEvent.click(screen.getByLabelText('ماه بعد'));
    expect(onMonthChange).toHaveBeenCalledWith({ jy: 1405, jm: 8 });
  });
});
