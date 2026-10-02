/**
 * DailyExpensesView.jsx — Everyday expenses, one Shamsi month at a time
 *
 * - Month switcher (previous / next / this month); only that month and the one before are loaded
 * - Summary: the month's total, the change from last month, the daily average and the largest
 *   category; the monthly budgets (total and per category) as progress bars; a donut of the
 *   categories; and, with accounts, how much was paid from each
 * - The month's expenses, filterable by category and account, with the form to add and edit
 *   them and a CSV export of the month
 * - «دنگ»: shared expenses count only the user's share; «طلب‌های دنگ» shows the month's and opens
 *   every open one (OpenSharesModal), and each expense's «دریافتی‌ها» (ReimbursementsModal)
 */

import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';
import { expenseCsvHeaders, expenseCsvRow } from '../utils/expenseCsv.js';
import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, Plus, Coins, TrendingUp, TrendingDown, CalendarDays, Tag, Tags, Target, HandCoins } from 'lucide-react';
import { AlertBanner, Button, EmptyState, GenericCsvExportButton, MiniCard, Pagination, SearchBar, SplitPageLayout } from '../../../shared/ui/index.js';
import DonutChart from '../../../shared/ui/DonutChart.jsx';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { SkeletonRows } from '../../../shared/ui/Skeleton.jsx';
import { todayIso } from '../../../shared/utils/dates.js';
import { toEnglishDigits } from '../../../shared/utils/formatters.js';
import {
  summarizeExpenses,
  summarizeByCategory,
  summarizeByAccount,
  summarizeReceivables,
  shamsiMonthOf,
  shamsiMonthRange,
  shiftShamsiMonth,
} from '../../../utils/expenseDocument.js';
import { formatShamsiMonth } from '../../incomes/utils/incomeReport.js';
import { useDemo } from '../../demo/index.js';
import { useDailyExpenses } from '../hooks/useDailyExpenses.js';
import { useAccounts } from '../../accounts/hooks/useAccounts.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';
import { formatAmount } from '../utils/format.js';
import ExpenseForm from './ExpenseForm.jsx';
import ExpensesTable from './ExpensesTable.jsx';
import BudgetForm from './BudgetForm.jsx';
import BudgetProgress from './BudgetProgress.jsx';
import ReimbursementsModal from './ReimbursementsModal.jsx';
import OpenSharesModal from './OpenSharesModal.jsx';
import { useCategories } from '../../../shared/categories/useCategories.js';
import CategoryManagerModal from '../../../shared/categories/CategoryManagerModal.jsx';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';

const CSV_HEADERS = expenseCsvHeaders({ withCategory: true });
const EXPENSES_PAGE_SIZE = 20;

const MASK = '****';
const monthIndex = ({ jy, jm }) => jy * 12 + jm;

