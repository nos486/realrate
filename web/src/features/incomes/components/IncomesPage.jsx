/**
 * IncomesPage.jsx — Income tracking dashboard
 *
 * - Record / edit / delete income entries (title, category, amount, Shamsi date, notes)
 * - Period filter (all / this Shamsi year / this Shamsi month) driving every figure on the page
 * - Summary cards + per-category and per-month breakdown
 * - Searchable, responsive list of entries
 */

import React, { useState, useMemo } from 'react';
import { Wallet, Plus, CalendarRange, RefreshCw } from 'lucide-react';
import { useIncomes } from '../hooks/useIncomes.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import {
  AlertBanner,
  Button,
  EmptyState,
  FeaturePageHeader,
  SearchBar,
  SplitPageLayout,
} from '../../../shared/ui/index.js';
import IncomeForm from './IncomeForm.jsx';
import IncomeSummaryCards from './IncomeSummaryCards.jsx';
import IncomeReport from './IncomeReport.jsx';
import IncomesTable from './IncomesTable.jsx';
import IncomeCsvExportButton from './IncomeCsvExportButton.jsx';
import IncomeCsvImportButton from './IncomeCsvImportButton.jsx';
import { INCOME_PERIODS, buildIncomeReport, filterIncomesByPeriod } from '../utils/incomeReport.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';

export default function IncomesPage() {
  const {
    incomes,
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

  const [period, setPeriod] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);

  const periodIncomes = useMemo(() => filterIncomesByPeriod(incomes, period), [incomes, period]);
  const report = useMemo(() => buildIncomeReport(periodIncomes), [periodIncomes]);

  const visibleIncomes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return periodIncomes;
    return periodIncomes.filter((income) =>
      [income.title, income.notes, getIncomeCategory(income.category).label]
        .some((field) => String(field || '').toLowerCase().includes(q))
    );
  }, [periodIncomes, searchQuery]);

  const handleOpenAdd = () => {
    setEditingIncome(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (income) => {
    setEditingIncome(income);
    setFormOpen(true);
  };

  const handleDelete = async (income) => {
    if (!window.confirm(`آیا از حذف درآمد «${income.title}» اطمینان دارید؟`)) return;
    try {
      await deleteIncome(income.id);
    } catch {
      // Surfaced through the hook's `error` banner
    }
  };

  // Login is guaranteed by MainPage's site-wide auth gate before this component renders.

  const hasIncomes = incomes.length > 0;

  return (
    <div className="incomes-page-container">
      <FeaturePageHeader
        icon={<Wallet size={24} />}
        title="درآمدها"
        subtitle="ثبت ورودی‌ها و گزارش کلی درآمد به تفکیک منبع و ماه"
        actions={
          <>
            <IncomeCsvExportButton incomes={incomes} disabled={!hasIncomes} />
            <IncomeCsvImportButton saveIncome={saveIncome} />
            <Button icon={<Plus size={16} />} onClick={handleOpenAdd}>
              ثبت درآمد جدید
            </Button>
          </>
        }
      />

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
              {report.count > 0 && <IncomeReport report={report} hideValues={hideValues} />}
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
                  badge={`${visibleIncomes.length.toLocaleString('fa-IR')} مورد`}
                  className="incomes-search"
                />
              )}
            </div>

            <div className="table-card-body">
              <div className="tx-filter-pills-bar">
                {INCOME_PERIODS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`tx-filter-pill ${period === opt.value ? 'active' : ''}`}
                    onClick={() => setPeriod(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {loadingIncomes && !hasIncomes ? (
                <div className="incomes-loading-state">
                  <RefreshCw size={22} className="spin-anim" />
                  <span>در حال دریافت لیست درآمدها...</span>
                </div>
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
              ) : report.count === 0 ? (
                <EmptyState
                  icon={<CalendarRange size={40} strokeWidth={1.5} />}
                  title="در این بازه درآمدی ثبت نشده است"
                  description="بازه زمانی دیگری را انتخاب کنید یا درآمد جدیدی ثبت نمایید."
                />
              ) : visibleIncomes.length === 0 ? (
                <EmptyState
                  title="موردی یافت نشد"
                  description="هیچ درآمدی با عبارت جستجو شده مطابقت ندارد."
                />
              ) : (
                <IncomesTable
                  incomes={visibleIncomes}
                  onEdit={handleOpenEdit}
                  onDelete={handleDelete}
                  deletingId={deletingId}
                  hideValues={hideValues}
                />
              )}
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
    </div>
  );
}
