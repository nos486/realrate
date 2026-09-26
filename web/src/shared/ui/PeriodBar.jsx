/**
 * PeriodBar.jsx — Pick the date window a page shows: last month / 3 / 6 months / a year / all
 */

import React from 'react';
import { CalendarRange } from 'lucide-react';
import FilterPills from './FilterPills.jsx';
import { RECENT_PERIODS } from '../utils/recentPeriods.js';

export default function PeriodBar({ value, onChange, label = 'بازه زمانی', className = '' }) {
  return (
    <div className={`period-bar ${className}`} role="group" aria-label={label}>
      <span className="period-bar-label">
        <CalendarRange size={15} aria-hidden="true" />
        {label}
      </span>
      <FilterPills options={RECENT_PERIODS} activeValue={value} onChange={onChange} size="sm" className="period-bar-pills" />
    </div>
  );
}
