/**
 * IncomesPage.jsx — Income tracking dashboard
 *
 * - Record / edit / delete income entries (title, category, amount, Shamsi date, notes)
 * - Period picker at the top (last month / 3 / 6 months / a year / all; 6 months by default):
 *   only that date window is fetched from the server
 * - Summary cards + per-category breakdown of the period, and the last 12 months as a chart
 * - The list: 10 per page, paged and sorted by date on the server; a search looks through the
 *   whole period in the browser (titles and notes are encrypted)
 */

import React, { useState, useMemo } from 'react';
import { Wallet, Plus, CalendarRange } from 'lucide-react';
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
import RecurringIncomesCard from './RecurringIncomesCard.jsx';
import { ruleInput } from '../utils/recurringSync.js';
import { buildIncomeReport, buildMonthlySeries } from '../utils/incomeReport.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import VaultUnlockCard from '../../../shared/vault/VaultUnlockCard.jsx';

export default function IncomesPage() {
  const {
    incomes,
    total,
    page,
    setPage,
    pageSize,
    period,
    setPeriod,
    periodStart,
    order,
    setOrder,
    windowIncomes,
    loadingWindow,
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
    recurringRules,
    recurringError,
    clearRecurringError,
    saveRecurring,
    toggleRecurring,
    deleteRecurring,
  } = useIncomes();
  const hideValues = usePrivacyMode();

  const [searchQuery, setSearchQuery] = useState('');
  // The page within the search results, reset whenever the search itself changes
  const [searchPaging, setSearchPaging] = useState({ key: '', page: 1 });
  const [formOpen, setFormOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [startRecurring, setStartRecurring] = useState(false);

  // The sidebar's window also holds the chart's 12 months: the period is the part on or after its start
  const periodIncomes = useMemo(
    () => (periodStart ? windowIncomes.filter((i) => String(i.incomeDate) >= periodStart) : windowIncomes),
    [windowIncomes, periodStart]
  );
  const report = useMemo(() => buildIncomeReport(periodIncomes), [periodIncomes]);
  // Always the last 12 months, whatever the period: it is there to show the trend
  const monthlySeries = useMemo(() => buildMonthlySeries(windowIncomes), [windowIncomes]);
  // The source donut's order, so the bar chart's stacks take the same colors
  const categoryOrder = useMemo(() => report.byCategory.map((c) => c.category), [report.byCategory]);

  // Searching looks through the whole period in the browser (titles and notes are encrypted)
  const query = searchQuery.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (!query) return [];
    const dir = order === 'asc' ? 1 : -1;
    return periodIncomes
      .filter((income) =>
        [income.title, income.notes, getIncomeCategory(income.category).label]
          .some((field) => String(field || '').toLowerCase().includes(query))
      )
      .sort((a, b) => dir * (String(a.incomeDate).localeCompare(String(b.incomeDate)) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
  }, [periodIncomes, query, order]);
  const searchKey = `${query}|${period}|${order}`;
  const searchPage = searchPaging.key === searchKey ? searchPaging.page : 1;
  const setSearchPage = (next) => setSearchPaging({ key: searchKey, page: next });

  const searching = Boolean(query);
  const listTotal = searching ? searchMatches.length : total;
  const listPage = searching ? searchPage : page;
  const listRows = searching ? searchMatches.slice((searchPage - 1) * pageSize, searchPage * pageSize) : incomes;

  const openForm = ({ income = null, rule = null, recurring = false } = {}) => {
    setEditingIncome(income);
    setEditingRule(rule);
    setStartRecurring(recurring);
    setFormOpen(true);
  };

  const handleOpenAdd = () => openForm();
  const handleOpenEdit = (income) => openForm({ income });

  const { confirm, toast } = useFeedback();

  const handleSaveRecurring = (data) =>
    // Editing keeps what the rule already generated, so past entries are not added again
    saveRecurring(editingRule ? { ...ruleInput(editingRule), ...data } : data, editingRule?.id);

  const handleToggleRecurring = async (rule) => {
    try {
      await toggleRecurring(rule);
    } catch (err) {
      toast.error(err.message || 'تغییر وضعیت درآمد ثابت ناموفق بود.');
    }
  };

  const handleDeleteRecurring = async (rule) => {
    const ok = await confirm({
      title: 'حذف درآمد ثابت',
      message: `«${rule.title}» دیگر خودکار ثبت نمی‌شود. درآمدهایی که تا امروز ثبت کرده در لیست می‌مانند.`,
      confirmLabel: 'حذف',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteRecurring(rule.id);
    } catch (err) {
      toast.error(err.message || 'حذف درآمد ثابت ناموفق بود.');
    }
  };

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
  const hasIncomes = total > 0 || windowIncomes.length > 0 || period !== 'all';
  const periodEmpty = !loadingIncomes && total === 0;

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
            <IncomeCsvImportButton saveIncome={saveIncome} onImported={fetchIncomes} />
            <Button icon={<Plus size={16} />} onClick={handleOpenAdd}>
              ثبت درآمد جدید
            </Button>
          </>
        }
      />

      <PeriodBar value={period} onChange={setPeriod} />

      {recurringError && <AlertBanner type="warning" message={recurringError} onClose={clearRecurringError} />}

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
              <RecurringIncomesCard
                rules={recurringRules}
                onAdd={() => openForm({ recurring: true })}
                onEdit={(rule) => openForm({ rule })}
                onToggle={handleToggleRecurring}
                onDelete={handleDeleteRecurring}
                hideValues={hideValues}
              />
              <div className="incomes-report-grid">
                <MonthlyIncomeChart series={monthlySeries} categoryOrder={categoryOrder} hideValues={hideValues} />
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
                  badge={`${listTotal.toLocaleString('fa-IR')} مورد`}
                  className="incomes-search"
                />
              )}
            </div>

            <div className="table-card-body">
              {loadingIncomes && incomes.length === 0 && !searching ? (
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
              ) : searching && searchMatches.length === 0 ? (
                <EmptyState
                  title="موردی یافت نشد"
                  description={loadingWindow ? 'در حال جستجو…' : 'هیچ درآمدی در این بازه با عبارت جستجو شده مطابقت ندارد.'}
                />
              ) : (
                <div className={loadingIncomes && !searching ? 'is-refreshing' : ''} aria-busy={loadingIncomes}>
                  <IncomesTable
                    incomes={listRows}
                    onEdit={handleOpenEdit}
                    onDelete={handleDelete}
                    deletingId={deletingId}
                    hideValues={hideValues}
                    sortState={{ key: 'date', dir: order }}
                    onSortChange={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
                  />
                </div>
              )}

              <Pagination
                page={listPage}
                pageSize={pageSize}
                total={listTotal}
                loading={loadingIncomes && !searching}
                onChange={searching ? setSearchPage : setPage}
                label="صفحه‌بندی درآمدها"
              />
            </div>
          </div>
        </SplitPageLayout>
      )}

      {formOpen && (
        <IncomeForm
          key={editingIncome?.id || editingRule?.id || 'new'}
          onClose={() => setFormOpen(false)}
          // An auto-created entry keeps its link to the fixed income that made it
          onSubmit={(data) => saveIncome({ ...data, recurringId: editingIncome?.recurringId || '' }, editingIncome?.id)}
          onSubmitRecurring={handleSaveRecurring}
          editingIncome={editingIncome}
          editingRule={editingRule}
          startRecurring={startRecurring}
          submitting={submitting}
        />
      )}
    </div>
  );
}
