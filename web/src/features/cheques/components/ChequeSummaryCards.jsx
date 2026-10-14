/**
 * ChequeSummaryCards.jsx — Headline figures: money to collect, money to pay, bounced cheques
 */

import { t, intlLocale } from '../../../utils/i18n.js';
import React from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, XCircle } from 'lucide-react';
import { MiniCard } from '../../../shared/ui/index.js';
import { formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getDirectionDisplay } from '../constants/chequeDisplay.js';

const faCount = (n) => Number(n).toLocaleString(intlLocale());

export default function ChequeSummaryCards({ summary, hideValues = false }) {
  const money = (v) => (hideValues ? '****' : formatNum(v));
  const { receivable, payable, bounced, next30, nextDue } = summary;

  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<ArrowDownLeft size={14} />}
        title={t('چک‌های دریافتی در جریان')}
        value={money(receivable.total)}
        unit={t('تومان')}
        color="green"
        className="incomes-summary-card"
        footer={<span>{t('{count} چک، ۳۰ روز آینده: {amount}', { count: faCount(receivable.count), amount: money(next30.receivable) })}</span>}
      />
      <MiniCard
        icon={<ArrowUpRight size={14} />}
        title={t('چک‌های صادره در جریان')}
        value={money(payable.total)}
        unit={t('تومان')}
        color="gold"
        className="incomes-summary-card"
        footer={<span>{t('{count} چک، ۳۰ روز آینده: {amount}', { count: faCount(payable.count), amount: money(next30.payable) })}</span>}
      />
      <MiniCard
        icon={<CalendarClock size={14} />}
        title={t('نزدیک‌ترین سررسید')}
        value={nextDue ? formatShamsiDisplay(`${nextDue.dueDate}T00:00:00`) : '—'}
        className="incomes-summary-card"
        footer={nextDue && (
          <span className="incomes-summary-foot-text">
            {t('{direction}، {name}، {amount} تومان', { direction: getDirectionDisplay(nextDue.direction).label, name: nextDue.counterparty, amount: money(nextDue.amount) })}
          </span>
        )}
      />
      {bounced.count > 0 && (
        <MiniCard
          icon={<XCircle size={14} />}
          title={t('چک‌های برگشتی')}
          value={money(bounced.total)}
          unit={t('تومان')}
          color="rose"
          className="incomes-summary-card"
          footer={<span>{t('{count} چک نیازمند پیگیری', { count: faCount(bounced.count) })}</span>}
        />
      )}
    </div>
  );
}
