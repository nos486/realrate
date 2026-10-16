/**
 * GoalCard.jsx — One goal as a row card (shared/ui/RowCard.jsx, the design loans and subscriptions
 * share): the goal and its day, what is saved of the target, a bar of how far it is, and what is
 * left with the pace it needs — or the estimate of when it is reached; its actions (add a deposit,
 * edit, delete). A tap on the row edits it.
 */

import React from 'react';
import { PiggyBank, Pencil, Trash2, Link2 } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { RowCard, RowCardAction, RowCardBadge, RowCardBlock, RowCardProgress } from '../../../shared/ui/index.js';
import { currencyLabel } from '../../../utils/currencies.js';
import { formatGoalAmount, goalDaysLabel, goalIcon, goalNumber, shamsiDay } from '../constants/goalDisplay.js';

/** The state of a goal as its row card shows it (RowCard tones) */
function stateOf(p) {
  if (p.reached) return { label: t('رسیدید'), tone: 'positive', row: 'positive' };
  if (p.overdue) return { label: t('موعد گذشته'), tone: 'negative', row: 'negative' };
  if (p.onTrack === false) return { label: t('عقب‌تر از برنامه'), tone: 'warning', row: 'warning' };
  if (p.onTrack === true) return { label: t('طبق برنامه'), tone: 'positive', row: '' };
  return { label: '', tone: '', row: '' };
}

/**
 * @param {{ goal: object, progress: object, hideValues?: boolean, readOnly?: boolean,
 *   onDeposit: Function, onEdit: Function, onDelete: Function }} props
 *   progress: goalProgress(goal, …)
 */
export default function GoalCard({ goal, progress: p, hideValues, readOnly, onDeposit, onEdit, onDelete }) {
  const state = stateOf(p);
  const money = (v) => (hideValues ? '****' : formatGoalAmount(v, goal.currency));
  const subtitle = [
    goal.targetDate ? t('تا {date}', { date: shamsiDay(goal.targetDate) }) : t('بدون موعد'),
    (goal.allocations || []).length > 0 && t('با دارایی پورتفو'),
  ].filter(Boolean).join(' · ');
  // What helps next: the monthly amount a date asks for, else the pace estimate
  const next = p.unpriced ? t('نرخ {currency} در دسترس نیست', { currency: currencyLabel(goal.currency) })
    : p.reached ? t('به هدف رسیده‌اید')
    : p.monthlyNeeded !== null ? t('ماهی {amount} لازم است', { amount: money(p.monthlyNeeded) })
      : p.eta ? t('با روند فعلی تا {date}', { date: shamsiDay(p.eta) })
        : t('با واریز، تخمین رسیدن می‌آید');
  const when = p.daysLeft !== null && !p.reached ? goalDaysLabel(p.daysLeft) : '';

  return (
    <RowCard
      as="li"
      tone={state.row}
      icon={React.createElement(goalIcon(goal.icon), { size: 18 })}
      iconTone={p.reached ? 'positive' : 'primary'}
      title={goal.name}
      subtitle={subtitle}
      badge={state.label ? <RowCardBadge tone={state.tone}>{state.label}</RowCardBadge> : null}
      hint={goal.notes || ''}
      onClick={readOnly ? undefined : () => onEdit(goal)}
      actions={(
        <>
          <RowCardAction onClick={() => onDeposit(goal)} disabled={readOnly} title={t('واریز')} aria-label={t('واریز')}>
            <PiggyBank size={14} />
          </RowCardAction>
          <RowCardAction onClick={() => onEdit(goal)} disabled={readOnly} title={t('ویرایش هدف')} aria-label={t('ویرایش هدف')}>
            <Pencil size={14} />
          </RowCardAction>
          <RowCardAction danger onClick={() => onDelete(goal)} disabled={readOnly} title={t('حذف هدف')} aria-label={t('حذف هدف')}>
            <Trash2 size={14} />
          </RowCardAction>
        </>
      )}
    >
      <RowCardBlock
        label={t('جمع پس‌انداز')}
        value={money(p.saved)}
        sub={p.allocated > 0 ? <><Link2 size={11} /> {t('{amount} از پورتفو', { amount: money(p.allocated) })}</> : t('از {amount}', { amount: money(p.target) })}
      />
      <RowCardProgress
        label={t('پیشرفت')}
        figure={t('{n}٪', { n: goalNumber(p.pct) })}
        pct={p.pct}
        tone={p.reached ? 'positive' : state.tone || 'primary'}
        ariaLabel={t('{n}٪', { n: goalNumber(p.pct) })}
        sub={p.reached ? '' : t('{amount} مانده', { amount: money(p.remaining) })}
      />
      <RowCardBlock label={when || t('گام بعدی')} value={next} valueTone={p.reached ? 'positive' : 'primary'} />
    </RowCard>
  );
}
