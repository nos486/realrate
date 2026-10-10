// @vitest-environment happy-dom
/**
 * shamsiDatePicker.test.jsx — the app's date field in Shamsi and Gregorian: the «شمسی / میلادی»
 * switch is one remembered choice for every picker, and whichever calendar the date is picked
 * in, the form still gets the same Shamsi date and ISO date
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';

import ShamsiDatePicker, {
  parseGregorianInput,
  formatGregorianInput,
  gregorianToShamsi,
  shamsiToGregorian,
} from '../../../web/src/features/portfolio/components/ShamsiDatePicker.jsx';
import { setCalendarMode, getCalendarMode } from '../../../web/src/shared/calendar/calendarMode.js';

afterEach(() => {
  cleanup();
  setCalendarMode('shamsi');
});

/** A form holding the picker's Shamsi value, the way every caller does */
function Form({ initial = '', onIso = () => {}, label = 'تاریخ' }) {
  const [shamsi, setShamsi] = useState(initial);
  return (
    <div data-testid={label}>
      <ShamsiDatePicker label={label} value={shamsi} onChange={setShamsi} onChangeIso={onIso} />
      <output data-testid={`${label}-value`}>{shamsi}</output>
    </div>
  );
}

const textInput = (root = document.body) => within(root).getAllByRole('textbox')[0];

describe('Gregorian date helpers', () => {
  it('reads a typed Gregorian date in any common shape, and only once it is a real date', () => {
    expect(parseGregorianInput('2026/10/10')).toBe('2026-10-10');
    expect(parseGregorianInput('2026-1-5')).toBe('2026-01-05');
    expect(parseGregorianInput('۲۰۲۶/۰۳/۲۱')).toBe('2026-03-21');
    expect(parseGregorianInput('2026/10')).toBe('');
    expect(parseGregorianInput('2026/02/30')).toBe('');
    expect(parseGregorianInput('2026/13/01')).toBe('');
    expect(formatGregorianInput('2026-10-10')).toBe('2026/10/10');
    expect(formatGregorianInput('1405/07/18')).toBe('');
  });

  it('converts a bare ISO day as a calendar day, both ways', () => {
    expect(gregorianToShamsi('2026-10-10')).toBe('1405/07/18');
    expect(shamsiToGregorian('1405/07/18')).toBe('2026-10-10');
  });
});

describe('date picker: Shamsi / Gregorian switch', () => {
  it('shows the date in Gregorian and reports a typed Gregorian date as Shamsi and ISO', () => {
    const onIso = vi.fn();
    render(<Form initial="1405/07/18" onIso={onIso} />);
    expect(textInput().value).toBe('1405/07/18');

    fireEvent.click(screen.getByRole('tab', { name: 'میلادی' }));
    expect(textInput().value).toBe('2026/10/10');

    fireEvent.change(textInput(), { target: { value: '2026/03' } });
    expect(textInput().value).toBe('2026/03');
    expect(onIso).not.toHaveBeenCalled();

    fireEvent.change(textInput(), { target: { value: '2026/03/21' } });
    expect(onIso).toHaveBeenLastCalledWith('2026-03-21');
    expect(screen.getByTestId('تاریخ-value').textContent).toBe('1405/01/01');

    fireEvent.click(screen.getByRole('tab', { name: 'شمسی' }));
    expect(textInput().value).toBe('1405/01/01');
  });

  it('picks day, month and year from Gregorian lists, keeping the day inside the month', () => {
    const onIso = vi.fn();
    setCalendarMode('gregorian');
    render(<Form initial={gregorianToShamsi('2026-01-31')} onIso={onIso} />);
    fireEvent.click(screen.getByTitle('انتخاب از تقویم'));

    const month = screen.getByRole('combobox', { name: 'ماه' });
    expect(within(month).getByRole('option', { name: 'ژانویه' }).selected).toBe(true);
    fireEvent.change(month, { target: { value: '02' } });
    expect(onIso).toHaveBeenLastCalledWith('2026-02-28');

    fireEvent.change(screen.getByRole('combobox', { name: 'سال' }), { target: { value: '2024' } });
    expect(onIso).toHaveBeenLastCalledWith('2024-02-28');
    expect(screen.getByTestId('تاریخ-value').textContent).toBe(gregorianToShamsi('2024-02-28'));
  });

  it('switches every picker together and remembers the choice', () => {
    render(
      <>
        <Form label="الف" initial="1405/07/18" />
        <Form label="ب" initial="1405/01/01" />
      </>
    );
    fireEvent.click(within(screen.getByTestId('الف')).getByRole('tab', { name: 'میلادی' }));
    expect(textInput(screen.getByTestId('الف')).value).toBe('2026/10/10');
    expect(textInput(screen.getByTestId('ب')).value).toBe('2026/03/21');
    expect(getCalendarMode()).toBe('gregorian');
    expect(localStorage.getItem('realrate_calendar_mode')).toBe('gregorian');
  });
});
