/**
 * DateField.jsx — An entry form's day: «امروز» and «دیروز» a tap away, «روز دیگر» opens the full
 * Shamsi picker (ShamsiDatePicker). Most entries are of today or yesterday.
 *
 * The value is the Shamsi string the forms keep (Latin digits, «1405/07/18»).
 */

import React, { useState } from 'react';
import { FilterPills } from '../ui/index.js';
import ShamsiDatePicker, { getTodayShamsi, gregorianToShamsi, formatShamsiDisplay, shamsiToGregorian } from '../../features/portfolio/components/ShamsiDatePicker.jsx';
import { todayIso } from '../utils/dates.js';

/** Yesterday in the user's time zone, as Shamsi */
function yesterdayShamsi() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return gregorianToShamsi(`${todayIso(d)}T00:00:00`);
}

/**
 * @param {{ label: string, value: string, onChange: (shamsi: string) => void }} props
 */
export default function DateField({ label, value, onChange }) {
  const today = getTodayShamsi();
  const yesterday = yesterdayShamsi();
  const quick = value === today ? 'today' : value === yesterday ? 'yesterday' : 'other';
  // «روز دیگر» picked by hand stays open even while its day is today's
  const [picking, setPicking] = useState(quick === 'other');
  const mode = picking ? 'other' : quick;
  const iso = shamsiToGregorian(value);
  return (
    <div className="ui-input-group date-field">
      <span className="ui-input-label">{label}</span>
      <FilterPills
        variant="segmented"
        size="sm"
        options={[
          { value: 'today', label: 'امروز' },
          { value: 'yesterday', label: 'دیروز' },
          { value: 'other', label: 'روز دیگر' },
        ]}
        activeValue={mode}
        onChange={(next) => {
          setPicking(next === 'other');
          if (next === 'today') onChange(today);
          if (next === 'yesterday') onChange(yesterday);
        }}
      />
      {mode === 'other'
        ? <ShamsiDatePicker label="روز" value={value} onChange={onChange} className="date-field-picker" />
        : iso && <p className="expense-form-hint">{formatShamsiDisplay(`${iso}T00:00:00`)}</p>}
    </div>
  );
}
