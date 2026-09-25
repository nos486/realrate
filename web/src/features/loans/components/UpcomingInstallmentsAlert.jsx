/**
 * UpcomingInstallmentsAlert.jsx — Active Loan Due Date Reminders
 *
 * Analyzes all user loans to detect:
 * 1. Overdue unpaid installments (due date has passed) -> Red AlertBanner
 * 2. Upcoming unpaid installments (due within the next 7 days) -> Amber AlertBanner
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DueReminderAlert from '../../../shared/ui/DueReminderAlert.jsx';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useLoansContext } from '../context/LoansContext.jsx';
import { appPath } from '../../../shared/routes.js';
import { todayIso } from '../../../shared/utils/dates.js';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

const toReminderItem = (item, when) => ({
  key: `${item.loanId}_${item.installmentNumber}`,
  title: item.loanTitle,
  detail: `قسط ${formatNum(item.installmentNumber)}، سررسید ${formatShamsiDisplay(item.dueDate)}، ${when}`,
  amount: item.totalAmount,
});

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
    const todayStr = todayIso(now);
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
    <div className="due-alerts-stack">
      {!dismissedOverdue && overdueItems.length > 0 && (
        <DueReminderAlert
          type="error"
          title={`${formatNum(overdueItems.length)} قسط معوق`}
          items={overdueItems.map((item) => toReminderItem(item, `${formatNum(item.daysPast)} روز گذشته`))}
          actionLabel="مشاهده و تسویه"
          onAction={() => handleGoToLoan(overdueItems[0].loanId)}
          onClose={() => setDismissedOverdue(true)}
        />
      )}

      {!dismissedUpcoming && upcomingItems.length > 0 && (
        <DueReminderAlert
          type="warning"
          title={`${formatNum(upcomingItems.length)} قسط تا ۷ روز آینده`}
          items={upcomingItems.map((item) =>
            toReminderItem(item, item.daysLeft === 0 ? 'امروز' : `${formatNum(item.daysLeft)} روز دیگر`))}
          actionLabel="مشاهده اقساط"
          onAction={() => handleGoToLoan(upcomingItems[0].loanId)}
          onClose={() => setDismissedUpcoming(true)}
        />
      )}
    </div>
  );
}
