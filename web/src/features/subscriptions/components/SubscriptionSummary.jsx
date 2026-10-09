/**
 * SubscriptionSummary.jsx — The subscriptions' headline figures: the monthly total (dollar ones in
 * tomans at today's rate, their dollar part below), this month's renewals, a year of it, and the
 * nearest renewal (utils/subscriptionDocument.js subscriptionTotals)
 */

import React from 'react';
import { CalendarSync, CalendarClock, Receipt, Repeat } from 'lucide-react';
import { MiniCard } from '../../../shared/ui/index.js';
import { daysLabel, formatSubscriptionAmount, shamsiDay } from '../constants/subscriptionDisplay.js';

const fa = (n) => Number(n).toLocaleString('fa-IR');
const toman = (v) => Math.round(v).toLocaleString('fa-IR');

/**
 * @param {{ totals: object, monthLabel: string, nearest?: { sub: object, view: object }|null,
 *   usdMissing?: boolean, hideValues?: boolean }} props
 */
export default function SubscriptionSummary({ totals, monthLabel, nearest, usdMissing, hideValues }) {
  const money = (v) => (hideValues ? '****' : toman(v));
  const usdPart = totals.monthly.USD > 0 && (
    <span>
      {hideValues ? '****' : formatSubscriptionAmount(totals.monthly.USD, 'USD')} از آن دلاری
      {usdMissing ? ' (نرخ دلار در دسترس نیست)' : ''}
    </span>
  );
  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<CalendarSync size={14} />}
        title="جمع ماهانه"
        value={money(totals.monthly.toman)}
        unit="تومان"
        color="gold"
        className="incomes-summary-card is-primary"
        footer={usdPart || <span>{fa(totals.count)} اشتراک فعال</span>}
      />
      <MiniCard
        icon={<Receipt size={14} />}
        title={`تمدیدهای ${monthLabel}`}
        value={money(totals.month.toman)}
        unit="تومان"
        className="incomes-summary-card"
        footer={<span>{fa(totals.month.count)} تمدید در این ماه</span>}
      />
      <MiniCard
        icon={<Repeat size={14} />}
        title="هزینه‌ی سالانه"
        value={money(totals.yearly.toman)}
        unit="تومان"
        className="incomes-summary-card"
        footer={<span>{fa(totals.count)} اشتراک فعال، با نرخ امروز دلار</span>}
      />
      {nearest && (
        <MiniCard
          icon={<CalendarClock size={14} />}
          title="نزدیک‌ترین تمدید"
          value={shamsiDay(nearest.view.nextRenewal)}
          className="incomes-summary-card"
          footer={(
            <span className="incomes-summary-foot-text">
              {nearest.sub.name}، {daysLabel(nearest.view.daysLeft)}، {hideValues ? '****' : formatSubscriptionAmount(nearest.sub.amount, nearest.sub.currency)}
            </span>
          )}
        />
      )}
    </div>
  );
}
