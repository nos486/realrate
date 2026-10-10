/**
 * SubscriptionSummary.jsx — The subscriptions' headline figures: the monthly total (foreign ones in
 * tomans at today's rate, their part in each currency below), this month's renewals, a year of it,
 * and the nearest renewal (utils/subscriptionDocument.js subscriptionTotals)
 */

import React from 'react';
import { CalendarSync, CalendarClock, Receipt, Repeat } from 'lucide-react';
import { MiniCard } from '../../../shared/ui/index.js';
import { daysLabel, formatSubscriptionAmount, shamsiDay } from '../constants/subscriptionDisplay.js';
import { currencyAmounts, currencyLabel, currencyRateToday, formatCurrencyAmounts } from '../../../utils/currencies.js';

const fa = (n) => Number(n).toLocaleString('fa-IR');
const toman = (v) => Math.round(v).toLocaleString('fa-IR');

/**
 * @param {{ totals: object, monthLabel: string, nearest?: { sub: object, view: object }|null,
 *   rates?: object, hideValues?: boolean }} props — rates: today's (utils/currencies.js), to say
 *   which currency has none
 */
export default function SubscriptionSummary({ totals, monthLabel, nearest, rates = {}, hideValues }) {
  const money = (v) => (hideValues ? '****' : toman(v));
  // Its foreign part, in each currency as priced
  const foreign = Object.fromEntries(currencyAmounts(totals.monthly).filter((c) => c.code !== 'IRT').map((c) => [c.code, c.amount]));
  const missing = Object.keys(foreign).filter((code) => !currencyRateToday(code, rates));
  const foreignPart = Object.keys(foreign).length > 0 && (
    <span>
      {hideValues ? '****' : formatCurrencyAmounts(foreign)} از آن ارزی
      {missing.length > 0 ? ` (نرخ ${missing.map(currencyLabel).join(' و ')} در دسترس نیست)` : ''}
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
        footer={foreignPart || <span>{fa(totals.count)} اشتراک فعال</span>}
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
        footer={<span>{fa(totals.count)} اشتراک فعال، ارزها با نرخ امروز</span>}
      />
      <MiniCard
        icon={<CalendarClock size={14} />}
        title="نزدیک‌ترین تمدید"
        value={nearest ? shamsiDay(nearest.view.nextRenewal) : '—'}
        className="incomes-summary-card"
        footer={nearest ? (
          <span className="incomes-summary-foot-text">
            {nearest.sub.name}، {daysLabel(nearest.view.daysLeft)}، {hideValues ? '****' : formatSubscriptionAmount(nearest.sub.amount, nearest.sub.currency)}
          </span>
        ) : <span>تمدیدی در پیش نیست</span>}
      />
    </div>
  );
}
