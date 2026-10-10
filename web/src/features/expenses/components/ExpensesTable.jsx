/**
 * ExpensesTable.jsx — Expenses of a section (desktop table / mobile cards via ResponsiveDataTable)
 * An expense funded by a loan («تأمین از») names the loan under its title. A shared expense
 * («دنگ») shows the user's share under the amount, and what is still owed back; «دریافتی‌ها»
 * (`onReimburse`) records what came back. Everyday expenses can be picked (`selection`) and moved
 * to a project (`onMove`). In the everyday list a project's expense (`projectOf`) shows its
 * category and its project (a link there), is left out of the totals, and is edited here like the
 * others (its form's «پروژه» moves it). `markExcluded`: rows left out of the list's totals (the
 * excluded categories, the projects') are marked — the everyday list; a project counts them all.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { DollarValueLine } from '../../../shared/ui/DollarValue.jsx';
import { Calendar, FolderInput, FolderOpen, HandCoins, Landmark, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { ResponsiveDataTable } from '../../../shared/ui/index.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatAmount } from '../utils/format.js';
import {
  expenseInToman, isSharedExpense, expenseReceivable, expenseDollarValue, expenseDayRate, expenseCurrencyRate, expenseOwnRate,
} from '../../../utils/expenseDocument.js';
import { currencyLabel, isForeignCurrency } from '../../../utils/currencies.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';
import { accountLabel } from '../../accounts/constants/accountDisplay.js';
import { useOptionalLoans } from '../../loans/context/LoansContext.jsx';

const MASK = '****';

/** «سهم شما» and what is still owed back on a shared expense */
function ShareStatus({ expense, hideValues, onClick }) {
  const { remaining } = expenseReceivable(expense);
  const money = (v) => (hideValues ? MASK : formatAmount(v, expense.currency));
  const label = remaining > 0 ? `طلب ${money(remaining)}` : 'تسویه شد';
  return (
    <span className="expense-share-status">
      <span>سهم شما {money(expense.myShare)}</span>
      {onClick ? (
        <button type="button" className={`expense-share-chip ${remaining > 0 ? 'is-open' : 'is-settled'}`} onClick={onClick}>
          {label}
        </button>
      ) : (
        <span className={`expense-share-chip ${remaining > 0 ? 'is-open' : 'is-settled'}`}>{label}</span>
      )}
    </span>
  );
}


