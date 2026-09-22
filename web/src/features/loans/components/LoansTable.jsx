/**
 * LoansTable.jsx — Grid of Interactive Loan Cards with Progress, Balance, and Next Due Metadata
 */

import React from 'react';
import {
  Landmark,
  Calendar,
  CreditCard,
  Edit2,
  Trash2,
  ChevronLeft,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { gregorianToShamsi } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getDisplayRatePct } from '../../../utils/loanCalculator.js';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

export default function LoansTable({
  loans = [],
  onSelectLoan,
  onEditLoan,
  onDeleteLoan,
}) {
  return (
    <div className="loans-grid">
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
            className={`loan-card ${isCompleted ? 'is-completed' : ''}`}
            onClick={() => onSelectLoan?.(loan)}
          >
            {/* Card Header */}
            <div className="loan-card-header">
              <div className="loan-title-group">
                <div className={`loan-icon-box ${isCompleted ? 'completed' : ''}`}>
                  <Landmark size={20} />
                </div>
                <div>
                  <h3 className="loan-title">{loan.title}</h3>
                  {loan.lenderName && (
                    <span className="loan-lender-name">{loan.lenderName}</span>
                  )}
                </div>
              </div>

              <div className="loan-header-actions" onClick={(e) => e.stopPropagation()}>
                <span className={`badge-rate ${isZeroInterest ? 'zero' : ''}`}>
                  {displayRatePct}٪
                </span>
                <button
                  type="button"
                  className="btn-loan-action edit"
                  onClick={() => onEditLoan?.(loan)}
                  title="ویرایش وام"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  type="button"
                  className="btn-loan-action delete"
                  onClick={() => onDeleteLoan?.(loan.id)}
                  title="حذف وام"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* Main Debt & Balance Metric */}
            <div className="loan-metric-section">
              <div className="metric-row">
                <span className="metric-label">مانده کل بدهی:</span>
                <strong className={`metric-value ${isCompleted ? 'completed' : 'active'}`}>
                  {isCompleted ? 'تسویه شده' : `${formatNum(loan.remainingBalance)} تومان`}
                </strong>
              </div>
              <div className="metric-row sub">
                <span className="metric-label">اصل وام:</span>
                <span className="metric-sub-value">{formatNum(loan.principalAmount)} تومان</span>
              </div>
            </div>

            {/* Installments Progress Bar */}
            <div className="loan-progress-section">
              <div className="progress-labels">
                <span>
                  {paidCount} از {totalCount} قسط پرداخت شده
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

            {/* Next Due Installment Info Box */}
            <div className="loan-next-due-box">
              {isCompleted ? (
                <div className="next-due-completed">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span>تمامی اقساط این وام تسویه شده‌اند.</span>
                </div>
              ) : loan.nextDueInstallment ? (
                <div className="next-due-details">
                  <div className="next-due-top">
                    <span className="next-due-tag">
                      <Clock size={13} />
                      قسط بعدی: #{loan.nextDueInstallment.installmentNumber}
                    </span>
                    <span className="next-due-date">
                      سررسید: {gregorianToShamsi(loan.nextDueInstallment.dueDate)}
                    </span>
                  </div>
                  <div className="next-due-amount">
                    <span>مبلغ قسط:</span>
                    <strong>{formatNum(loan.nextDueInstallment.totalAmount)} تومان</strong>
                  </div>
                </div>
              ) : (
                <div className="next-due-empty">
                  <span>اقساط معوق مشخص نیست</span>
                </div>
              )}
            </div>

            {/* Card Footer Action */}
            <div className="loan-card-footer">
              <span className="btn-view-schedule">
                <span>مشاهده جدول اقساط و ثبت پرداخت</span>
                <ChevronLeft size={16} />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
