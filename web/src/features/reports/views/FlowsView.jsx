/**
 * FlowsView.jsx — The reports page's «درآمد و هزینه»: the yearly reports of incomes and of
 * everyday expenses — the year's cards, the year month by month by category, and where the money
 * came from / went (donuts)
 */

import React from 'react';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import YearFlowChart from '../../../shared/flow/YearFlowChart.jsx';
import { FlowYearCards } from '../../../shared/flow/FlowCards.jsx';
import { getIncomeCategory } from '../../incomes/constants/incomeCategories.js';
import { getExpenseCategory } from '../../expenses/constants/expenseCategories.js';

const KINDS = {
  income: { title: 'درآمد', metaOf: getIncomeCategory, donut: 'منابع درآمد' },
  expense: { title: 'هزینه‌ی روزمره', metaOf: getExpenseCategory, donut: 'دسته‌های هزینه', note: 'هزینه‌های پروژه‌ها جدا حساب می‌شوند.' },
};

function FlowSection({ kind, series, year, dollar, yearLabel, hideValues }) {
  const k = KINDS[kind];
  const labelOf = (c) => k.metaOf(c).label;
  const order = year.byCategory.map((c) => c.category);
  const donutItems = year.byCategory.map((c) => {
    const meta = k.metaOf(c.category);
    return { key: c.category, label: meta.label, value: c.total, icon: <meta.Icon size={12} /> };
  });
  const top = year.byCategory[0] ? { label: labelOf(year.byCategory[0].category), total: year.byCategory[0].total } : null;
  return (
    <section className="report-section" aria-labelledby={`report-${kind}`}>
      <div className="report-section-head">
        <h2 id={`report-${kind}`}>{k.title} {yearLabel}</h2>
        {k.note && <p>{k.note}</p>}
      </div>
      <FlowYearCards kind={kind} yearLabel={yearLabel} summary={year} topCategory={top} hideValues={hideValues} dollar={dollar} />
      <div className="report-grid">
        <YearFlowChart series={series} kind={kind} labelOf={labelOf} categoryOrder={order} hideValues={hideValues} large />
        <DonutChart title={k.donut} items={donutItems} centerLabel={`جمع ${yearLabel}`} masked={hideValues} emptyMessage="موردی در این سال ثبت نشده است." />
      </div>
    </section>
  );
}

export default function FlowsView({ data, yearLabel, hideValues }) {
  return (
    <div className="report-view">
      <FlowSection kind="income" series={data.incomeSeries} year={data.incomeYear} dollar={data.incomeDollar} yearLabel={yearLabel} hideValues={hideValues} />
      {data.hasExpenses && (
        <FlowSection kind="expense" series={data.expenseSeries} year={data.expenseYear} dollar={data.expenseDollar} yearLabel={yearLabel} hideValues={hideValues} />
      )}
    </div>
  );
}
