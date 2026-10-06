/**
 * IncomesPage.jsx — Incomes, one Shamsi month at a time (the same layout as the everyday expenses:
 * shared/flow). The year month by month is on the reports page (features/reports).
 *
 * - The month's total, the change from the same days of the month before, the daily
 *   average and the largest category; the chart of the year so far (the month highlighted, a tap
 *   opens another month); the month's categories as a donut; the month's incomes, filterable by
 *   category, with search, CSV export / import and the form
 * - Categories left out of the totals («مدیریت نقدینگی» by default) are listed with a badge (or
 *   hidden with «خارج از جمع») but not counted; their own sums show in «خارج از جمع»
 * - One download per year (the year and the month before it); amounts and titles are encrypted,
 *   so everything else — paging, sorting, search — works in the browser
 */

import React, { useState, useMemo } from 'react';
import { Wallet, Plus, Tags, Eye, EyeOff } from 'lucide-react';
import { useIncomes } from '../hooks/useIncomes.js';
import { usePricing } from '../../market/index.js';
import { useUsdAt } from '../../market/dailyHistory.js';
import { summarizeDollarValues } from '../../../utils/dollarValue.js';
import { incomeDollarValue } from '../utils/incomeReport.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { AlertBanner, Button, EmptyState, FeaturePageHeader, IconButton, Pagination, SearchBar, SplitPageLayout } from '../../../shared/ui/index.js';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import IncomeForm from './IncomeForm.jsx';
import IncomesTable from './IncomesTable.jsx';
import IncomeCsvExportButton from './IncomeCsvExportButton.jsx';
import IncomeCsvImportButton from './IncomeCsvImportButton.jsx';
import { getIncomeCategory } from '../constants/incomeCategories.js';
import { useCategories } from '../../../shared/categories/useCategories.js';
import { splitCounted } from '../../../shared/categories/categoryStore.js';
import { useShowExcluded } from '../../../shared/categories/useShowExcluded.js';
import CategoryManagerModal from '../../../shared/categories/CategoryManagerModal.jsx';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { useDemo } from '../../demo/index.js';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';
import { todayIso } from '../../../shared/utils/dates.js';
import PeriodSwitcher from '../../../shared/flow/PeriodSwitcher.jsx';
import YearFlowChart from '../../../shared/flow/YearFlowChart.jsx';
import { FlowMonthCards, CategoryPills, ExcludedBox } from '../../../shared/flow/FlowCards.jsx';
import { formatAmountMasked } from '../../../shared/flow/flowFormat.js';
import {
  buildYearSeries,
  flowWindow,
  formatShamsiMonth,
  monthIndex,
  monthProgress,
  shamsiMonthOf,
} from '../../../shared/flow/flowYear.js';

const HEADER = {
  icon: <Wallet size={24} />,
  title: 'درآمدها',
  subtitle: 'ورودی‌ها ماه‌به‌ماه، به تفکیک منبع',
};

const inRange = (income, { from, to }) => income.incomeDate >= from && income.incomeDate <= to;
const toPoint = (income) => ({ date: income.incomeDate, amount: Number(income.amount) || 0, category: income.category });
const labelOf = (category) => getIncomeCategory(category).label;

