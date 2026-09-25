/**
 * UpcomingInstallmentsAlert.jsx — Active Loan Due Date Reminders
 *
 * Analyzes all user loans to detect:
 * 1. Overdue unpaid installments (due date has passed) -> Red AlertBanner
 * 2. Upcoming unpaid installments (due within the next 7 days) -> Amber AlertBanner
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronDown } from 'lucide-react';
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
    <div className="upcoming-installments-alerts-stack">
      {!dismissedOverdue && overdueItems.length > 0 && (
        <InstallmentAlert
          type="error"
          title={`${formatNum(overdueItems.length)} قسط معوق`}
          items={overdueItems}
          describe={(item) => `سررسید ${formatShamsiDisplay(item.dueDate)}، ${formatNum(item.daysPast)} روز گذشته`}
          actionLabel="مشاهده و تسویه"
          onAction={() => handleGoToLoan(overdueItems[0].loanId)}
          onClose={() => setDismissedOverdue(true)}
        />
      )}

      {!dismissedUpcoming && upcomingItems.length > 0 && (
        <InstallmentAlert
          type="warning"
          title={`${formatNum(upcomingItems.length)} قسط تا ۷ روز آینده`}
          items={upcomingItems}
          describe={(item) =>
            `سررسید ${formatShamsiDisplay(item.dueDate)}، ${item.daysLeft === 0 ? 'امروز' : `${formatNum(item.daysLeft)} روز دیگر`}`}
          actionLabel="مشاهده اقساط"
          onAction={() => handleGoToLoan(upcomingItems[0].loanId)}
          onClose={() => setDismissedUpcoming(true)}
        />
      )}
    </div>
  );
}

/**
 * One-line summary (count and total) that expands to the list of installments on demand, so a
 * reminder never pushes the page content down.
 */
function InstallmentAlert({ type, title, items, describe, actionLabel, onAction, onClose }) {
  const [expanded, setExpanded] = useState(false);
  const total = items.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0);

  return (
    <AlertBanner
      type={type}
      className="installment-alert"
      onClose={onClose}
      message={
        <div className="installment-alert-body">
          <div className="installment-alert-summary">
            <strong>{title}</strong>
            <span className="installment-alert-total">مجموع {formatNum(total)} تومان</span>
            <button
              type="button"
              className="installment-alert-toggle"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? 'بستن' : 'جزئیات'}
              <ChevronDown size={14} className={expanded ? 'is-open' : ''} />
            </button>
          </div>
          {expanded && (
            <ul className="installment-alert-list">
              {items.map((item) => (
                <li key={`${item.loanId}_${item.installmentNumber}`}>
                  <strong>{item.loanTitle}</strong>
                  <span>قسط {formatNum(item.installmentNumber)}، {describe(item)}</span>
                  <strong className="installment-alert-amount">{formatNum(item.totalAmount)} تومان</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      }
      action={
        <button type="button" className={`installment-alert-action is-${type}`} onClick={onAction}>
          <span>{actionLabel}</span>
          <ChevronLeft size={14} />
        </button>
      }
    />
  );
}
