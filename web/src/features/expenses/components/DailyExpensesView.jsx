/**
 * DailyExpensesView.jsx — Everyday expenses, one Shamsi month or one Shamsi year at a time (the
 * same layout as the incomes page: shared/flow)
 *
 * - «ماهانه / سالانه» and the month or year shown; the year (and the month before it) is loaded
 *   once, so switching months inside it fetches nothing
 * - «ماهانه»: the month's total, the change from the same days of last month, the daily average
 *   and the largest category; a donut of the categories; the monthly budgets (total and per category) as
 *   progress bars; and, with accounts, how much was paid from each
 * - «سالانه»: the year's total, monthly average, costliest month and largest category; the year
 *   month by month with the change from the month before, and a month-by-month table
 * - The month's expenses, filterable by category and account, with the form to add and edit
 *   them and a CSV export of the month
 * - Categories left out of the totals («مدیریت نقدینگی», «سرمایه‌گذاری» by default) are listed
 *   with a badge (or hidden with «خارج از جمع») but not counted in the total, the comparison, the
 *   budgets or the donut; their own sums show in «خارج از جمع»
 * - «دنگ»: shared expenses count only the user's share; «طلب‌های دنگ» shows the month's and opens
 *   every open one (OpenSharesModal), and each expense's «دریافتی‌ها» (ReimbursementsModal)
 */

import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';
import { expenseCsvHeaders, expenseCsvRow } from '../utils/expenseCsv.js';
import React, { useMemo, useState } from 'react';
import { useUsdAt } from '../../market/dailyHistory.js';
import { Plus, Coins, Tags, Target, HandCoins, Eye, EyeOff } from 'lucide-react';
import { AlertBanner, Button, EmptyState, GenericCsvExportButton, Pagination, SearchBar, SplitPageLayout } from '../../../shared/ui/index.js';
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
  summarizeDollarValue,
  expenseInToman,
} from '../../../utils/expenseDocument.js';
import PeriodSwitcher from '../../../shared/flow/PeriodSwitcher.jsx';
import YearFlowChart from '../../../shared/flow/YearFlowChart.jsx';
import YearMonthTable from '../../../shared/flow/YearMonthTable.jsx';
import { FlowMonthCards, FlowYearCards, CategoryPills, ExcludedBox } from '../../../shared/flow/FlowCards.jsx';
import {
  buildYearSeries,
  formatShamsiMonth,
  formatShamsiYear,
  monthIndex,
  monthProgress,
  shamsiMonthOf,
  shamsiYearRange,
  summarizeYear,
} from '../../../shared/flow/flowYear.js';
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
import { splitCounted } from '../../../shared/categories/categoryStore.js';
import { useShowExcluded } from '../../../shared/categories/useShowExcluded.js';
import CategoryManagerModal from '../../../shared/categories/CategoryManagerModal.jsx';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';

const CSV_HEADERS = expenseCsvHeaders({ withCategory: true });
const EXPENSES_PAGE_SIZE = 20;

const MASK = '****';
const labelOf = (category) => getExpenseCategory(category).label;
const inRange = (e, { from, to }) => e.date >= from && e.date <= to;

