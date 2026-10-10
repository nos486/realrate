/**
 * DailyExpensesView.jsx — Everyday expenses, one Shamsi month at a time (the same layout as the
 * incomes page: shared/flow). The year month by month is on the reports page (features/reports).
 *
 * - The month shown; only it and the month before are loaded
 * - The month's total, the change from the same days of last month, the daily average and the
 *   largest category; a donut of the categories; the monthly budgets (total and per category) as
 *   progress bars; and, with accounts, how much was paid from each
 * - The month's expenses, filterable by category and account, with the form to add and edit
 *   them and a CSV export of the month
 * - Expenses can be picked (one by one, the page's rows, or every one listed) and moved into a
 *   project (MoveToProjectModal): they leave the everyday expenses
 * - All spending is in this list: categories left out of the totals («مدیریت نقدینگی»,
 *   «سرمایه‌گذاری» by default) and the projects' expenses (with their category and project) are
 *   listed with a badge (or hidden with «خارج از جمع») but not counted in the total, the
 *   comparison, the budgets or the donut; the categories' own sums show in «خارج از جمع». The form
 *   adds and edits either: its «پروژه» puts an expense in a project or back in the everyday ones
 * - «دنگ»: shared expenses count only the user's share; «طلب‌های دنگ» shows the month's and opens
 *   every open one (OpenSharesModal), and each expense's «دریافتی‌ها» (ReimbursementsModal)
 */

import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';
import { expenseCsvHeaders, expenseCsvRow } from '../utils/expenseCsv.js';
import React, { useCallback, useMemo, useState } from 'react';
import { useUsdAt } from '../../market/dailyHistory.js';
import { Plus, Coins, Tags, Target, HandCoins, Eye, EyeOff, FolderInput, X } from 'lucide-react';
import { AlertBanner, Button, EmptyState, GenericCsvExportButton, IconButton, Pagination, SearchBar, SplitPageLayout } from '../../../shared/ui/index.js';
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
} from '../../../utils/expenseDocument.js';
import PeriodSwitcher from '../../../shared/flow/PeriodSwitcher.jsx';
import { FlowMonthCards, CategoryPills, ExcludedBox } from '../../../shared/flow/FlowCards.jsx';
import { formatShamsiMonth, monthIndex, monthProgress, shamsiMonthOf } from '../../../shared/flow/flowYear.js';
import { useDemo } from '../../demo/index.js';
import { useDailyExpenses } from '../hooks/useDailyExpenses.js';
import { useAccounts } from '../../accounts/hooks/useAccounts.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';
import { formatAmount } from '../utils/format.js';
import ExpenseForm from './ExpenseForm.jsx';
import CashMoveTransferForm from '../../accounts/components/CashMoveTransferForm.jsx';
import ExpensesTable from './ExpensesTable.jsx';
import BudgetForm from './BudgetForm.jsx';
import BudgetProgress from './BudgetProgress.jsx';
import ReimbursementsModal from './ReimbursementsModal.jsx';
import OpenSharesModal from './OpenSharesModal.jsx';
import MoveToProjectModal from './MoveToProjectModal.jsx';
import { useCategories } from '../../../shared/categories/useCategories.js';
import { splitCounted } from '../../../shared/categories/categoryStore.js';
import { useShowExcluded } from '../../../shared/categories/useShowExcluded.js';
import CategoryManagerModal from '../../../shared/categories/CategoryManagerModal.jsx';
import { useQuickAddParam } from '../../../shared/hooks/useQuickAddParam.js';

const CSV_HEADERS = expenseCsvHeaders({ withCategory: true });
const EXPENSES_PAGE_SIZE = 20;

const MASK = '****';
const labelOf = (category) => getExpenseCategory(category).label;

