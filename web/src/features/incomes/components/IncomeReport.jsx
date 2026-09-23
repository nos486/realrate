/**
 * IncomeReport.jsx — Category share & monthly breakdown of the (period-filtered) incomes
 */

import React from 'react';
import { PieChart, BarChart3 } from 'lucide-react';
import { Card } from '../../../shared/ui/index.js';
import { formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { formatCompactToman, formatPct } from '../../../shared/utils/formatters.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';

/** Most recent months shown in the monthly breakdown */
const MAX_MONTHS = 12;

function BreakdownRow({ label, icon = null, color, amount, ratio, meta, hideValues }) {
  return (
    <li className="income-breakdown-row">
      <div className="income-breakdown-head">
        <span className="income-breakdown-label">
          {icon}
          {label}
        </span>
        <span className="income-breakdown-amount" title={hideValues ? '' : `${formatNum(amount)} تومان`}>
          {hideValues ? '****' : formatCompactToman(amount)}
          <span className="income-breakdown-meta">{meta}</span>
        </span>
      </div>
      <div className="income-breakdown-track">
        <div
          className="income-breakdown-bar"
          style={{ width: `${Math.max(ratio * 100, 2)}%`, background: color }}
        />
      </div>
    </li>
  );
}

export default function IncomeReport({ report, hideValues = false }) {
  const months = report.byMonth.slice(0, MAX_MONTHS);
  const maxMonthTotal = Math.max(...months.map((m) => m.total), 0);

  return (
    <div className="incomes-report-grid">
      <Card
        title="تفکیک بر اساس منبع"
        subtitle="سهم هر دسته از مجموع درآمد"
        icon={<PieChart size={16} />}
        className="incomes-report-card"
      >
        <ul className="income-breakdown-list">
          {report.byCategory.map((c) => {
            const meta = getIncomeCategory(c.category);
            return (
              <BreakdownRow
                key={c.category}
                label={meta.label}
                icon={<meta.Icon size={13} style={{ color: meta.color }} />}
                color={meta.color}
                amount={c.total}
                ratio={c.share / 100}
                meta={`${formatPct(c.share)}٪`}
                hideValues={hideValues}
              />
            );
          })}
        </ul>
      </Card>

      <Card
        title="درآمد ماهانه"
        subtitle={report.byMonth.length > MAX_MONTHS ? `${MAX_MONTHS.toLocaleString('fa-IR')} ماه اخیر` : 'به تفکیک ماه شمسی'}
        icon={<BarChart3 size={16} />}
        className="incomes-report-card"
      >
        <ul className="income-breakdown-list">
          {months.map((m) => (
            <BreakdownRow
              key={m.key}
              label={m.label}
              color="var(--green-emerald)"
              amount={m.total}
              ratio={maxMonthTotal > 0 ? m.total / maxMonthTotal : 0}
              meta={`${m.count.toLocaleString('fa-IR')} مورد`}
              hideValues={hideValues}
            />
          ))}
        </ul>
      </Card>
    </div>
  );
}
