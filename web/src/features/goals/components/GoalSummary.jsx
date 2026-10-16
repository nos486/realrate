/**
 * GoalSummary.jsx — The goals' headline figures: what is saved against all the targets, how many
 * goals are reached, and the nearest one that has a day (utils/goalDocument.js goalTotals)
 */

import React from 'react';
import { Target, PiggyBank, CalendarClock } from 'lucide-react';
import { t } from '../../../utils/i18n.js';
import { MiniCard } from '../../../shared/ui/index.js';
import { formatGoalAmount, goalDaysLabel, goalNumber, shamsiDay } from '../constants/goalDisplay.js';

/**
 * @param {{ totals: object, nearest?: { goal: object, progress: object }|null, hideValues?: boolean }} props
 */
export default function GoalSummary({ totals, nearest, hideValues }) {
  const money = (v) => (hideValues ? '****' : formatGoalAmount(v));
  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<PiggyBank size={14} />}
        title={t('پس‌انداز برای اهداف')}
        value={hideValues ? '****' : goalNumber(totals.saved)}
        unit={t('تومان')}
        color="gold"
        className="incomes-summary-card is-primary"
        footer={<span>{t('از {amount}', { amount: money(totals.target) })}</span>}
      />
      <MiniCard
        icon={<Target size={14} />}
        title={t('پیشرفت کل')}
        value={t('{n}٪', { n: goalNumber(totals.pct) })}
        className="incomes-summary-card"
        footer={<span>{t('{reached} از {count} هدف انجام شده', { reached: goalNumber(totals.reached), count: goalNumber(totals.count) })}</span>}
      />
      <MiniCard
        icon={<CalendarClock size={14} />}
        title={t('نزدیک‌ترین موعد')}
        value={nearest ? shamsiDay(nearest.goal.targetDate) : '—'}
        className="incomes-summary-card"
        footer={nearest ? <span className="incomes-summary-foot-text">{nearest.goal.name}{t('،')} {goalDaysLabel(nearest.progress.daysLeft)}</span> : <span>{t('هدفی با موعد نیست')}</span>}
      />
    </div>
  );
}