export default function DailyExpensesView({ usdToman = 0, hideValues = false }) {
  const { readOnly } = useDemo();
  // Re-renders with the user's category names (their own categories included)
  const categories = useCategories('expense', { includeHidden: true });
  // Recompute the split when a category is switched in or out of the totals
  const exclusionKey = categories.filter((c) => c.excluded).map((c) => c.value).join(',');
  const [showExcluded, setShowExcluded] = useShowExcluded('expense');
  const [managingCategories, setManagingCategories] = useState(false);
  const { confirm } = useFeedback();
  const today = todayIso();
  const thisMonth = useMemo(() => shamsiMonthOf(today), [today]);
  const [mode, setMode] = useState('month');
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
    expenses: monthExpenses, previousExpenses, yearExpenses, budgets, loading, submitting, deletingId, error, clearError, fetchMonth,
    saveExpense, saveBudgets, deleteExpense,
  } = useDailyExpenses(month, { year: true });
  // The dollar's rate on each expense's day, from the price history (each one in dollars)
  const usdAt = useUsdAt([monthExpenses, yearExpenses].some((list) => (list || []).length > 0));
  const rates = useMemo(() => ({ usdToman, usdAt }), [usdToman, usdAt]);
  const { accounts } = useAccounts();
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  // Loan names for the CSV's «تأمین از»
  const loans = useOptionalLoans();
  const loanById = useMemo(() => new Map(loans.map((l) => [l.id, l])), [loans]);

  const yearly = mode === 'year';
  const progress = useMemo(() => monthProgress(month, today), [month, today]);
  const isThisMonth = progress.current;
  const daysElapsed = progress.days;
  const yearRange = useMemo(() => shamsiYearRange(month.jy), [month.jy]);
  // What the page shows: the month, or the whole year
  const expenses = useMemo(
    () => (yearly ? yearExpenses.filter((e) => inRange(e, yearRange)) : monthExpenses),
    [yearly, yearExpenses, yearRange, monthExpenses],
  );
  // Spending only: the categories left out of the totals are summed on their own
  const split = useMemo(
    () => splitCounted('expense', expenses),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, exclusionKey],
  );
  const summary = useMemo(() => summarizeExpenses(split.counted, rates), [split, rates]);
  const dollar = useMemo(() => summarizeDollarValue(split.counted, rates), [split, rates]);
  const byCategory = useMemo(() => summarizeByCategory(split.counted, rates), [split, rates]);
  const excludedByCategory = useMemo(() => summarizeByCategory(split.excluded, rates), [split, rates]);
  // What the list shows: everything, or without the excluded categories
  const shown = showExcluded ? expenses : split.counted;
  const shownByCategory = useMemo(() => summarizeByCategory(shown, rates), [shown, rates]);

  // The month before, cut at the same day while this month is still running
  const previous = useMemo(
    () => summarizeExpenses(splitCounted('expense', previousExpenses).counted.filter((e) => e.date <= progress.cutoff), rates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previousExpenses, rates, progress.cutoff, exclusionKey],
  );
  // The year so far, month by month (spending only)
  const series = useMemo(() => {
    const points = splitCounted('expense', yearExpenses).counted.map((e) => ({ date: e.date, amount: expenseInToman(e, usdToman, usdAt) || 0, category: e.category }));
    return buildYearSeries(points, month.jy, { throughMonth: month.jy === thisMonth.jy ? thisMonth.jm : 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearExpenses, rates, month.jy, thisMonth, exclusionKey]);
  const yearSummary = useMemo(() => summarizeYear(series), [series]);
  const categoryOrder = useMemo(() => byCategory.map((c) => c.category), [byCategory]);
  const top = byCategory[0] ? { label: labelOf(byCategory[0].category), total: byCategory[0].totalToman } : null;
  const money = (v) => (hideValues ? MASK : formatAmount(v));

  // The account pills follow the list; «پرداخت از» sums the spending only
  const byAccount = useMemo(() => summarizeByAccount(shown, rates), [shown, rates]);
  const spentByAccount = useMemo(() => summarizeByAccount(split.counted, rates), [split, rates]);
  const receivables = useMemo(() => summarizeReceivables(expenses, rates), [expenses, rates]);
  const usesAccounts = expenses.some((e) => e.accountId);
  const budgetKeys = Object.keys(budgets).filter((k) => k !== 'total');
  // A category's own budget follows its spending even when it is left out of the month's total
  const spentIn = new Map([...byCategory, ...excludedByCategory].map((c) => [c.category, c.totalToman]));

  const query = toEnglishDigits(searchQuery.trim().toLowerCase());
  const searching = Boolean(query);
  const listed = useMemo(() => {
    const dir = order === 'asc' ? 1 : -1;
    const matches = shown.filter((e) => {
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
  }, [shown, categoryFilter, accountFilter, query, order, accountById]);

  const listKey = `${query}|${monthIndex(month)}|${mode}|${categoryFilter}|${accountFilter}|${order}|${showExcluded}`;
  const lastPage = Math.max(1, Math.ceil(listed.length / EXPENSES_PAGE_SIZE));
  const page = Math.min(paging.key === listKey ? paging.page : 1, lastPage);
  const setPage = (next) => setPaging({ key: listKey, page: next });
  const listRows = listed.slice((page - 1) * EXPENSES_PAGE_SIZE, page * EXPENSES_PAGE_SIZE);

  const donutItems = byCategory.map((c) => {
    const meta = getExpenseCategory(c.category);
    return { key: c.category, label: meta.label, value: c.totalToman, icon: <meta.Icon size={12} /> };
  });

  const changeMonth = (next) => {
    setCategoryFilter('all');
    setAccountFilter('all');
    setSearchQuery('');
    setMonth(next);
  };
  const openMonth = (jm) => {
    changeMonth({ jy: month.jy, jm });
    setMode('month');
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

  const monthSidebar = (
    <>
      <FlowMonthCards
        kind="expense"
        monthLabel={formatShamsiMonth(month.jy, month.jm)}
        total={summary.totalToman}
        count={summary.count}
        previousTotal={previous.totalToman}
        previousCount={previous.count}
        current={isThisMonth}
        days={daysElapsed}
        top={top}
        hideValues={hideValues}
        totalFooter={summary.unpricedUsd > 0 && <span>{formatAmount(summary.unpricedUsd, 'USD')} دلار بدون نرخ حساب نشده</span>}
        dollar={dollar}
      />
      {donutItems.length > 0 && (
        <DonutChart title="تفکیک دسته‌ها" items={donutItems} centerLabel="جمع ماه" masked={hideValues} />
      )}
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
      <ExcludedBox kind="expense" items={excludedByCategory.map((c) => ({ category: c.category, total: c.totalToman }))} metaOf={getExpenseCategory} hideValues={hideValues} />
      {usesAccounts && (
        <div className="expense-side-card">
          <div className="expense-side-card-head"><h4>پرداخت از</h4></div>
          <ul className="expense-account-breakdown">
            {spentByAccount.map((a) => (
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

  const yearSidebar = (
    <>
      <FlowYearCards kind="expense" yearLabel={formatShamsiYear(month.jy)} summary={yearSummary} topCategory={top} hideValues={hideValues} dollar={dollar} />
      {donutItems.length > 0 && (
        <DonutChart title="تفکیک دسته‌ها" items={donutItems} centerLabel="جمع سال" masked={hideValues} />
      )}
      <ExcludedBox kind="expense" items={excludedByCategory.map((c) => ({ category: c.category, total: c.totalToman }))} metaOf={getExpenseCategory} hideValues={hideValues} />
    </>
  );

  return (
    <>
      <PeriodSwitcher mode={mode} month={month} thisMonth={thisMonth} onModeChange={setMode} onMonthChange={changeMonth} />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={clearError}
          action={<Button size="sm" variant="secondary" onClick={fetchMonth}>تلاش مجدد</Button>}
        />
      )}

      <div className="expenses-daily">
        <SplitPageLayout sidebar={yearly ? yearSidebar : monthSidebar}>
          {yearly ? (
            <div className="flow-year-main">
              <YearFlowChart series={series} kind="expense" labelOf={labelOf} categoryOrder={categoryOrder} onOpenMonth={openMonth} hideValues={hideValues} large />
              <YearMonthTable series={series} kind="expense" onOpenMonth={openMonth} hideValues={hideValues} />
            </div>
          ) : (
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
                {split.excluded.length > 0 && (
                  <Button
                    variant="secondary"
                    className={`excluded-toggle ${showExcluded ? '' : 'is-active'}`}
                    icon={showExcluded ? <Eye size={16} /> : <EyeOff size={16} />}
                    onClick={() => setShowExcluded(!showExcluded)}
                    aria-pressed={!showExcluded}
                    title={showExcluded ? 'پنهان کردن مدیریت نقدینگی، سرمایه‌گذاری و دیگر دسته‌های خارج از جمع' : 'نمایش دسته‌های خارج از جمع'}
                  >
                    {showExcluded ? 'خارج از جمع' : `خارج از جمع (${split.excluded.length.toLocaleString('fa-IR')} پنهان)`}
                  </Button>
                )}
                <GenericCsvExportButton
                  items={listed}
                  headers={CSV_HEADERS}
                  fileBaseName={`هزینه‌های-روزمره-${formatShamsiMonth(month.jy, month.jm)}`}
                  disabled={listed.length === 0}
                  mapRow={(e) => expenseCsvRow(e, { withCategory: true, usdToman, usdAt, accountById, loanById })}
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
              <CategoryPills
                items={shownByCategory}
                total={shown.length}
                value={categoryFilter}
                onChange={setCategoryFilter}
                labelOf={labelOf}
              />

              {usesAccounts && (
                <div className="tx-filter-pills-bar expense-category-filter" role="group" aria-label="پرداخت از">
                  {[{ accountId: 'all', count: shown.length }, ...byAccount].map(({ accountId, count }) => (
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
                    usdAt={usdAt}
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
          )}
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
