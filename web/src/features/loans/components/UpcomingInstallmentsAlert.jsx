/**
 * UpcomingInstallmentsAlert.jsx — Active Loan Due Date Reminders
 *
 * Analyzes all user loans to detect:
 * 1. Overdue unpaid installments (due date has passed) -> Red AlertBanner
 * 2. Upcoming unpaid installments (due within the next 7 days) -> Amber AlertBanner
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ChevronLeft, Clock, Landmark } from 'lucide-react';
import AlertBanner from '../../../shared/ui/AlertBanner.jsx';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useLoansContext } from '../context/LoansContext.jsx';
import { appPath } from '../../../shared/routes.js';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

export default function UpcomingInstallmentsAlert({ onSelectLoan }) {
  const { loans } = useLoansContext();
  const navigate = useNavigate();
  const [dismissedOverdue, setDismissedOverdue] = useState(false);
  const [dismissedUpcoming, setDismissedUpcoming] = useState(false);

  // Analyze loans for overdue and upcoming installments within 7 days
  const { overdueItems, upcomingItems } = useMemo(() => {
    const overdue = [];
    const upcoming = [];

    const now = new Date();
    // Normalize today to start of day in UTC/local
    const todayStr = now.toISOString().split('T')[0];
    const todayTimestamp = new Date(todayStr).getTime();
    const sevenDaysFromNowTimestamp = todayTimestamp + 7 * 24 * 60 * 60 * 1000;

    for (const loan of loans) {
      if (!loan || !loan.nextDueInstallment || !loan.nextDueInstallment.dueDate) continue;

      const inst = loan.nextDueInstallment;
      const dueStr = String(inst.dueDate).split('T')[0];
      const dueTimestamp = new Date(dueStr).getTime();

      if (isNaN(dueTimestamp)) continue;

      const itemData = {
        loanId: loan.id,
        loanTitle: loan.title,
        lenderName: loan.lenderName || '',
        installmentNumber: inst.installmentNumber,
        dueDate: dueStr,
        totalAmount: inst.totalAmount,
      };

      if (dueStr < todayStr) {
        // Due date has passed
        const daysPast = Math.max(1, Math.round((todayTimestamp - dueTimestamp) / (24 * 60 * 60 * 1000)));
        overdue.push({
          ...itemData,
          daysPast,
        });
      } else if (dueTimestamp <= sevenDaysFromNowTimestamp) {
        // Due within 0 to 7 days
        const daysLeft = Math.round((dueTimestamp - todayTimestamp) / (24 * 60 * 60 * 1000));
        upcoming.push({
          ...itemData,
          daysLeft,
        });
      }
    }

    // Sort overdue by most urgent (oldest due date first)
    overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    // Sort upcoming by earliest due date first
    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return { overdueItems: overdue, upcomingItems: upcoming };
  }, [loans]);

  const handleGoToLoan = (loanId) => {
    if (onSelectLoan) {
      onSelectLoan(loanId);
    } else {
      navigate(appPath('/loans'));
    }
  };

  if (overdueItems.length === 0 && upcomingItems.length === 0) {
    return null;
  }

  return (
    <div className="upcoming-installments-alerts-stack" style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
      {/* 1. Overdue Installments Alert (Red / Error) */}
      {!dismissedOverdue && overdueItems.length > 0 && (
        <AlertBanner
          type="error"
          title={`هشدار: ${formatNum(overdueItems.length)} قسط وام عقب‌افتاده و معوق`}
          onClose={() => setDismissedOverdue(true)}
          action={
            <button
              type="button"
              className="alert-banner-action-btn"
              onClick={() => handleGoToLoan(overdueItems[0].loanId)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>مشاهده و تسویه</span>
              <ChevronLeft size={14} />
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
            {overdueItems.map((item) => (
              <div
                key={`${item.loanId}_${item.installmentNumber}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.84rem' }}
              >
                <strong>{item.loanTitle}</strong>
                <span>(قسط #{item.installmentNumber})</span>
                <span>•</span>
                <span>سررسید: {formatShamsiDisplay(item.dueDate)} ({formatNum(item.daysPast)} روز گذشته)</span>
                <span>•</span>
                <strong style={{ color: '#fca5a5' }}>{formatNum(item.totalAmount)} تومان</strong>
              </div>
            ))}
          </div>
        </AlertBanner>
      )}

      {/* 2. Upcoming Installments Alert (Amber / Warning - within 7 days) */}
      {!dismissedUpcoming && upcomingItems.length > 0 && (
        <AlertBanner
          type="warning"
          title={`یادآوری: سررسید ${formatNum(upcomingItems.length)} قسط وام طی ۷ روز آینده`}
          onClose={() => setDismissedUpcoming(true)}
          action={
            <button
              type="button"
              className="alert-banner-action-btn"
              onClick={() => handleGoToLoan(upcomingItems[0].loanId)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>مشاهده اقساط</span>
              <ChevronLeft size={14} />
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
            {upcomingItems.map((item) => (
              <div
                key={`${item.loanId}_${item.installmentNumber}`}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.84rem' }}
              >
                <strong>{item.loanTitle}</strong>
                <span>(قسط #{item.installmentNumber})</span>
                <span>•</span>
                <span>
                  سررسید: {formatShamsiDisplay(item.dueDate)}{' '}
                  {item.daysLeft === 0 ? '(امروز!)' : `(تا ${formatNum(item.daysLeft)} روز دیگر)`}
                </span>
                <span>•</span>
                <strong style={{ color: '#fcd34d' }}>{formatNum(item.totalAmount)} تومان</strong>
              </div>
            ))}
          </div>
        </AlertBanner>
      )}
    </div>
  );
}
