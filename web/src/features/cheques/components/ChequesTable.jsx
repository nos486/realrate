/**
 * ChequesTable.jsx — Cheques list (desktop table / mobile cards via ResponsiveDataTable)
 */

import React from 'react';
import { Calendar, CheckCircle2, ClipboardList, Pencil, Trash2 } from 'lucide-react';
import { ResponsiveDataTable } from '../../../shared/ui/index.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { BankLogo, resolveBank, useCustomBanks } from '../../../shared/banks/index.js';
import { daysUntilDue, isChequeOpen } from '../../../utils/chequeDocument.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { getDirectionDisplay, describeDueDays } from '../constants/chequeDisplay.js';
import ChequeStatusBadge from './ChequeStatusBadge.jsx';

export default function ChequesTable({ cheques, onTrack, onClear, onEdit, onDelete, deletingId = null, clearingId = null, hideValues = false }) {
  const { customBanks } = useCustomBanks();
  const today = todayIso();

  const columns = [
    {
      key: 'counterparty',
      header: 'طرف حساب',
      mobile: 'title',
      render: (cheque) => {
        const { Icon, label, tone } = getDirectionDisplay(cheque.direction);
        return (
          <button type="button" className="cheque-title-btn" onClick={() => onTrack(cheque)}>
            <span className={`cheque-direction-icon is-${tone}`} title={`چک ${label}`}>
              <Icon size={13} strokeWidth={2.4} />
            </span>
            <span className="cheque-title-text">{cheque.counterparty}</span>
          </button>
        );
      },
    },
    {
      key: 'due',
      header: 'سررسید',
      mobile: 'meta',
      render: (cheque) => {
        const days = daysUntilDue(cheque, today);
        const open = isChequeOpen(cheque);
        return (
          <span className="table-date-text">
            <Calendar size={12} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
            {formatShamsiDisplay(`${cheque.dueDate}T00:00:00`)}
            {open && (
              <span className={`cheque-due-hint ${days < 0 ? 'is-late' : days <= 7 ? 'is-soon' : ''}`}>
                {describeDueDays(days)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'وضعیت',
      mobile: 'meta',
      render: (cheque) => <ChequeStatusBadge status={cheque.status} />,
    },
    {
      key: 'bank',
      header: 'بانک',
      render: (cheque) => {
        const bank = resolveBank({ bankId: cheque.bankId, lenderName: cheque.bankName }, customBanks);
        if (bank.kind === 'none') return <span className="table-notes-text">—</span>;
        return (
          <span className="cheque-bank-cell">
            <BankLogo bank={bank} size={20} />
            {bank.shortName}
          </span>
        );
      },
    },
    {
      key: 'amount',
      header: 'مبلغ',
      mobile: 'stat',
      render: (cheque) => {
        const { tone } = getDirectionDisplay(cheque.direction);
        return (
          <div className="cell-currency-wrap">
            <strong className={`cell-val-bold cheque-amount is-${tone} ${hideValues ? 'is-masked' : ''}`}>
              {hideValues ? '****' : formatNum(cheque.amount)}
            </strong>
            <span className="cell-unit">تومان</span>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'عملیات',
      mobile: 'actions',
      render: (cheque) => (
        <div className="row-actions-group">
          {isChequeOpen(cheque) && (
            <button
              type="button"
              className={`btn-table-action cheque-clear-btn ${clearingId === cheque.id ? 'loading' : ''}`}
              title="پاس شد (با تاریخ امروز)"
              aria-label={`پاس شدن چک ${cheque.counterparty}`}
              onClick={() => onClear(cheque)}
              disabled={clearingId === cheque.id}
            >
              <CheckCircle2 size={13} strokeWidth={2.2} />
              <span>پاس شد</span>
            </button>
          )}
          <button type="button" className="btn-table-action" title="پیگیری و تغییر وضعیت" aria-label="پیگیری" onClick={() => onTrack(cheque)}>
            <ClipboardList size={13} strokeWidth={2} />
          </button>
          <button type="button" className="btn-table-action edit" title="ویرایش چک" aria-label="ویرایش" onClick={() => onEdit(cheque)}>
            <Pencil size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={`btn-table-action delete ${deletingId === cheque.id ? 'loading' : ''}`}
            title="حذف چک"
            aria-label="حذف"
            onClick={() => onDelete(cheque)}
            disabled={deletingId === cheque.id}
          >
            <Trash2 size={13} strokeWidth={2} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <ResponsiveDataTable
      columns={columns}
      rows={cheques}
      wrapperClassName="portfolio-table-responsive"
      tableClassName="portfolio-data-table cheques-table"
      rowClassName={(cheque) => `portfolio-table-row ${isChequeOpen(cheque) && daysUntilDue(cheque, today) < 0 ? 'is-overdue' : ''}`}
    />
  );
}
