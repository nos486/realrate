/**
 * ChequeSummaryCards.jsx — Headline figures: money to collect, money to pay, bounced cheques
 */

import React from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, XCircle } from 'lucide-react';
import { MiniCard } from '../../../shared/ui/index.js';
import { formatNum } from '../../portfolio/utils/holdingHelpers.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getDirectionDisplay } from '../constants/chequeDisplay.js';

const faCount = (n) => Number(n).toLocaleString('fa-IR');

export default function ChequeSummaryCards({ summary, hideValues = false }) {
  const money = (v) => (hideValues ? '****' : formatNum(v));
  const { receivable, payable, bounced, next30, nextDue } = summary;

  return (
    <div className="incomes-summary-grid">
      <MiniCard
        icon={<ArrowDownLeft size={14} />}
        title="چک‌های دریافتی در جریان"
        value={money(receivable.total)}
        unit="تومان"
        color="green"
        className="incomes-summary-card"
        footer={<span>{faCount(receivable.count)} چک، ۳۰ روز آینده: {money(next30.receivable)}</span>}
      />
      <MiniCard
        icon={<ArrowUpRight size={14} />}
        title="چک‌های صادره در جریان"
        value={money(payable.total)}
        unit="تومان"
        color="gold"
        className="incomes-summary-card"
        footer={<span>{faCount(payable.count)} چک، ۳۰ روز آینده: {money(next30.payable)}</span>}
      />
      <MiniCard
        icon={<CalendarClock size={14} />}
        title="نزدیک‌ترین سررسید"
        value={nextDue ? formatShamsiDisplay(`${nextDue.dueDate}T00:00:00`) : '—'}
        className="incomes-summary-card"
        footer={nextDue && (
          <span className="incomes-summary-foot-text">
            {getDirectionDisplay(nextDue.direction).label}، {nextDue.counterparty}، {money(nextDue.amount)} تومان
          </span>
        )}
      />
      {bounced.count > 0 && (
        <MiniCard
          icon={<XCircle size={14} />}
          title="چک‌های برگشتی"
          value={money(bounced.total)}
          unit="تومان"
          color="rose"
          className="incomes-summary-card"
          footer={<span>{faCount(bounced.count)} چک نیازمند پیگیری</span>}
        />
      )}
    </div>
  );
}
