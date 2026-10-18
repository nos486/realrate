/**
 * LoansWidget.jsx — «وام‌ها»: the loans still being paid, nearest installment first, with what is
 * left on each; a row opens the loan. Nothing shows without an unsettled loan.
 */

import { t } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { Landmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { appPath } from '../../../shared/routes.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useLoans } from '../../loans/hooks/useLoans.js';
import { isLoanCompleted, loanDueTone, daysBetween } from '../../loans/utils/loanStatus.js';
import { useDashboardData } from '../DashboardContext.js';
import { moneyText } from '../dashboardFormat.js';
import WidgetCard from '../WidgetCard.jsx';
import WidgetState from '../WidgetState.jsx';

const DUE_FAR = '9999-12-31';

export default function LoansWidget({ widget }) {
  const { open } = useDashboardData();
  const navigate = useNavigate();
  const hideValues = usePrivacyMode();
  const { loans, loadingLoans } = useLoans();
  const today = todayIso();
  const count = widget.config?.count || 3;
  const rows = useMemo(
    () => loans
      .filter((loan) => !isLoanCompleted(loan))
      .sort((a, b) => (a.nextDueInstallment?.dueDate || DUE_FAR).localeCompare(b.nextDueInstallment?.dueDate || DUE_FAR))
      .slice(0, count),
    [loans, count],
  );

  if (loadingLoans) return <WidgetCard title={t('وام‌ها')} Icon={Landmark}><WidgetState state="loading" rows={2} /></WidgetCard>;
  if (rows.length === 0) return null;
  return (
    <WidgetCard title={t('وام‌ها')} Icon={Landmark} action={{ onClick: () => open('loans') }}>
      <ul className="app-home-list">
        {rows.map((loan) => {
          const due = loan.nextDueInstallment?.dueDate;
          const days = due ? daysBetween(today, due) : null;
          const tone = loanDueTone(loan, today);
          return (
            <li key={loan.id}>
              <button type="button" className="app-home-row dash-row-button" onClick={() => navigate(appPath(`/loans/${loan.id}`))}>
                <span className="app-home-row-icon"><Landmark size={18} /></span>
                <span className="app-home-row-text">
                  <strong>{loan.title}</strong>
                  <small className={tone ? `dash-tone-${tone}` : ''}>
                    {due
                      ? `${t('قسط بعدی')} ${formatShamsiDisplay(`${due.slice(0, 10)}T00:00:00`)}${days !== null && days < 0 ? ` · ${t('عقب‌افتاده')}` : ''}`
                      : (loan.lenderName || '—')}
                  </small>
                </span>
                <span className="app-home-row-amount">{moneyText(loan.remainingBalance, hideValues)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}
