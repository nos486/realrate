/**
 * IncomeReport.jsx — Share of each income source in the (period-filtered) incomes, as a donut
 * chart (shared DonutChart: legend with amounts and shares, hover details)
 */

import React, { useMemo } from 'react';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import { getIncomeCategory } from '../constants/incomeCategories.js';

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

  return (
    <DonutChart
      title="تفکیک بر اساس منبع"
      items={categoryItems}
      centerLabel="مجموع درآمد"
      otherLabel={otherSourcesLabel}
      masked={hideValues}
    />
  );
}
