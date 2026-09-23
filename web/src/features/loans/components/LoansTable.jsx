/**
 * LoansTable.jsx — List of Loans as Compact, Full-width Row Cards
 */

import React from 'react';
import {
  Landmark,
  Edit2,
  Trash2,
  ChevronLeft,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getDisplayRatePct } from '../../../utils/loanCalculator.js';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

export default function LoansTable({
  loans = [],
  onSelectLoan,
  onEditLoan,
  onDeleteLoan,
}) {
  return (
    <div className="loans-list">
      {loans.map((loan) => {
        const totalCount = loan.totalCount || loan.installmentCount || 0;
        const paidCount = loan.paidCount || 0;
        const progressPct = totalCount > 0 ? Math.min(100, Math.round((paidCount / totalCount) * 100)) : 0;
        const isCompleted = loan.remainingBalance === 0 || (totalCount > 0 && paidCount >= totalCount);
        const displayRatePct = getDisplayRatePct(loan);
        const isZeroInterest = displayRatePct === 0;

        return (
          <div
            key={loan.id}
            className={`loan-row-card ${isCompleted ? 'is-completed' : ''}`}
            onClick={() => onSelectLoan?.(loan)}
          >
            {/* Identity: icon + title + lender */}
            <div className="loan-row-identity">
              <div className={`loan-icon-box ${isCompleted ? 'completed' : ''}`}>
                <Landmark size={18} />
              </div>
              <div className="loan-row-titles">
                <h3 className="loan-title">{loan.title}</h3>
                <span className="loan-lender-name">{loan.lenderName || '—'}</span>
              </div>
              <span className={`badge-rate ${isZeroInterest ? 'zero' : ''}`}>{displayRatePct}٪</span>
            </div>

            {/* Remaining balance / principal */}
            <div className="loan-row-block loan-row-balance">
              <span className="loan-row-label">مانده بدهی</span>
              <strong className={`loan-row-value ${isCompleted ? 'completed' : 'active'}`}>
                {isCompleted ? 'تسویه شده' : `${formatNum(loan.remainingBalance)} تومان`}
              </strong>
              <span className="loan-row-sub">اصل: {formatNum(loan.principalAmount)} تومان</span>
            </div>

            {/* Installments progress */}
            <div className="loan-row-block loan-row-progress-block">
              <div className="loan-row-progress-top">
                <span className="loan-row-label">
                  {paidCount} از {totalCount} قسط
                </span>
                <span className="progress-pct">{formatNum(progressPct)}٪</span>
              </div>
              <div className="loan-progress-track">
                <div
                  className={`loan-progress-bar ${isCompleted ? 'completed' : ''}`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            {/* Next due installment */}
            <div className="loan-row-block loan-row-next-due">
              {isCompleted ? (
                <span className="next-due-completed-inline">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  بدون قسط باقیمانده
                </span>
              ) : loan.nextDueInstallment ? (
                <>
                  <span className="loan-row-label">
                    <Clock size={12} />
                    قسط بعدی: #{loan.nextDueInstallment.installmentNumber}
                  </span>
                  <strong className="loan-row-value due">
                    {formatNum(loan.nextDueInstallment.totalAmount)} تومان
                  </strong>
                  <span className="loan-row-sub">{formatShamsiDisplay(loan.nextDueInstallment.dueDate)}</span>
                </>
              ) : (
                <span className="loan-row-empty">سررسید معوقی نیست</span>
              )}
            </div>

            {/* Actions + affordance */}
            <div className="loan-row-actions" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="btn-loan-action edit"
                onClick={() => onEditLoan?.(loan)}
                title="ویرایش وام"
              >
                <Edit2 size={14} />
              </button>
              <button
                type="button"
                className="btn-loan-action delete"
                onClick={() => onDeleteLoan?.(loan.id)}
                title="حذف وام"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <ChevronLeft size={16} className="loan-row-chevron" />
          </div>
        );
      })}
    </div>
  );
}
