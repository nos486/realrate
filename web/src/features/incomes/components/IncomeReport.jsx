/**
 * IncomeReport.jsx — Category share & monthly breakdown of the (period-filtered) incomes, as
 * donut charts (shared DonutChart: legend with amounts and shares, hover details)
 */

import React, { useMemo } from 'react';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import { getIncomeCategory } from '../constants/incomeCategories.js';

/**
 * Most recent months in the monthly chart: one per donut palette color, so every month keeps its
 * own slice (a gray slice of older months would dwarf the recent ones and say little)
 */
const MAX_MONTHS = 5;
const RECENT_LABEL = `${MAX_MONTHS.toLocaleString('fa-IR')} ماه اخیر`;
const otherSourcesLabel = (count) => `سایر منابع (${count.toLocaleString('fa-IR')})`;

export default function IncomeReport({ report, hideValues = false }) {
  // Largest source first, so the biggest ones get their own slice
  const categoryItems = useMemo(
    () =>
      report.byCategory.map((c) => {
        const meta = getIncomeCategory(c.category);
        return {
          key: c.category,
          label: meta.label,
          value: c.total,
          icon: <meta.Icon size={14} style={{ color: meta.color }} />,
        };
      }),
    [report.byCategory]
  );

  // Newest month first
  const monthItems = useMemo(
    () =>
      report.byMonth.slice(0, MAX_MONTHS).map((m) => ({
        key: m.key,
        label: `${m.label} (${m.count.toLocaleString('fa-IR')} مورد)`,
        shortLabel: m.label,
        value: m.total,
      })),
    [report.byMonth]
  );

  return (
    <div className="incomes-report-grid">
      <DonutChart
        title="تفکیک بر اساس منبع"
        items={categoryItems}
        centerLabel="مجموع درآمد"
        otherLabel={otherSourcesLabel}
        masked={hideValues}
      />
      <DonutChart
        title={report.byMonth.length > MAX_MONTHS ? `درآمد ماهانه (${RECENT_LABEL})` : 'درآمد ماهانه'}
        items={monthItems}
        centerLabel={report.byMonth.length > MAX_MONTHS ? RECENT_LABEL : 'مجموع'}
        masked={hideValues}
      />
    </div>
  );
}
