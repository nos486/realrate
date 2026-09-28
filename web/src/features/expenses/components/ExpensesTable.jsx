/**
 * ExpensesTable.jsx — Expenses of a section (desktop table / mobile cards via ResponsiveDataTable)
 */

import React from 'react';
import { Calendar, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { ResponsiveDataTable } from '../../../shared/ui/index.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatAmount } from '../utils/format.js';
import { expenseInToman } from '../../../utils/expenseDocument.js';
import { getExpenseCategory } from '../constants/expenseCategories.js';

const MASK = '****';

export default function ExpensesTable({ expenses, usdToman = 0, onEdit, onDelete, deletingId = null, hideValues = false, readOnly = false, showCategory = false }) {
  const columns = [
    { key: 'title', header: 'عنوان', mobile: 'title', render: (e) => <span className="income-title-text">{e.title}</span> },
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
              </span>
            )}
          </div>
        );
      },
    },
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
    />
  );
}
