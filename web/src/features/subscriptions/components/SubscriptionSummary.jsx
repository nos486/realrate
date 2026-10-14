/**
 * SubscriptionSummary.jsx — The subscriptions' headline figures: the monthly total (foreign ones in
 * tomans at today's rate, their part in each currency below), this month's renewals, a year of it,
 * and the nearest renewal (utils/subscriptionDocument.js subscriptionTotals)
 */

import { intlLocale, t } from '../../../utils/i18n.js';
import React from 'react';
import { CalendarSync, CalendarClock, Receipt, Repeat } from 'lucide-react';
import { MiniCard } from '../../../shared/ui/index.js';
import { daysLabel, formatSubscriptionAmount, shamsiDay } from '../constants/subscriptionDisplay.js';
import { currencyAmounts, currencyLabel, currencyRateToday, formatCurrencyAmounts } from '../../../utils/currencies.js';

const fa = (n) => Number(n).toLocaleString(intlLocale());
const toman = (v) => Math.round(v).toLocaleString(intlLocale());

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
      {t('{amount} از آن ارزی', { amount: hideValues ? '****' : formatCurrencyAmounts(foreign) })}
      {missing.length > 0 ? ` ${t('(نرخ {currencies} در دسترس نیست)', { currencies: missing.map(currencyLabel).join(` ${t('و')} `) })}` : ''}
    </span>
  );
  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<CalendarSync size={14} />}
        title={t('جمع ماهانه')}
        value={money(totals.monthly.toman)}
        unit={t('تومان')}
        color="gold"
        className="incomes-summary-card is-primary"
        footer={foreignPart || <span>{t('{n} اشتراک فعال', { n: fa(totals.count) })}</span>}
      />
      <MiniCard
        icon={<Receipt size={14} />}
        title={t('تمدیدهای {month}', { month: monthLabel })}
        value={money(totals.month.toman)}
        unit={t('تومان')}
        className="incomes-summary-card"
        footer={<span>{t('{n} تمدید در این ماه', { n: fa(totals.month.count) })}</span>}
      />
      <MiniCard
        icon={<Repeat size={14} />}
        title={t('هزینه‌ی سالانه')}
        value={money(totals.yearly.toman)}
        unit={t('تومان')}
        className="incomes-summary-card"
        footer={<span>{t('{n} اشتراک فعال، ارزها با نرخ امروز', { n: fa(totals.count) })}</span>}
      />
      <MiniCard
        icon={<CalendarClock size={14} />}
        title={t('نزدیک‌ترین تمدید')}
        value={nearest ? shamsiDay(nearest.view.nextRenewal) : '—'}
        className="incomes-summary-card"
        footer={nearest ? (
          <span className="incomes-summary-foot-text">
            {nearest.sub.name}{t('،')} {daysLabel(nearest.view.daysLeft)}{t('،')} {hideValues ? '****' : formatSubscriptionAmount(nearest.sub.amount, nearest.sub.currency)}
          </span>
        ) : <span>{t('تمدیدی در پیش نیست')}</span>}
      />
    </div>
  );
}
