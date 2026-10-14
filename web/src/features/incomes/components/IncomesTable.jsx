/**
 * IncomesTable.jsx — Income entries list (desktop table / mobile cards via ResponsiveDataTable):
 * each in its currency — a foreign one with about how much in tomans at its day's rate — and in
 * dollars at its day's rate (DollarValueLine)
 */

import React from 'react';
import { t } from '../../../utils/i18n.js';
import { Calendar, MessageSquare, Pencil, Trash2 } from 'lucide-react';
import { ResponsiveDataTable } from '../../../shared/ui/index.js';
import OwnedRecordLink from '../../../shared/ui/OwnedRecordLink.jsx';
import RecordOriginBadge from '../../../shared/ui/RecordOriginBadge.jsx';
import { recordOwnerOf } from '../../../utils/recordOwners.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { currencyLabel, formatCurrencyNumber, isForeignCurrency } from '../../../utils/currencies.js';
import { getIncomeCategory } from '../constants/incomeCategories.js';
import { DollarValueLine } from '../../../shared/ui/DollarValue.jsx';
import { incomeDollarValue, incomeInToman } from '../../../utils/incomeDocument.js';

/**
 * @param {{ rates?: object }} props - the rates bag (utils/currencies.js): today's rates and the
 *   rates on a date (price history)
 */
export default function IncomesTable({ incomes, onEdit, onDelete, deletingId = null, hideValues = false, readOnly = false, sortState = null, onSortChange = null, rates = {} }) {
  const columns = [
    {
      key: 'title',
      header: t('عنوان'),
      mobile: 'title',
      render: (income) => (
        <span className="income-title-text">
          {income.title}
          <RecordOriginBadge record={income} />
        </span>
      ),
    },
    {
      key: 'category',
      header: t('دسته‌بندی'),
      mobile: 'meta',
      render: (income) => {
        const { label, Icon, color, excluded } = getIncomeCategory(income.category);
        return (
          <span className="income-category-badge" style={{ '--income-cat-color': color }}>
            <Icon size={12} />
            {label}
            {excluded && <span className="excluded-badge" title={t('در جمع درآمدها حساب نمی‌شود')}>{t('خارج از جمع')}</span>}
          </span>
        );
      },
    },
    {
      key: 'date',
      header: t('تاریخ دریافت'),
      // Sorted on the server (by the plaintext date), newest first by default
      sortKey: 'date',
      mobile: 'meta',
      render: (income) => (
        <span className="table-date-text">
          <Calendar size={12} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />
          {formatShamsiDisplay(`${income.incomeDate}T00:00:00`)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('مبلغ'),
      mobile: 'stat',
      render: (income) => {
        const foreign = isForeignCurrency(income.currency);
        const toman = foreign ? incomeInToman(income, rates) : null;
        return (
          <div className="cell-currency-wrap">
            <strong className={`cell-val-bold text-profit ${hideValues ? 'is-masked' : ''}`}>
              {hideValues ? '****' : formatCurrencyNumber(income.amount, income.currency)}
            </strong>
            <span className="cell-unit">{currencyLabel(income.currency)}</span>
            {foreign && toman !== null && (
              <span className="expense-toman-equiv">{t('≈ {amount} تومان', { amount: hideValues ? '****' : formatNum(Math.round(toman)) })}</span>
            )}
            {income.currency !== 'USD' && <DollarValueLine value={incomeDollarValue(income, rates)} hideValues={hideValues} />}
          </div>
        );
      },
    },
    {
      key: 'notes',
      header: t('یادداشت'),
      tdClassName: 'td-notes',
      render: (income) => (
        <span className="table-notes-text" title={income.notes || ''}>
          {income.notes ? (
            <>
              <MessageSquare size={12} style={{ verticalAlign: 'middle', marginInlineEnd: '4px' }} />
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
            header: t('عملیات'),
            mobile: 'actions',
            render: (income) => (
              <div className="row-actions-group">
                {/* Recorded by another feature (a cleared cheque's): changed only from its page */}
                {recordOwnerOf(income) ? <OwnedRecordLink record={income} /> : (
                  <>
                    <button
                      type="button"
                      className="btn-table-action edit"
                      title={t('ویرایش درآمد')}
                      onClick={() => onEdit(income)}
                    >
                      <Pencil size={13} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      className={`btn-table-action delete ${deletingId === income.id ? 'loading' : ''}`}
                      title={t('حذف درآمد')}
                      onClick={() => onDelete(income)}
                      disabled={deletingId === income.id}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </>
                )}
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
