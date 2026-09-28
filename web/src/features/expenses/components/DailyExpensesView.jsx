/**
 * DailyExpensesView.jsx — Everyday expenses, one Shamsi month at a time
 *
 * - Month switcher (previous / next / this month); only that month and the one before are loaded
 * - Summary: the month's total, the change from last month, the daily average and the largest
 *   category, plus a donut of the categories
 * - The month's expenses, filterable by category, with the form to add and edit them
 */

import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Plus, Coins, TrendingUp, TrendingDown, CalendarDays, Tag } from 'lucide-react';
import { AlertBanner, Button, EmptyState, MiniCard, SplitPageLayout } from '../../../shared/ui/index.js';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { todayIso } from '../../../shared/utils/dates.js';
import {
  summarizeExpenses,
  summarizeByCategory,
  shamsiMonthOf,
  shamsiMonthRange,
  shiftShamsiMonth,
} from '../../../utils/expenseDocument.js';
import { formatShamsiMonth } from '../../incomes/utils/incomeReport.js';
import { useDemo } from '../../demo/index.js';
import { useDailyExpenses } from '../hooks/useDailyExpenses.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';
import { formatAmount } from '../utils/format.js';
import ExpenseForm from './ExpenseForm.jsx';
import ExpensesTable from './ExpensesTable.jsx';

const MASK = '****';
const monthIndex = ({ jy, jm }) => jy * 12 + jm;

