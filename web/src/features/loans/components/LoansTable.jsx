/**
 * LoansTable.jsx — Loans as full-width row cards (shared/ui/RowCard.jsx, the design subscriptions
 * share): the loan and its lender, what is still owed, how many installments are paid, the next
 * one due; a tap opens the loan
 */

import { t, intlLocale } from '../../../utils/i18n.js';
import React from 'react';
import { Landmark, Edit2, Trash2, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { RowCard, RowCardAction, RowCardBadge, RowCardBlock, RowCardProgress } from '../../../shared/ui/index.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getDisplayRatePct } from '../../../utils/loanCalculator.js';
import { isLoanCompleted, loanDueTone } from '../utils/loanStatus.js';
import { todayIso } from '../../../shared/utils/dates.js';

const formatNum = (v) => Number(v || 0).toLocaleString(intlLocale());

export default function LoansTable({
  loans = [],
  onSelectLoan,
  onEditLoan,
  onDeleteLoan,
  hideValues = false,
  readOnly = false,
}) {
  const today = todayIso();
  const money = (v) => (hideValues ? '****' : formatNum(v));
  return (
    <div className="row-card-list">
      {loans.map((loan) => {
        const totalCount = loan.totalCount || loan.installmentCount || 0;
        const paidCount = loan.paidCount || 0;
        const progressPct = totalCount > 0 ? Math.min(100, Math.round((paidCount / totalCount) * 100)) : 0;
        const isCompleted = isLoanCompleted(loan);
        const displayRatePct = getDisplayRatePct(loan);
        const next = loan.nextDueInstallment;
        const dueTone = loanDueTone(loan, today);

        return (
          <RowCard
            key={loan.id}
            tone={dueTone}
            className="is-tinted"
            icon={<Landmark size={18} />}
            iconTone={dueTone || 'warning'}
            title={loan.title}
            subtitle={loan.lenderName || '—'}
            badge={<RowCardBadge tone={displayRatePct === 0 ? 'positive' : 'warning'}>{displayRatePct}{t('٪')}</RowCardBadge>}
            onClick={() => onSelectLoan?.(loan)}
            chevron
            actions={!readOnly && (
              <>
                <RowCardAction onClick={() => onEditLoan?.(loan)} title={t('ویرایش وام')} aria-label={t('ویرایش وام')}>
                  <Edit2 size={14} />
                </RowCardAction>
                <RowCardAction danger onClick={() => onDeleteLoan?.(loan.id)} title={t('حذف وام')} aria-label={t('حذف وام')}>
                  <Trash2 size={14} />
                </RowCardAction>
              </>
            )}
          >
            <RowCardBlock
              label={t('مانده بدهی')}
              value={isCompleted ? t('تسویه شده') : t('{amount} تومان', { amount: money(loan.remainingBalance) })}
              valueTone={isCompleted ? 'positive' : ''}
              sub={t('اصل: {amount} تومان', { amount: money(loan.principalAmount) })}
            />
            <RowCardProgress
              label={t('{paid} از {total} قسط', { paid: paidCount, total: totalCount })}
              figure={`${formatNum(progressPct)}${t('٪')}`}
              pct={progressPct}
              tone={isCompleted ? 'positive' : 'warning'}
              ariaLabel={t('{pct}٪ اقساط پرداخت شده', { pct: formatNum(progressPct) })}
            />
            {isCompleted ? (
              <RowCardBlock
                label={<><CheckCircle2 size={12} /> {t('اقساط')}</>}
                value={t('بدون قسط باقیمانده')}
                valueTone="positive"
              />
            ) : next ? (
              <RowCardBlock
                label={<>{dueTone === 'negative' ? <AlertTriangle size={12} /> : <Clock size={12} />} {t('قسط بعدی: #{n}', { n: next.installmentNumber })}</>}
                value={t('{amount} تومان', { amount: money(next.totalAmount) })}
                valueTone={dueTone || 'primary'}
                sub={formatShamsiDisplay(next.dueDate)}
              />
            ) : (
              <RowCardBlock label={t('قسط بعدی')} value={t('سررسید معوقی نیست')} valueTone="muted" />
            )}
          </RowCard>
        );
      })}
    </div>
  );
}
