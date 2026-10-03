/**
 * IncomesPage.jsx — Income tracking dashboard
 *
 * - Record / edit / delete income entries (title, category, amount, Shamsi date, notes)
 * - Period picker at the top (last month / 3 / 6 months / a year / all; a year by default):
 *   only that date window is fetched from the server
 * - Summary cards, per-category breakdown and the monthly chart, all of the period (never more)
 * - The list: 20 per page, sorted by date; paging, sorting and search all work in the browser on
 *   the period already fetched (one query per period — amounts and titles are encrypted)
 */

import React, { useState, useMemo } from 'react';
import { Wallet, Plus, CalendarRange, Tags } from 'lucide-react';
import { useIncomes } from '../hooks/useIncomes.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import {
  AlertBanner,
  Button,
  EmptyState,
  FeaturePageHeader,
  Pagination,
  PeriodBar,
  SearchBar,
  SplitPageLayout,
} from '../../../shared/ui/index.js';
import IncomeForm from './IncomeForm.jsx';
import IncomeSummaryCards from './IncomeSummaryCards.jsx';
import IncomeReport from './IncomeReport.jsx';
import MonthlyIncomeChart from './MonthlyIncomeChart.jsx';
import IncomesTable from './IncomesTable.jsx';
import IncomeCsvExportButton from './IncomeCsvExportButton.jsx';
import IncomeCsvImportButton from './IncomeCsvImportButton.jsx';
import { buildIncomeReport, buildMonthlySeries, monthsSpanned } from '../utils/incomeReport.js';
import { RECENT_PERIODS, periodMonths } from '../../../shared/utils/recentPeriods.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';
import { useCategories } from '../../../shared/categories/useCategories.js';
import CategoryManagerModal from '../../../shared/categories/CategoryManagerModal.jsx';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';
import { useDemo } from '../../demo/index.js';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';