export default function DailyExpensesView({ usdToman = 0, hideValues = false }) {
  const { readOnly } = useDemo();
  const { confirm } = useFeedback();
  const today = todayIso();
  const thisMonth = useMemo(() => shamsiMonthOf(today), [today]);
  const [month, setMonth] = useState(thisMonth);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [form, setForm] = useState(null); // null | { expense: object|null }
  const {
    expenses, previousExpenses, range, loading, submitting, deletingId, error, clearError, fetchMonth,
    saveExpense, deleteExpense,
  } = useDailyExpenses(month);

  const isThisMonth = monthIndex(month) === monthIndex(thisMonth);
  const summary = useMemo(() => summarizeExpenses(expenses, { usdToman }), [expenses, usdToman]);
  const byCategory = useMemo(() => summarizeByCategory(expenses, { usdToman }), [expenses, usdToman]);

  // Days so far in this month (a past month counts all its days)
  const daysElapsed = isThisMonth
    ? Math.max(1, Math.round((Date.parse(today) - Date.parse(range.from)) / 86_400_000) + 1)
    : range.days;
  // A month still running is compared with the same number of days of the month before
  const previous = useMemo(() => {
    let list = previousExpenses;
    if (isThisMonth) {
      const prev = shiftShamsiMonth(month, -1);
      const cutoff = new Date(Date.parse(shamsiMonthRange(prev.jy, prev.jm).from) + (daysElapsed - 1) * 86_400_000)
        .toISOString().slice(0, 10);
      list = previousExpenses.filter((e) => e.date <= cutoff);
    }
    return summarizeExpenses(list, { usdToman });
  }, [previousExpenses, usdToman, isThisMonth, daysElapsed, month]);
  const change = previous.totalToman > 0 ? ((summary.totalToman - previous.totalToman) / previous.totalToman) * 100 : null;
  const top = byCategory[0] ? getExpenseCategory(byCategory[0].category) : null;
  const money = (v) => (hideValues ? MASK : formatAmount(v));

  const visible = categoryFilter === 'all' ? expenses : expenses.filter((e) => (e.category || 'other') === categoryFilter);
  const donutItems = byCategory.map((c) => {
    const meta = getExpenseCategory(c.category);
    return { key: c.category, label: meta.label, value: c.totalToman, icon: <meta.Icon size={12} /> };
  });

  const goTo = (delta) => {
    setCategoryFilter('all');
    setMonth((m) => shiftShamsiMonth(m, delta));
  };

  const handleDelete = async (expense) => {
    const ok = await confirm({
      title: 'حذف هزینه',
      message: `هزینه «${expense.title}» حذف شود؟`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteExpense(expense.id);
    } catch {
      // Surfaced through the hook's `error` banner
    }
  };

  const sidebar = (
    <>
      <div className="incomes-summary-grid">
        <MiniCard
          icon={<Coins size={14} />}
          title={`جمع ${formatShamsiMonth(month.jy, month.jm)}`}
          value={money(summary.totalToman)}
          unit="تومان"
          color="rose"
          className="incomes-summary-card is-primary"
          footer={summary.unpricedUsd > 0 && <span>{formatAmount(summary.unpricedUsd, 'USD')} دلار بدون نرخ حساب نشده</span>}
        />
        <MiniCard
          icon={change !== null && change < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
          title={isThisMonth ? 'نسبت به همین روزهای ماه قبل' : 'نسبت به ماه قبل'}
          value={change === null ? '—' : `${change > 0 ? '+' : ''}${change.toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪`}
          color={change === null ? 'text' : change > 0 ? 'rose' : 'green'}
          className="incomes-summary-card"
          footer={previous.count > 0 && <span>ماه قبل: {money(previous.totalToman)} تومان</span>}
        />
        <MiniCard
          icon={<CalendarDays size={14} />}
          title="میانگین روزانه"
          value={money(summary.totalToman / daysElapsed)}
          unit="تومان"
          className="incomes-summary-card"
          footer={<span>{summary.count.toLocaleString('fa-IR')} هزینه در {daysElapsed.toLocaleString('fa-IR')} روز</span>}
        />
        <MiniCard
          icon={<Tag size={14} />}
          title="بیشترین دسته"
          value={top ? top.label : '—'}
          className="incomes-summary-card"
          footer={top && <span>{money(byCategory[0].totalToman)} تومان</span>}
        />
      </div>
      {donutItems.length > 0 && (
        <DonutChart title="تفکیک دسته‌ها" items={donutItems} centerLabel="جمع ماه" masked={hideValues} />
      )}
    </>
  );

  return (
    <>
      <div className="expense-month-bar">
        <Button size="sm" variant="secondary" icon={<ChevronRight size={16} />} onClick={() => goTo(-1)} aria-label="ماه قبل" />
        <strong className="expense-month-label">{formatShamsiMonth(month.jy, month.jm)}</strong>
        <Button size="sm" variant="secondary" icon={<ChevronLeft size={16} />} onClick={() => goTo(1)} disabled={isThisMonth} aria-label="ماه بعد" />
        {!isThisMonth && (
          <Button size="sm" variant="secondary" onClick={() => { setCategoryFilter('all'); setMonth(thisMonth); }}>این ماه</Button>
        )}
      </div>

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={clearError}
          action={<Button size="sm" variant="secondary" onClick={fetchMonth}>تلاش مجدد</Button>}
        />
      )}

      <div className="expenses-daily">
        <SplitPageLayout sidebar={sidebar}>
          <div className="portfolio-table-card">
            <div className="portfolio-table-header">
              <div className="table-title">
                <div className="table-title-main">
                  <h3>هزینه‌های {formatShamsiMonth(month.jy, month.jm)}</h3>
                </div>
                {summary.count > 0 && (
                  <p className="expense-month-total">
                    جمع: <strong>{money(summary.totalToman)}</strong> تومان
                  </p>
                )}
              </div>
              <Button
                icon={<Plus size={16} />}
                onClick={() => setForm({ expense: null })}
                disabled={readOnly}
                title={readOnly ? 'در نسخه دمو غیرفعال است' : undefined}
              >
                ثبت هزینه
              </Button>
            </div>

            <div className="table-card-body">
              {byCategory.length > 1 && (
                <div className="tx-filter-pills-bar expense-category-filter" role="group" aria-label="دسته‌بندی">
                  {[{ category: 'all', count: expenses.length }, ...byCategory].map(({ category, count }) => (
                    <button
                      key={category}
                      type="button"
                      className={`tx-filter-pill ${categoryFilter === category ? 'active' : ''}`}
                      aria-pressed={categoryFilter === category}
                      onClick={() => setCategoryFilter(category)}
                    >
                      {category === 'all' ? 'همه' : getExpenseCategory(category).label}
                      <span className="cheque-filter-count">{count.toLocaleString('fa-IR')}</span>
                    </button>
                  ))}
                </div>
              )}

              {loading && expenses.length === 0 ? (
                <SkeletonRows rows={5} columns={4} label="در حال دریافت هزینه‌ها" />
              ) : expenses.length === 0 ? (
                <EmptyState
                  icon={<Coins size={40} strokeWidth={1.5} />}
                  title={`هزینه‌ای در ${formatShamsiMonth(month.jy, month.jm)} ثبت نشده`}
                  description="خرید روزانه، قبض، رفت‌وآمد و ... را با دسته‌بندی ثبت کنید تا ببینید پولتان کجا خرج می‌شود."
                  action={!readOnly && (
                    <Button icon={<Plus size={16} />} onClick={() => setForm({ expense: null })}>ثبت اولین هزینه</Button>
                  )}
                />
              ) : (
                <ExpensesTable
                  expenses={visible}
                  usdToman={usdToman}
                  onEdit={(expense) => setForm({ expense })}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                  hideValues={hideValues}
                  readOnly={readOnly}
                  showCategory
                />
              )}
            </div>
          </div>
        </SplitPageLayout>
      </div>

      {form && (
        <ExpenseForm
          key={form.expense?.id || 'new'}
          daily
          expense={form.expense}
          usdToman={usdToman}
          onSubmit={(input) => saveExpense(input, form.expense)}
          onClose={() => setForm(null)}
          submitting={submitting}
        />
      )}
    </>
  );
}
