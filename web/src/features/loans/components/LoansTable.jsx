/**
 * LoansTable.jsx — Loans as full-width row cards (shared/ui/RowCard.jsx, the design subscriptions
 * share): the loan and its lender, what is still owed, how many installments are paid, the next
 * one due; a tap opens the loan
 */

import React from 'react';
import { Landmark, Edit2, Trash2, CheckCircle2, Clock } from 'lucide-react';
import { RowCard, RowCardAction, RowCardBadge, RowCardBlock, RowCardProgress } from '../../../shared/ui/index.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getDisplayRatePct } from '../../../utils/loanCalculator.js';

const formatNum = (v) => Number(v || 0).toLocaleString('fa-IR');

export default function LoansTable({
  loans = [],
  onSelectLoan,
  onEditLoan,
  onDeleteLoan,
  hideValues = false,
  readOnly = false,
}) {
  const money = (v) => (hideValues ? '****' : formatNum(v));
  return (
    <div className="row-card-list">
      {loans.map((loan) => {
        const totalCount = loan.totalCount || loan.installmentCount || 0;
        const paidCount = loan.paidCount || 0;
        const progressPct = totalCount > 0 ? Math.min(100, Math.round((paidCount / totalCount) * 100)) : 0;
        const isCompleted = loan.remainingBalance === 0 || (totalCount > 0 && paidCount >= totalCount);
        const displayRatePct = getDisplayRatePct(loan);
        const next = loan.nextDueInstallment;

        return (
          <RowCard
            key={loan.id}
            tone={isCompleted ? 'positive' : ''}
            icon={<Landmark size={18} />}
            iconTone={isCompleted ? 'positive' : 'warning'}
            title={loan.title}
            subtitle={loan.lenderName || '—'}
            badge={<RowCardBadge tone={displayRatePct === 0 ? 'positive' : 'warning'}>{displayRatePct}٪</RowCardBadge>}
            onClick={() => onSelectLoan?.(loan)}
            chevron
            actions={!readOnly && (
              <>
                <RowCardAction onClick={() => onEditLoan?.(loan)} title="ویرایش وام" aria-label="ویرایش وام">
                  <Edit2 size={14} />
                </RowCardAction>
                <RowCardAction danger onClick={() => onDeleteLoan?.(loan.id)} title="حذف وام" aria-label="حذف وام">
                  <Trash2 size={14} />
                </RowCardAction>
              </>
            )}
          >
            <RowCardBlock
              label="مانده بدهی"
              value={isCompleted ? 'تسویه شده' : `${money(loan.remainingBalance)} تومان`}
              valueTone={isCompleted ? 'positive' : 'warning'}
              sub={`اصل: ${money(loan.principalAmount)} تومان`}
            />
            <RowCardProgress
              label={`${paidCount} از ${totalCount} قسط`}
              figure={`${formatNum(progressPct)}٪`}
              pct={progressPct}
              tone={isCompleted ? 'positive' : 'warning'}
              ariaLabel={`${formatNum(progressPct)}٪ اقساط پرداخت شده`}
            />
            {isCompleted ? (
              <RowCardBlock
                label={<><CheckCircle2 size={12} /> اقساط</>}
                value="بدون قسط باقیمانده"
                valueTone="positive"
              />
            ) : next ? (
              <RowCardBlock
                label={<><Clock size={12} /> قسط بعدی: #{next.installmentNumber}</>}
                value={`${money(next.totalAmount)} تومان`}
                valueTone="primary"
                sub={formatShamsiDisplay(next.dueDate)}
              />
            ) : (
              <RowCardBlock label="قسط بعدی" value="سررسید معوقی نیست" valueTone="muted" />
            )}
          </RowCard>
        );
      })}
    </div>
  );
}