export default function ExpensesTable({
  expenses,
  // The rates bag (utils/currencies.js: today's rates and the rates on a date, price history)
  rates = {},
  onEdit,
  onDelete,
  onReimburse = null,
  deletingId = null,
  hideValues = false,
  readOnly = false,
  showCategory = false,
  markExcluded = false,
  accounts = null,
  sortState = null,
  onSortChange = null,
  // A project's toman expenses with the day's dollar rate: in dollars, and at today's rate
  // Tags under each title; tapping one shows only its expenses
  onTagClick = null,
  activeTag = null,
  // Rows can be picked (ResponsiveDataTable's selection), and each moved to a project
  selection = null,
  onMove = null,
  // The project an expense of the everyday list belongs to ({ id, name }), or null
  projectOf = null,
}) {
  const projectFor = (e) => (projectOf ? projectOf(e) : null);
  const accountById = accounts ? new Map(accounts.map((a) => [a.id, a])) : null;
  const loans = useOptionalLoans();
  const loanTitle = (id) => (id ? loans.find((l) => l.id === id)?.title || 'وام' : '');
  const columns = [
    {
      key: 'title',
      header: 'عنوان',
      mobile: 'title',
      render: (e) => (
        <span className="income-title-text">
          {e.title}
          {e.loanId && (
            <small className="expense-loan-badge">
              <Landmark size={11} />
              از {loanTitle(e.loanId)}
            </small>
          )}
          {e.tags?.length > 0 && (
            <span className="expense-row-tags">
              {e.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`expense-row-tag ${activeTag && activeTag.toLowerCase() === tag.toLowerCase() ? 'is-active' : ''}`}
                  onClick={onTagClick ? (ev) => { ev.stopPropagation(); onTagClick(tag); } : undefined}
                  disabled={!onTagClick}
                >
                  #{tag}
                </button>
              ))}
            </span>
          )}
        </span>
      ),
    },
    ...(showCategory
      ? [{
          key: 'category',
          header: 'دسته‌بندی',
          mobile: 'meta',
          render: (e) => {
            const project = projectFor(e);
            const { label, Icon, color, excluded } = getExpenseCategory(e.category);
            // A project's expense without a category is named by its title alone
            const badge = (!project || e.category) && (
              <span className="income-category-badge" style={{ '--income-cat-color': color }}>
                <Icon size={12} />
                {label}
                {markExcluded && !project && excluded && <span className="excluded-badge" title="در جمع هزینه‌ها حساب نمی‌شود">خارج از جمع</span>}
              </span>
            );
            if (!project) return badge;
            return (
              <span className="expense-category-cell">
                {badge}
                <span className="income-category-badge expense-project-badge">
                  <FolderOpen size={12} />
                  پروژه «{project.name}»
                  <span className="excluded-badge" title="فقط در جمع همان پروژه حساب می‌شود">خارج از جمع</span>
                </span>
              </span>
            );
          },
        }]
      : []),
    {
      key: 'date',
      header: 'تاریخ',
      sortKey: 'date',
      mobile: 'meta',
      render: (e) => (
        <span className="table-date-text">
          <Calendar size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          {formatShamsiDisplay(`${e.date}T00:00:00`)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'مبلغ',
      mobile: 'stat',
      render: (e) => {
        const foreign = isForeignCurrency(e.currency);
        const inToman = foreign ? expenseInToman(e, rates) : null;
        const dayRate = foreign ? expenseCurrencyRate(e, rates) : 0;
        const ownRate = foreign && expenseOwnRate(e) > 0;
        return (
          <div className="cell-currency-wrap expense-amount-cell">
            <span>
              <strong className={`cell-val-bold text-loss ${hideValues ? 'is-masked' : ''}`}>
                {hideValues ? MASK : formatAmount(e.amount, e.currency)}
              </strong>{' '}
              <span className="cell-unit">{currencyLabel(e.currency)}</span>
            </span>
            {foreign && inToman !== null && (
              <span className="expense-toman-equiv" title={dayRate ? `نرخ ${currencyLabel(e.currency)} روز هزینه: ${formatAmount(dayRate)}${ownRate ? ' (ثبت‌شده)' : ''}` : 'به نرخ امروز'}>
                ≈ {hideValues ? MASK : formatAmount(inToman)} تومان{!dayRate && ' (نرخ امروز)'}
                {isSharedExpense(e) && ' (سهم شما)'}
              </span>
            )}
            {!foreign && (
              <DollarValueLine
                value={expenseDollarValue(e, rates)}
                hideValues={hideValues}
                title={`نرخ دلار روز هزینه: ${formatAmount(expenseDayRate(e, rates.usdAt))} تومان`}
              />
            )}
            {isSharedExpense(e) && <ShareStatus expense={e} hideValues={hideValues} onClick={onReimburse && (() => onReimburse(e))} />}
          </div>
        );
      },
    },
    ...(accountById
      ? [{
          key: 'account',
          header: 'پرداخت از',
          mobile: 'meta',
          render: (e) => (
            <span className="expense-account-text">
              {e.paidFrom
                ? `دلار «${e.paidFrom.portfolioName || 'پورتفو'}»`
                : e.accountId ? accountLabel(accountById.get(e.accountId)) : '—'}
            </span>
          ),
        }]
      : []),
    {
      key: 'notes',
      header: 'یادداشت',
      tdClassName: 'td-notes',
      render: (e) => (
        <span className="table-notes-text" title={e.notes || ''}>
          {e.notes ? (
            <>
              <MessageSquare size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
              {e.notes}
            </>
          ) : '—'}
        </span>
      ),
    },
    ...(!readOnly
      ? [{
          key: 'actions',
          header: 'عملیات',
          mobile: 'actions',
          render: (e) => (
            <div className="row-actions-group">
              {projectFor(e) && (
                <Link to={`/projects/${projectFor(e).id}`} className="btn-table-action" title="در پروژه" aria-label={`باز کردن پروژه «${projectFor(e).name}»`}>
                  <FolderOpen size={13} strokeWidth={2} />
                </Link>
              )}
              {onReimburse && isSharedExpense(e) && (
                <button type="button" className="btn-table-action" title="دریافتی‌های دنگ" onClick={() => onReimburse(e)}>
                  <HandCoins size={13} strokeWidth={2} />
                </button>
              )}
              {onMove && !projectFor(e) && (
                <button type="button" className="btn-table-action" title="انتقال به پروژه" aria-label="انتقال به پروژه" onClick={() => onMove(e)}>
                  <FolderInput size={13} strokeWidth={2} />
                </button>
              )}
              <button type="button" className="btn-table-action edit" title="ویرایش هزینه" onClick={() => onEdit(e)}>
                <Pencil size={13} strokeWidth={2} />
              </button>
              <button
                type="button"
                className={`btn-table-action delete ${deletingId === e.id ? 'loading' : ''}`}
                title="حذف هزینه"
                onClick={() => onDelete(e)}
                disabled={deletingId === e.id}
              >
                <Trash2 size={13} strokeWidth={2} />
              </button>
            </div>
          ),
        }]
      : []),
  ];

  return (
    <ResponsiveDataTable
      columns={columns}
      rows={expenses}
      wrapperClassName="portfolio-table-responsive"
      tableClassName="portfolio-data-table incomes-table"
      rowClassName={(e) => `portfolio-table-row ${markExcluded && (projectFor(e) || getExpenseCategory(e.category).excluded) ? 'is-excluded is-excluded-row' : ''}`}
      sortState={sortState}
      onSortChange={onSortChange}
      selection={selection}
    />
  );
}
