/**
 * LoansWidget.jsx — «وام‌ها»: the loans still being paid, nearest installment first, with what is
 * left on each; a row opens the loan. Nothing shows without an unsettled loan.
 */

import { t } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { ChevronLeft, Landmark } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { appPath } from '../../../shared/routes.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { useLoans } from '../../loans/hooks/useLoans.js';
import { isLoanCompleted, loanDueTone, daysBetween } from '../../loans/utils/loanStatus.js';
import { useDashboardData } from '../DashboardContext.js';
import { moneyText } from '../dashboardFormat.js';

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

  if (loadingLoans || rows.length === 0) return null;
  return (
    <section className="app-home-card">
      <header className="app-home-card-head">
        <h2><Landmark size={15} aria-hidden="true" /> {t('وام‌ها')}</h2>
        <button type="button" className="app-home-link" onClick={() => open('loans')}>
          {t('همه')} <ChevronLeft size={16} />
        </button>
      </header>
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
    </section>
  );
}
