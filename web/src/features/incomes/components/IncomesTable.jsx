/**
 * IncomesTable.jsx — Income entries list (desktop table / mobile cards via ResponsiveDataTable)
 */

import React from 'react';
import { Calendar, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { ResponsiveDataTable } from '../../../shared/ui/index.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';
import { DollarValueLine } from '../../../shared/ui/DollarValue.jsx';
import { incomeDollarValue } from '../utils/incomeReport.js';

/**
 * @param {{ usdToman?: number, usdAt?: Function }} props - today's dollar rate and the rate on a
 *   date: each income is also shown in dollars at its day's rate (DollarValueLine)
 */
export default function IncomesTable({ incomes, onEdit, onDelete, deletingId = null, hideValues = false, readOnly = false, sortState = null, onSortChange = null, usdToman = 0, usdAt = null }) {
  const columns = [
    {
      key: 'title',
      header: 'عنوان',
      mobile: 'title',
      render: (income) => (
        <span className="income-title-text">
          {income.title}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'دسته‌بندی',
      mobile: 'meta',
      render: (income) => {
        const { label, Icon, color, excluded } = getIncomeCategory(income.category);
        return (
          <span className="income-category-badge" style={{ '--income-cat-color': color }}>
            <Icon size={12} />
            {label}
            {excluded && <span className="excluded-badge" title="در جمع درآمدها حساب نمی‌شود">خارج از جمع</span>}
          </span>
        );
      },
    },
    {
      key: 'date',
      header: 'تاریخ دریافت',
      // Sorted on the server (by the plaintext date), newest first by default
      sortKey: 'date',
      mobile: 'meta',
      render: (income) => (
        <span className="table-date-text">
          <Calendar size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          {formatShamsiDisplay(`${income.incomeDate}T00:00:00`)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'مبلغ',
      mobile: 'stat',
      render: (income) => (
        <div className="cell-currency-wrap">
          <strong className={`cell-val-bold text-profit ${hideValues ? 'is-masked' : ''}`}>
            {hideValues ? '****' : formatNum(income.amount)}
          </strong>
          <span className="cell-unit">تومان</span>
          <DollarValueLine value={incomeDollarValue(income, usdToman, usdAt)} hideValues={hideValues} />
        </div>
      ),
    },
    {
      key: 'notes',
      header: 'یادداشت',
      tdClassName: 'td-notes',
      render: (income) => (
        <span className="table-notes-text" title={income.notes || ''}>
          {income.notes ? (
            <>
              <MessageSquare size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
              {income.notes}
            </>
          ) : '—'}
        </span>
      ),
    },
    ...(!readOnly
      ? [
          {
            key: 'actions',
            header: 'عملیات',
            mobile: 'actions',
            render: (income) => (
              <div className="row-actions-group">
                <button
                  type="button"
                  className="btn-table-action edit"
                  title="ویرایش درآمد"
                  onClick={() => onEdit(income)}
                >
                  <Pencil size={13} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={`btn-table-action delete ${deletingId === income.id ? 'loading' : ''}`}
                  title="حذف درآمد"
                  onClick={() => onDelete(income)}
                  disabled={deletingId === income.id}
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <ResponsiveDataTable
      columns={columns}
      rows={incomes}
      wrapperClassName="portfolio-table-responsive"
      tableClassName="portfolio-data-table incomes-table"
      rowClassName={(income) => `portfolio-table-row ${getIncomeCategory(income.category).excluded ? 'is-excluded is-excluded-row' : ''}`}
      sortState={sortState}
      onSortChange={onSortChange}
    />
  );
}