/** Totals per category, largest first */
function byCategory(incomes) {
  const map = new Map();
  for (const i of incomes) {
    const key = i.category || 'other';
    const entry = map.get(key) || { category: key, total: 0, count: 0 };
    entry.total += Number(i.amount) || 0;
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

const sumOf = (incomes) => incomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

export default function IncomesPage() {
  const { readOnly } = useDemo();
  // Re-renders with the user's category names (their own categories included)
  const categories = useCategories('income', { includeHidden: true });
  // Recompute the split when a category is switched in or out of the totals
  const exclusionKey = categories.filter((c) => c.excluded).map((c) => c.value).join(',');
  const [showExcluded, setShowExcluded] = useShowExcluded('income');
  const [managingCategories, setManagingCategories] = useState(false);
  const hideValues = usePrivacyMode();
  const today = todayIso();
  const thisMonth = useMemo(() => shamsiMonthOf(today), [today]);
  const [month, setMonth] = useState(thisMonth);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [order, setOrder] = useState('desc');
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const [formOpen, setFormOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);

  const loadWindow = useMemo(() => flowWindow(month.jy), [month.jy]);
  const {
    incomes: loaded,
    pageSize,
    loadAllIncomes,
    vaultLocked,
    loadingIncomes,
    submitting,
    deletingId,
    error,
    clearError,
    fetchIncomes,
    saveIncome,
    deleteIncome,
  } = useIncomes(loadWindow);

  // Each income in dollars at its day's rate, and what those dollars are worth today
  const pricing = usePricing();
  const usdToman = Number(pricing?.getAssetPrice?.('usd')) || 0;
  const usdAt = useUsdAt(loaded.length > 0);

  const progress = useMemo(() => monthProgress(month, today), [month, today]);
  const monthLabel = formatShamsiMonth(month.jy, month.jm);

  // What the page shows: the month; the totals count only what is income
  const scopeRange = progress.range;
  const scoped = useMemo(() => loaded.filter((i) => inRange(i, scopeRange)), [loaded, scopeRange.from, scopeRange.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const split = useMemo(
    () => splitCounted('income', scoped),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, exclusionKey],
  );
  const counted = split.counted;
  const total = sumOf(counted);
  const categoryTotals = useMemo(() => byCategory(counted), [counted]);
  const excludedTotals = useMemo(() => byCategory(split.excluded), [split]);
  const dollar = useMemo(() => summarizeDollarValues(counted.map((i) => incomeDollarValue(i, usdToman, usdAt)), usdToman), [counted, usdToman, usdAt]);

  // The month before, cut at the same day while this month is still running
  const previous = useMemo(() => {
    const list = splitCounted('income', loaded.filter((i) => i.incomeDate >= progress.prevRange.from && i.incomeDate <= progress.cutoff)).counted;
    return { total: sumOf(list), count: list.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, progress, exclusionKey]);

  // The year so far, month by month (counted incomes only)
  const series = useMemo(() => {
    const points = splitCounted('income', loaded).counted.map(toPoint);
    return buildYearSeries(points, month.jy, { throughMonth: month.jy === thisMonth.jy ? thisMonth.jm : 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, month.jy, thisMonth, exclusionKey]);
  const categoryOrder = useMemo(() => categoryTotals.map((c) => c.category), [categoryTotals]);

  // The list: the month, without the excluded categories unless shown, filtered, searched, sorted
  const shown = showExcluded ? scoped : counted;
  const shownByCategory = useMemo(() => byCategory(shown), [shown]);
  const query = searchQuery.trim().toLowerCase();
  const searching = Boolean(query);
  const listed = useMemo(() => {
    const dir = order === 'asc' ? 1 : -1;
    const matches = shown.filter((income) => {
      if (categoryFilter !== 'all' && (income.category || 'other') !== categoryFilter) return false;
      if (!query) return true;
      return [income.title, income.notes, labelOf(income.category)].some((f) => String(f || '').toLowerCase().includes(query));
    });
    return [...matches].sort((a, b) =>
      dir * (String(a.incomeDate).localeCompare(String(b.incomeDate)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    );
  }, [shown, categoryFilter, query, order]);
  const listKey = `${query}|${monthIndex(month)}|${categoryFilter}|${order}|${showExcluded}`;
  const lastPage = Math.max(1, Math.ceil(listed.length / pageSize));
  const page = Math.min(paging.key === listKey ? paging.page : 1, lastPage);
  const setPage = (next) => setPaging({ key: listKey, page: next });
  const listRows = listed.slice((page - 1) * pageSize, page * pageSize);

  const donutItems = categoryTotals.map((c) => {
    const meta = getIncomeCategory(c.category);
    return { key: c.category, label: meta.label, value: c.total, icon: <meta.Icon size={12} /> };
  });
  const top = categoryTotals[0] ? { label: labelOf(categoryTotals[0].category), total: categoryTotals[0].total } : null;

  const changeMonth = (next) => {
    setCategoryFilter('all');
    setSearchQuery('');
    setMonth(next);
  };
  const openMonth = (jm) => changeMonth({ jy: month.jy, jm });

  const openForm = (income = null) => {
    setEditingIncome(income);
    setFormOpen(true);
  };
  // The app's "+" button: /incomes?add=income
  useQuickAddParam('income', () => openForm(), !vaultLocked && !readOnly);

  const { confirm } = useFeedback();
  const handleDelete = async (income) => {
    const confirmed = await confirm({
      title: 'حذف درآمد',
      message: `آیا از حذف درآمد «${income.title}» اطمینان دارید؟`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await deleteIncome(income.id);
    } catch {
      // Surfaced through the hook's `error` banner
    }
  };

  if (vaultLocked) {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader {...HEADER} />
        <VaultUnlockCard title="درآمدهای شما رمزنگاری شده‌اند" />
      </div>
    );
  }

  const excludedFooter = split.excluded.length > 0 && (
    <span>{formatAmountMasked(sumOf(split.excluded), hideValues)} تومان خارج از جمع</span>
  );

  const monthSidebar = (
    <>
      <FlowMonthCards
        kind="income"
        monthLabel={monthLabel}
        total={total}
        count={counted.length}
        previousTotal={previous.total}
        previousCount={previous.count}
        current={progress.current}
        days={progress.days}
        top={top}
        hideValues={hideValues}
        totalFooter={excludedFooter}
        dollar={dollar}
      />
      <YearFlowChart series={series} kind="income" labelOf={labelOf} categoryOrder={categoryOrder} selectedMonth={month.jm} onOpenMonth={openMonth} hideValues={hideValues} />
      {donutItems.length > 0 && <DonutChart title="تفکیک دسته‌ها" items={donutItems} centerLabel="جمع ماه" masked={hideValues} />}
      <ExcludedBox kind="income" items={excludedTotals} metaOf={getIncomeCategory} hideValues={hideValues} />
    </>
  );

  const list = (
    <div className="portfolio-table-card">
      <div className="portfolio-table-header">
        <div className="table-title">
          <div className="table-title-main">
            <h3>درآمدهای {monthLabel}</h3>
          </div>
          {counted.length > 0 && (
            <p className="expense-month-total">جمع: <strong>{formatAmountMasked(total, hideValues)}</strong> تومان</p>
          )}
        </div>
        <div className="expense-table-tools">
          {scoped.length > 0 && (
            <SearchBar
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در عنوان، دسته یا یادداشت..."
              badge={`${listed.length.toLocaleString('fa-IR')} مورد`}
              className="incomes-search"
            />
          )}
          <IconButton icon={<Tags size={15} />} label="دسته‌ها" onClick={() => setManagingCategories(true)} disabled={readOnly} />
          {split.excluded.length > 0 && (
            <IconButton
                    icon={showExcluded ? <Eye size={15} /> : <EyeOff size={15} />}
                    label={showExcluded ? 'خارج از جمع: نمایش داده می‌شود' : `خارج از جمع: ${split.excluded.length.toLocaleString('fa-IR')} مورد پنهان`}
                    title={showExcluded ? 'پنهان کردن مدیریت نقدینگی و دیگر دسته‌های خارج از جمع' : 'نمایش دسته‌های خارج از جمع'}
                    active={!showExcluded}
                    pressed={!showExcluded}
                    badge={showExcluded ? null : split.excluded.length.toLocaleString('fa-IR')}
                    onClick={() => setShowExcluded(!showExcluded)}
                  />
          )}
          <IncomeCsvExportButton loadIncomes={loadAllIncomes} />
          <IncomeCsvImportButton saveIncome={saveIncome} onImported={fetchIncomes} disabled={readOnly} />
          <Button
            icon={<Plus size={16} />}
            onClick={() => openForm()}
            disabled={readOnly}
            title={readOnly ? 'در نسخه دمو غیرفعال است' : undefined}
          >
            ثبت درآمد
          </Button>
        </div>
      </div>

      <div className="table-card-body">
        <CategoryPills items={shownByCategory} total={shown.length} value={categoryFilter} onChange={setCategoryFilter} labelOf={labelOf} />

        {loadingIncomes && scoped.length === 0 ? (
          <SkeletonRows rows={5} columns={4} label="در حال دریافت درآمدها" />
        ) : scoped.length === 0 ? (
          <EmptyState
            icon={<Wallet size={40} strokeWidth={1.5} />}
            title={`درآمدی در ${monthLabel} ثبت نشده`}
            description="حقوق، فروش، اجاره و ... را با دسته‌بندی ثبت کنید تا ببینید درآمدتان از کجاست و چطور تغییر می‌کند."
            action={!readOnly && <Button icon={<Plus size={16} />} onClick={() => openForm()}>ثبت درآمد</Button>}
          />
        ) : searching && listed.length === 0 ? (
          <EmptyState title="موردی یافت نشد" description="هیچ درآمدی با عبارت جستجو شده مطابقت ندارد." />
        ) : listed.length === 0 ? (
          <EmptyState title="موردی در این فیلتر یافت نشد" description="برای این دسته درآمدی ثبت نشده است." />
        ) : (
          <div className={loadingIncomes ? 'is-refreshing' : ''} aria-busy={loadingIncomes}>
            <IncomesTable
              incomes={listRows}
              onEdit={openForm}
              onDelete={handleDelete}
              deletingId={deletingId}
              hideValues={hideValues}
              readOnly={readOnly}
              sortState={{ key: 'date', dir: order }}
              onSortChange={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
              usdToman={usdToman}
              usdAt={usdAt}
            />
            <Pagination page={page} pageSize={pageSize} total={listed.length} loading={loadingIncomes} onChange={setPage} label="صفحه‌بندی درآمدها" />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="incomes-page-container">
      <FeaturePageHeader {...HEADER} />

      <PeriodSwitcher month={month} thisMonth={thisMonth} onMonthChange={changeMonth} />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={clearError}
          action={<Button size="sm" variant="secondary" onClick={fetchIncomes}>تلاش مجدد</Button>}
        />
      )}

      <SplitPageLayout sidebar={monthSidebar}>{list}</SplitPageLayout>

      {formOpen && (
        <IncomeForm
          key={editingIncome?.id || 'new'}
          onClose={() => setFormOpen(false)}
          onSubmit={(data) => saveIncome(data, editingIncome?.id)}
          editingIncome={editingIncome}
          submitting={submitting}
        />
      )}
      {managingCategories && <CategoryManagerModal kind="income" onClose={() => setManagingCategories(false)} />}
    </div>
  );
}