export default function DailyExpensesView({ usdToman = 0, hideValues = false }) {
  const { readOnly } = useDemo();
  // Re-renders with the user's category names (their own categories included)
  const categories = useCategories('expense', { includeHidden: true });
  // Recompute the split when a category is switched in or out of the totals
  const exclusionKey = categories.filter((c) => c.excluded).map((c) => c.value).join(',');
  const [showExcluded, setShowExcluded] = useShowExcluded('expense');
  const [managingCategories, setManagingCategories] = useState(false);
  const { confirm, toast } = useFeedback();
  const today = todayIso();
  const thisMonth = useMemo(() => shamsiMonthOf(today), [today]);
  const [month, setMonth] = useState(thisMonth);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [order, setOrder] = useState('desc');
  const [paging, setPaging] = useState({ key: '', page: 1 });
  const [form, setForm] = useState(null); // null | { expense: object|null }
  // «مدیریت نقدینگی» recorded as a transfer between the user's accounts: its draft
  const [cashMove, setCashMove] = useState(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [reimburse, setReimburse] = useState(null); // a shared expense whose «دریافتی‌ها» are open
  const [sharesOpen, setSharesOpen] = useState(false);
  // Picked expenses (ids, kept across the list's pages) and the ones being moved to a project
  const [selected, setSelected] = useState(() => new Set());
  const [moving, setMoving] = useState(null); // null | string[]
  // The app's "+" button: /expenses?add=expense (this view shows only once the vault is open)
  useQuickAddParam('expense', () => setForm({ expense: null }), !readOnly);
  const {
    expenses, previousExpenses, projectExpenses = [], budgets, projects = [], loading, submitting, deletingId, error, clearError, fetchMonth,
    saveExpense, saveBudgets, deleteExpense, moveToProject,
  } = useDailyExpenses(month);
  // The dollar's rate on each expense's day, from the price history (each one in dollars)
  const usdAt = useUsdAt(expenses.length > 0);
  const rates = useMemo(() => ({ usdToman, usdAt }), [usdToman, usdAt]);
  const { accounts } = useAccounts();
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  // Loan names for the CSV's «تأمین از»
  const loans = useOptionalLoans();
  const loanById = useMemo(() => new Map(loans.map((l) => [l.id, l])), [loans]);

  const progress = useMemo(() => monthProgress(month, today), [month, today]);
  const isThisMonth = progress.current;
  const daysElapsed = progress.days;
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
  // All spending is in the list: the projects' expenses too, left out of the totals like the
  // excluded categories (counted only in their project)
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const projectOf = useCallback((e) => projectById.get(e.groupId) || null, [projectById]);
  const hiddenCount = split.excluded.length + projectExpenses.length;
  // What the list shows: everything, or without the excluded categories and the projects'
  const shown = useMemo(() => (showExcluded ? [...expenses, ...projectExpenses] : split.counted), [showExcluded, expenses, projectExpenses, split]);
  const shownByCategory = useMemo(() => summarizeByCategory(shown, rates), [shown, rates]);

  // The month before, cut at the same day while this month is still running
  const previous = useMemo(
    () => summarizeExpenses(splitCounted('expense', previousExpenses).counted.filter((e) => e.date <= progress.cutoff), rates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previousExpenses, rates, progress.cutoff, exclusionKey],
  );
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

  const listKey = `${query}|${monthIndex(month)}|${categoryFilter}|${accountFilter}|${order}|${showExcluded}`;
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
    setSelected(new Set());
    setMonth(next);
  };

  // Picking: one, the page's rows, or every expense listed; only the month's own count
  const picked = useMemo(() => expenses.filter((e) => selected.has(e.id)), [expenses, selected]);
  const pickedTotal = useMemo(() => summarizeExpenses(picked, rates).totalToman, [picked, rates]);
  const toggle = (e) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(e.id)) next.delete(e.id);
    else next.add(e.id);
    return next;
  });
  const togglePage = (checked) => setSelected((prev) => {
    const next = new Set(prev);
    for (const e of listRows.filter((row) => !projectOf(row))) {
      if (checked) next.add(e.id);
      else next.delete(e.id);
    }
    return next;
  });
  // A project's expense is moved by its form («پروژه»): only the everyday ones are picked to move
  const selection = readOnly ? null : { selected, onToggle: toggle, onToggleAll: togglePage, label: (e) => `انتخاب «${e.title}»`, canSelect: (e) => !projectOf(e) };
  const movingTotal = useMemo(() => {
    if (!moving) return 0;
    const ids = new Set(moving);
    return summarizeExpenses(expenses.filter((e) => ids.has(e.id)), rates).totalToman;
  }, [moving, expenses, rates]);

  const handleMove = async (target) => {
    const { group, moved } = await moveToProject(moving, target);
    setSelected((prev) => new Set([...prev].filter((id) => !moving.includes(id))));
    toast.success(`${moved.toLocaleString('fa-IR')} هزینه به پروژه‌ی «${group.name}» منتقل شد.`);
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

  return (
    <>
      <PeriodSwitcher month={month} thisMonth={thisMonth} onMonthChange={changeMonth} />

      {error && (
        <AlertBanner
          type="error"
          message={error}
          onClose={clearError}
          action={<Button size="sm" variant="secondary" onClick={fetchMonth}>تلاش مجدد</Button>}
        />
      )}

      <div className="expenses-daily">
        <SplitPageLayout sidebar={monthSidebar}>
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
                <IconButton icon={<Tags size={15} />} label="دسته‌ها" onClick={() => setManagingCategories(true)} disabled={readOnly} />
                {hiddenCount > 0 && (
                  <IconButton
                    icon={showExcluded ? <Eye size={15} /> : <EyeOff size={15} />}
                    label={showExcluded ? 'خارج از جمع: نمایش داده می‌شود' : `خارج از جمع: ${hiddenCount.toLocaleString('fa-IR')} مورد پنهان`}
                    title={showExcluded ? 'پنهان کردن مدیریت نقدینگی، سرمایه‌گذاری، هزینه‌های پروژه‌ها و دیگر موارد خارج از جمع' : 'نمایش موارد خارج از جمع (مدیریت نقدینگی، سرمایه‌گذاری، هزینه‌های پروژه‌ها…)'}
                    active={!showExcluded}
                    pressed={!showExcluded}
                    badge={showExcluded ? null : hiddenCount.toLocaleString('fa-IR')}
                    onClick={() => setShowExcluded(!showExcluded)}
                  />
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
                  {picked.length > 0 && (
                    <div className="expense-selection-bar" role="region" aria-label="هزینه‌های انتخاب‌شده">
                      <span className="expense-selection-count">
                        <strong>{picked.length.toLocaleString('fa-IR')}</strong> هزینه انتخاب شد
                        {pickedTotal > 0 && <> · {money(pickedTotal)} تومان</>}
                      </span>
                      {picked.length < listed.length && (
                        <Button size="sm" variant="secondary" onClick={() => setSelected(new Set(listed.map((e) => e.id)))}>
                          انتخاب همه‌ی {listed.length.toLocaleString('fa-IR')} مورد
                        </Button>
                      )}
                      <Button size="sm" icon={<FolderInput size={15} />} onClick={() => setMoving(picked.map((e) => e.id))}>
                        انتقال به پروژه
                      </Button>
                      <IconButton icon={<X size={15} />} label="لغو انتخاب" onClick={() => setSelected(new Set())} />
                    </div>
                  )}
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
                    markExcluded
                    accounts={accounts.length ? accounts : null}
                    sortState={{ key: 'date', dir: order }}
                    onSortChange={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
                    selection={selection}
                    onMove={readOnly ? null : (e) => setMoving([e.id])}
                    projectOf={projectOf}
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
          projects={projects}
          expense={form.expense}
          usdToman={usdToman}
          accounts={accounts.filter((a) => !a.archived || a.id === form.expense?.accountId)}
          onSubmit={(input) => saveExpense(input, form.expense)}
          onClose={() => setForm(null)}
          submitting={submitting}
          onCashMove={(move) => {
            setForm(null);
            setCashMove(move);
          }}
        />
      )}
      {cashMove && <CashMoveTransferForm draft={cashMove} onClose={() => setCashMove(null)} />}
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
      {moving && (
        <MoveToProjectModal
          count={moving.length}
          totalToman={movingTotal}
          projects={projects}
          hideValues={hideValues}
          onSubmit={handleMove}
          onClose={() => setMoving(null)}
          submitting={submitting}
        />
      )}
      {managingCategories && <CategoryManagerModal kind="expense" onClose={() => setManagingCategories(false)} />}
      {budgetOpen && (
        <BudgetForm budgets={budgets} onSubmit={saveBudgets} onClose={() => setBudgetOpen(false)} submitting={submitting} />
      )}
    </>
  );
}
