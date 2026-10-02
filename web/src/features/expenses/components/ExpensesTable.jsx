/**
 * ExpensesTable.jsx — Expenses of a section (desktop table / mobile cards via ResponsiveDataTable)
 * An expense funded by a loan («تأمین از») names the loan under its title. A shared expense
 * («دنگ») shows the user's share under the amount, and what is still owed back; «دریافتی‌ها»
 * (`onReimburse`) records what came back.
 */

import React from 'react';
import { Calendar, HandCoins, Landmark, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { ResponsiveDataTable } from '../../../shared/ui/index.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatAmount } from '../utils/format.js';
import { expenseInToman, isSharedExpense, expenseReceivable, expenseDollarValue } from '../../../utils/expenseDocument.js';
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

/** A toman expense in dollars at its day's rate, and what those dollars cost today */
function DollarValue({ expense, usdToman, hideValues }) {
  const value = expenseDollarValue(expense, usdToman);
  if (!value) return null;
  const up = value.changePct !== null && value.changePct >= 0;
  return (
    <span className="expense-dollar-value" title={`نرخ دلار روز هزینه: ${formatAmount(expense.usdRate)} تومان`}>
      ≈ {hideValues ? MASK : formatAmount(value.usd, 'USD')} دلار
      {value.todayToman !== null && (
        <>
          {' · امروز '}{hideValues ? MASK : formatAmount(value.todayToman)} تومان
          {value.changePct !== null && (
            <b className={up ? 'is-up' : 'is-down'}> ({up ? '+' : '−'}{Math.abs(value.changePct).toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪)</b>
          )}
        </>
      )}
    </span>
  );
}

export default function ExpensesTable({
  expenses,
  usdToman = 0,
  onEdit,
  onDelete,
  onReimburse = null,
  deletingId = null,
  hideValues = false,
  readOnly = false,
  showCategory = false,
  accounts = null,
  sortState = null,
  onSortChange = null,
  // A project's toman expenses with the day's dollar rate: in dollars, and at today's rate
  showDollarValue = false,
  // Tags under each title; tapping one shows only its expenses
  onTagClick = null,
  activeTag = null,
}) {
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
            const { label, Icon, color } = getExpenseCategory(e.category);
            return (
              <span className="income-category-badge" style={{ '--income-cat-color': color }}>
                <Icon size={12} />
                {label}
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
        const isUsd = e.currency === 'USD';
        const inToman = isUsd ? expenseInToman(e, usdToman) : null;
        return (
          <div className="cell-currency-wrap expense-amount-cell">
            <span>
              <strong className={`cell-val-bold text-loss ${hideValues ? 'is-masked' : ''}`}>
                {hideValues ? MASK : formatAmount(e.amount, e.currency)}
              </strong>{' '}
              <span className="cell-unit">{isUsd ? 'دلار' : 'تومان'}</span>
            </span>
            {isUsd && inToman !== null && (
              <span className="expense-toman-equiv" title={e.usdRate ? `نرخ ثبت‌شده: ${formatAmount(e.usdRate)}` : 'به نرخ امروز'}>
                ≈ {hideValues ? MASK : formatAmount(inToman)} تومان{!e.usdRate && ' (نرخ امروز)'}
                {isSharedExpense(e) && ' (سهم شما)'}
              </span>
            )}
            {showDollarValue && !isUsd && <DollarValue expense={e} usdToman={usdToman} hideValues={hideValues} />}
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
              {onReimburse && isSharedExpense(e) && (
                <button type="button" className="btn-table-action" title="دریافتی‌های دنگ" onClick={() => onReimburse(e)}>
                  <HandCoins size={13} strokeWidth={2} />
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
      rowClassName={() => 'portfolio-table-row'}
      sortState={sortState}
      onSortChange={onSortChange}
    />
  );
}