export default function IncomesPage() {
  const { readOnly } = useDemo();
  // Re-renders with the user's category names (their own categories included)
  useCategories('income');
  const [managingCategories, setManagingCategories] = useState(false);
  const {
    incomes: periodIncomes,
    pageSize,
    period,
    setPeriod,
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
  } = useIncomes();
  const hideValues = usePrivacyMode();

  const [searchQuery, setSearchQuery] = useState('');
  // Newest first by default (the date column flips it)
  const [order, setOrder] = useState('desc');
  // The page, reset whenever what is listed changes
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const [formOpen, setFormOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);

  // Everything on the page is the period, exactly what was fetched
  const report = useMemo(() => buildIncomeReport(periodIncomes), [periodIncomes]);
  // One bar per Shamsi month of the period («all»: since the first income)
  const chartMonths = periodMonths(period) ?? monthsSpanned(periodIncomes);
  const monthlySeries = useMemo(() => buildMonthlySeries(periodIncomes, chartMonths), [periodIncomes, chartMonths]);
  const chartTitle = period === 'all' ? 'از ابتدا' : RECENT_PERIODS.find((p) => p.value === period)?.label;
  // The source donut's order, so the bar chart's stacks take the same colors
  const categoryOrder = useMemo(() => report.byCategory.map((c) => c.category), [report.byCategory]);

  // The list: the period, searched (titles and notes are encrypted, so in the browser) and
  // sorted by date, then 20 at a time
  const query = searchQuery.trim().toLowerCase();
  const searching = Boolean(query);
  const listed = useMemo(() => {
    const dir = order === 'asc' ? 1 : -1;
    const matches = query
      ? periodIncomes.filter((income) =>
          [income.title, income.notes, getIncomeCategory(income.category).label]
            .some((field) => String(field || '').toLowerCase().includes(query))
        )
      : periodIncomes;
    return [...matches].sort((a, b) =>
      dir * (String(a.incomeDate).localeCompare(String(b.incomeDate)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    );
  }, [periodIncomes, query, order]);
  const listKey = `${query}|${period}|${order}`;
  const lastPage = Math.max(1, Math.ceil(listed.length / pageSize));
  // A delete can leave the last page empty: show the new last page
  const page = Math.min(paging.key === listKey ? paging.page : 1, lastPage);
  const setPage = (next) => setPaging({ key: listKey, page: next });
  const listRows = listed.slice((page - 1) * pageSize, page * pageSize);

  const openForm = ({ income = null } = {}) => {
    setEditingIncome(income);
    setFormOpen(true);
  };

  const handleOpenAdd = () => openForm();
  const handleOpenEdit = (income) => openForm({ income });
  // The app's "+" button: /incomes?add=income
  useQuickAddParam('income', handleOpenAdd, !vaultLocked && !readOnly);

  const { confirm, toast } = useFeedback();

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

  // Login is guaranteed by MainPage's site-wide auth gate before this component renders.

  // Nothing at all only when even «all» is empty; otherwise just this period is
  const hasIncomes = periodIncomes.length > 0 || period !== 'all';
  const periodEmpty = !loadingIncomes && periodIncomes.length === 0;

  if (vaultLocked) {
    return (
      <div className="incomes-page-container">
        <FeaturePageHeader
          icon={<Wallet size={24} />}
          title="درآمدها"
          subtitle="ثبت ورودی‌ها و گزارش کلی درآمد به تفکیک منبع و ماه"
        />
        <VaultUnlockCard title="درآمدهای شما رمزنگاری شده‌اند" />
      </div>
    );
  }

  return (
    <div className="incomes-page-container">
      <FeaturePageHeader
        icon={<Wallet size={24} />}
        title="درآمدها"
        subtitle="ثبت ورودی‌ها و گزارش کلی درآمد به تفکیک منبع و ماه"
        actions={
          <>
            <IncomeCsvExportButton loadIncomes={loadAllIncomes} disabled={!hasIncomes} />
            <IncomeCsvImportButton saveIncome={saveIncome} onImported={fetchIncomes} disabled={readOnly} />
            <Button variant="secondary" icon={<Tags size={16} />} onClick={() => setManagingCategories(true)} disabled={readOnly}>
              دسته‌ها
            </Button>
            <Button
              icon={<Plus size={16} />}
              onClick={handleOpenAdd}
              disabled={readOnly}
              title={readOnly ? 'در نسخه دمو غیرفعال است' : undefined}
            >
              ثبت درآمد جدید
            </Button>
          </>
        }
      />

      <PeriodBar value={period} onChange={setPeriod} />

      {error && hasIncomes && (
        <AlertBanner type="error" message={error} onClose={clearError} />
      )}

      {error && !hasIncomes ? (
        <AlertBanner
          type="error"
          message={error}
          action={
            <Button size="sm" variant="secondary" onClick={fetchIncomes}>
              تلاش مجدد
            </Button>
          }
        />
      ) : (
        <SplitPageLayout
          sidebar={
            <>
              <IncomeSummaryCards report={report} hideValues={hideValues} />
              <div className="incomes-report-grid">
                <MonthlyIncomeChart series={monthlySeries} title={chartTitle} categoryOrder={categoryOrder} hideValues={hideValues} />
                {report.count > 0 && <IncomeReport report={report} hideValues={hideValues} />}
              </div>
            </>
          }
        >
          <div className="portfolio-table-card">
            <div className="portfolio-table-header">
              <div className="table-title">
                <div className="table-title-main">
                  <h3>لیست درآمدها</h3>
                </div>
              </div>

              {hasIncomes && (
                <SearchBar
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجو در عنوان، منبع یا یادداشت..."
                  badge={`${listed.length.toLocaleString('fa-IR')} مورد`}
                  className="incomes-search"
                />
              )}
            </div>

            <div className="table-card-body">
              {loadingIncomes && periodIncomes.length === 0 ? (
                <SkeletonRows rows={5} columns={4} label="در حال دریافت لیست درآمدها" />
              ) : !hasIncomes ? (
                <EmptyState
                  icon={<Wallet size={44} strokeWidth={1.5} />}
                  title="هنوز هیچ درآمدی ثبت نشده است"
                  description="با ثبت اولین درآمد، گزارش مجموع ورودی‌ها به تفکیک ماه و منبع درآمد اینجا نمایش داده می‌شود."
                  action={
                    <Button icon={<Plus size={16} />} onClick={handleOpenAdd}>
                      ثبت اولین درآمد
                    </Button>
                  }
                />
              ) : periodEmpty && !searching ? (
                <EmptyState
                  icon={<CalendarRange size={40} strokeWidth={1.5} />}
                  title="در این بازه درآمدی ثبت نشده است"
                  description="بازه زمانی دیگری را از بالای صفحه انتخاب کنید یا درآمد جدیدی ثبت نمایید."
                />
              ) : searching && listed.length === 0 ? (
                <EmptyState
                  title="موردی یافت نشد"
                  description="هیچ درآمدی در این بازه با عبارت جستجو شده مطابقت ندارد."
                />
              ) : (
                <div className={loadingIncomes ? 'is-refreshing' : ''} aria-busy={loadingIncomes}>
                  <IncomesTable
                    incomes={listRows}
                    onEdit={handleOpenEdit}
                    onDelete={handleDelete}
                    deletingId={deletingId}
                    hideValues={hideValues}
                    readOnly={readOnly}
                    sortState={{ key: 'date', dir: order }}
                    onSortChange={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
                  />
                </div>
              )}

              <Pagination
                page={page}
                pageSize={pageSize}
                total={listed.length}
                loading={loadingIncomes}
                onChange={setPage}
                label="صفحه‌بندی درآمدها"
              />
            </div>
          </div>
        </SplitPageLayout>
      )}

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
