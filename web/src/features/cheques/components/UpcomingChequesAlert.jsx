/**
 * UpcomingChequesAlert.jsx — Home-page reminder of cheques that are overdue or due this week
 *
 * Only open cheques count (waiting or being collected); a received one means money to collect,
 * an issued one means the account needs the funds.
 */

import React, { useMemo, useState } from 'react';
import DueReminderAlert from '../../../shared/ui/DueReminderAlert.jsx';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { buildChequeReminders, CHEQUE_REMINDER_DAYS } from '../../../utils/chequeDocument.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { useChequesContext } from '../context/ChequesContext.jsx';
import { getDirectionDisplay, describeDueDays } from '../constants/chequeDisplay.js';

const faNum = (v) => Number(v || 0).toLocaleString('fa-IR');

const toReminderItem = (cheque) => ({
  key: cheque.id,
  title: cheque.counterparty,
  detail: `چک ${getDirectionDisplay(cheque.direction).label}، سررسید ${formatShamsiDisplay(`${cheque.dueDate}T00:00:00`)}، ${describeDueDays(cheque.days)}`,
  amount: cheque.amount,
});

export default function UpcomingChequesAlert({ onOpen }) {
  const { cheques } = useChequesContext();
  const hideValues = usePrivacyMode();
  const [dismissed, setDismissed] = useState({ overdue: false, upcoming: false });
  const { overdue, upcoming } = useMemo(() => buildChequeReminders(cheques, todayIso()), [cheques]);

  const showOverdue = !dismissed.overdue && overdue.length > 0;
  const showUpcoming = !dismissed.upcoming && upcoming.length > 0;
  if (!showOverdue && !showUpcoming) return null;

  return (
    <div className="due-alerts-stack">
      {showOverdue && (
        <DueReminderAlert
          type="error"
          title={`${faNum(overdue.length)} چک سررسیدگذشته`}
          items={overdue.map(toReminderItem)}
          actionLabel="پیگیری چک‌ها"
          onAction={onOpen}
          onClose={() => setDismissed((d) => ({ ...d, overdue: true }))}
          hideValues={hideValues}
        />
      )}
      {showUpcoming && (
        <DueReminderAlert
          type="warning"
          title={`${faNum(upcoming.length)} چک تا ${faNum(CHEQUE_REMINDER_DAYS)} روز آینده`}
          items={upcoming.map(toReminderItem)}
          actionLabel="مشاهده چک‌ها"
          onAction={onOpen}
          onClose={() => setDismissed((d) => ({ ...d, upcoming: true }))}
          hideValues={hideValues}
        />
      )}
    </div>
  );
}