export default function DailyExpensesView({ usdToman = 0, hideValues = false }) {
  const { readOnly } = useDemo();
  // Re-renders with the user's category names (their own categories included)
  useCategories('expense');
  const [managingCategories, setManagingCategories] = useState(false);
  const { confirm } = useFeedback();
  const today = todayIso();
  const thisMonth = useMemo(() => shamsiMonthOf(today), [today]);
  const [month, setMonth] = useState(thisMonth);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [order, setOrder] = useState('desc');
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const [form, setForm] = useState(null); // null | { expense: object|null }
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [reimburse, setReimburse] = useState(null); // a shared expense whose «دریافتی‌ها» are open
  const [sharesOpen, setSharesOpen] = useState(false);
  // The app's "+" button: /expenses?add=expense (this view shows only once the vault is open)
  useQuickAddParam('expense', () => setForm({ expense: null }), !readOnly);
  const {
    expenses, previousExpenses, range, budgets, loading, submitting, deletingId, error, clearError, fetchMonth,
    saveExpense, saveBudgets, deleteExpense,
  } = useDailyExpenses(month);
  const { accounts } = useAccounts();
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  // Loan names for the CSV's «تأمین از»
  const loans = useOptionalLoans();
  const loanById = useMemo(() => new Map(loans.map((l) => [l.id, l])), [loans]);

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

  const byAccount = useMemo(() => summarizeByAccount(expenses, { usdToman }), [expenses, usdToman]);
  const receivables = useMemo(() => summarizeReceivables(expenses, { usdToman }), [expenses, usdToman]);
  const usesAccounts = byAccount.some((a) => a.accountId);
  const budgetKeys = Object.keys(budgets).filter((k) => k !== 'total');
  const spentIn = new Map(byCategory.map((c) => [c.category, c.totalToman]));

  const query = toEnglishDigits(searchQuery.trim().toLowerCase());
  const searching = Boolean(query);
  const listed = useMemo(() => {
    const dir = order === 'asc' ? 1 : -1;
    const matches = expenses.filter((e) => {
      const matchCat = categoryFilter === 'all' || (e.category || 'other') === categoryFilter;
      const matchAcc = accountFilter === 'all' || (e.accountId || '') === accountFilter;
      if (!matchCat || !matchAcc) return false;
      if (!query) return true;
      const catLabel = getExpenseCategory(e.category).label;
      const accLabel = e.accountId ? accountLabel(accountById.get(e.accountId)) : '';
      return [e.title, e.notes, catLabel, accLabel]
        .some((f) => String(f || '').toLowerCase().includes(query));
    });
    return [...matches].sort((a, b) =>
      dir * (String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    );
  }, [expenses, categoryFilter, accountFilter, query, order, accountById]);

  const listKey = `${query}|${monthIndex(month)}|${categoryFilter}|${accountFilter}|${order}`;
  const lastPage = Math.max(1, Math.ceil(listed.length / EXPENSES_PAGE_SIZE));
  const page = Math.min(paging.key === listKey ? paging.page : 1, lastPage);
  const setPage = (next) => setPaging({ key: listKey, page: next });
  const listRows = listed.slice((page - 1) * EXPENSES_PAGE_SIZE, page * EXPENSES_PAGE_SIZE);

  const donutItems = byCategory.map((c) => {
    const meta = getExpenseCategory(c.category);
    return { key: c.category, label: meta.label, value: c.totalToman, icon: <meta.Icon size={12} /> };
  });

  const goTo = (delta) => {
    setCategoryFilter('all');
    setAccountFilter('all');
    setSearchQuery('');
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
      <div className="expense-side-card">
        <div className="expense-side-card-head">
          <h4><Target size={14} /> بودجه ماه</h4>
          {!readOnly && (
            <Button size="sm" variant="secondary" onClick={() => setBudgetOpen(true)}>
              {budgets.total || budgetKeys.length ? 'ویرایش' : 'تعیین بودجه'}
            </Button>
          )}
        </div>
        {budgets.total || budgetKeys.length ? (
          <>
            {budgets.total > 0 && (
              <BudgetProgress label="کل ماه" spent={summary.totalToman} budget={budgets.total} hideValues={hideValues} />
            )}
            {budgetKeys.map((key) => {
              const meta = getExpenseCategory(key);
              return (
                <BudgetProgress
                  key={key}
                  label={meta.label}
                  icon={<meta.Icon size={12} />}
                  spent={spentIn.get(key) || 0}
                  budget={budgets[key]}
                  hideValues={hideValues}
                />
              );
            })}
          </>
        ) : (
          <p className="expense-side-card-empty">برای کل ماه یا هر دسته سقف خرج بگذارید تا نزدیک شدن به آن را ببینید.</p>
        )}
      </div>
      <div className="expense-side-card">
        <div className="expense-side-card-head">
          <h4><HandCoins size={14} /> طلب‌های دنگ</h4>
          <Button size="sm" variant="secondary" onClick={() => setSharesOpen(true)}>همه‌ی طلب‌ها</Button>
        </div>
        {receivables.count > 0 ? (
          <ul className="expense-account-breakdown">
            <li><span>سهم دیگران در این ماه</span><strong>{money(receivables.owedToman)} <small>تومان</small></strong></li>
            <li><span>دریافت‌شده</span><strong>{money(receivables.receivedToman)} <small>تومان</small></strong></li>
            <li><span>مانده‌ی طلب</span><strong className={receivables.remainingToman > 0 ? 'text-loss' : ''}>{money(receivables.remainingToman)} <small>تومان</small></strong></li>
          </ul>
        ) : (
          <p className="expense-side-card-empty">پول کل جمع را دادید؟ هزینه را با «سهم: با دیگران» ثبت کنید؛ فقط سهم خودتان هزینه حساب می‌شود و دریافتی‌ها درآمد نیستند.</p>
        )}
      </div>
      {donutItems.length > 0 && (
        <DonutChart title="تفکیک دسته‌ها" items={donutItems} centerLabel="جمع ماه" masked={hideValues} />
      )}
      {usesAccounts && (
        <div className="expense-side-card">
          <div className="expense-side-card-head"><h4>پرداخت از</h4></div>
          <ul className="expense-account-breakdown">
            {byAccount.map((a) => (
              <li key={a.accountId || 'none'}>
                <span>{a.accountId ? accountLabel(accountById.get(a.accountId)) : 'نامشخص'}</span>
                <strong>{money(a.totalToman)} <small>تومان</small></strong>
              </li>
            ))}
          </ul>
        </div>
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
              <div className="expense-table-tools">
                {expenses.length > 0 && (
                  <SearchBar
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="جستجو در عنوان، دسته یا یادداشت..."
                    badge={`${listed.length.toLocaleString('fa-IR')} مورد`}
                    className="incomes-search"
                  />
                )}
                <Button variant="secondary" icon={<Tags size={16} />} onClick={() => setManagingCategories(true)} disabled={readOnly}>
                  دسته‌ها
                </Button>
                <GenericCsvExportButton
                  items={listed}
                  headers={CSV_HEADERS}
                  fileBaseName={`هزینه‌های-روزمره-${formatShamsiMonth(month.jy, month.jm)}`}
                  disabled={listed.length === 0}
                  mapRow={(e) => expenseCsvRow(e, { withCategory: true, usdToman, accountById, loanById })}
                />
                <Button
                  icon={<Plus size={16} />}
                  onClick={() => setForm({ expense: null })}
                  disabled={readOnly}
                  title={readOnly ? 'در نسخه دمو غیرفعال است' : undefined}
                >
                  ثبت هزینه
                </Button>
              </div>
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

              {usesAccounts && (
                <div className="tx-filter-pills-bar expense-category-filter" role="group" aria-label="پرداخت از">
                  {[{ accountId: 'all', count: expenses.length }, ...byAccount].map(({ accountId, count }) => (
                    <button
                      key={accountId || 'none'}
                      type="button"
                      className={`tx-filter-pill ${accountFilter === accountId ? 'active' : ''}`}
                      aria-pressed={accountFilter === accountId}
                      onClick={() => setAccountFilter(accountId)}
                    >
                      {accountId === 'all' ? 'همه حساب‌ها' : accountId ? accountLabel(accountById.get(accountId)) : 'نامشخص'}
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
              ) : searching && listed.length === 0 ? (
                <EmptyState
                  title="موردی یافت نشد"
                  description="هیچ هزینه‌ای با عبارت جستجو شده مطابقت ندارد."
                />
              ) : listed.length === 0 ? (
                <EmptyState
                  title="موردی در این فیلتر یافت نشد"
                  description="برای این دسته‌بندی یا حساب انتخابی هزینه‌ای ثبت نشده است."
                />
              ) : (
                <>
                  <ExpensesTable
                    expenses={listRows}
                    usdToman={usdToman}
                    onEdit={(expense) => setForm({ expense })}
                    onDelete={handleDelete}
                    onReimburse={setReimburse}
                    deletingId={deletingId}
                    hideValues={hideValues}
                    readOnly={readOnly}
                    showCategory
                    accounts={accounts.length ? accounts : null}
                    sortState={{ key: 'date', dir: order }}
                    onSortChange={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
                  />
                  <Pagination
                    page={page}
                    pageSize={EXPENSES_PAGE_SIZE}
                    total={listed.length}
                    loading={loading}
                    onChange={setPage}
                    label="صفحه‌بندی هزینه‌های روزمره"
                  />
                </>
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
          accounts={accounts.filter((a) => !a.archived || a.id === form.expense?.accountId)}
          onSubmit={(input) => saveExpense(input, form.expense)}
          onClose={() => setForm(null)}
          submitting={submitting}
        />
      )}
      {reimburse && (
        <ReimbursementsModal
          expense={reimburse}
          accounts={accounts.filter((a) => !a.archived || (reimburse.reimbursements || []).some((r) => r.accountId === a.id))}
          readOnly={readOnly}
          onSave={(input, existing) => saveExpense(input, existing)}
          onClose={() => setReimburse(null)}
        />
      )}
      {sharesOpen && (
        <OpenSharesModal
          accounts={accounts.filter((a) => !a.archived)}
          usdToman={usdToman}
          hideValues={hideValues}
          readOnly={readOnly}
          onChanged={fetchMonth}
          onClose={() => setSharesOpen(false)}
        />
      )}
      {managingCategories && <CategoryManagerModal kind="expense" onClose={() => setManagingCategories(false)} />}
      {budgetOpen && (
        <BudgetForm budgets={budgets} onSubmit={saveBudgets} onClose={() => setBudgetOpen(false)} submitting={submitting} />
      )}
    </>
  );
}
