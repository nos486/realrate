/**
 * IncomeSummaryCards.jsx — Headline figures of the income report (built on MiniCard)
 */

import React from 'react';
import { Wallet, CalendarRange, Hash, Trophy } from 'lucide-react';
import { MiniCard } from '../../../shared/ui/index.js';
import { formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';

const MASK = '****';

export default function IncomeSummaryCards({ report, hideValues = false }) {
  const { total, count, monthlyAverage, largest, byCategory } = report;
  const topCategory = byCategory[0] ? getIncomeCategory(byCategory[0].category) : null;
  const money = (v) => (hideValues ? MASK : formatNum(v));

  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<Wallet size={14} />}
        title="مجموع درآمد"
        value={money(total)}
        unit="تومان"
        color="green"
        className="incomes-summary-card is-primary"
      />
      <MiniCard
        icon={<CalendarRange size={14} />}
        title="میانگین ماهانه"
        value={money(monthlyAverage)}
        unit="تومان"
        color="blue"
        className="incomes-summary-card"
      />
      <MiniCard
        icon={<Hash size={14} />}
        title="تعداد ثبت‌ها"
        value={count.toLocaleString('fa-IR')}
        unit="مورد"
        className="incomes-summary-card"
        footer={topCategory && <span>بیشترین منبع: {topCategory.label}</span>}
      />
      <MiniCard
        icon={<Trophy size={14} />}
        title="بزرگ‌ترین درآمد"
        value={largest ? money(largest.amount) : '—'}
        unit={largest ? 'تومان' : null}
        color="gold"
        className="incomes-summary-card"
        footer={largest && <span className="incomes-summary-foot-text">{largest.title}</span>}
      />
    </div>
  );
}
