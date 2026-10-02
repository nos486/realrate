/**
 * ExpenseSummaryCards.jsx — Totals of the selected section: everything in tomans, and the sums
 * per currency as recorded; for a project, «به دلار»: what its toman expenses were in dollars (at
 * each one's day rate) and what that costs at today's rate
 */

import React from 'react';
import { Coins, DollarSign, Banknote, Hash, TrendingUp } from 'lucide-react';
import { MiniCard } from '../../../shared/ui/index.js';
import { formatAmount } from '../utils/format.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import BudgetProgress from './BudgetProgress.jsx';

const MASK = '****';

export default function ExpenseSummaryCards({ summary, budget = null, hideValues = false, dollarView = null }) {
  const money = (v, currency = 'IRT') => (hideValues ? MASK : formatAmount(v, currency));
  const totalFoot = summary.unpricedUsd > 0
    ? <span>{formatAmount(summary.unpricedUsd, 'USD')} دلار بدون نرخ حساب نشده</span>
    : summary.usesTodayRate
      ? <span>دلارهای بدون نرخ، به نرخ امروز</span>
      : null;

  return (
    <>
      {budget > 0 && (
        <div className="expense-side-card">
          <BudgetProgress label="از بودجه کل" spent={summary.totalToman} budget={budget} hideValues={hideValues} />
        </div>
      )}
      <div className="incomes-summary-grid">
        <MiniCard
          icon={<Coins size={14} />}
          title="جمع کل (تومان)"
          value={money(summary.totalToman)}
          unit="تومان"
          color="rose"
          className="incomes-summary-card is-primary"
          footer={totalFoot}
        />
        <MiniCard
          icon={<Banknote size={14} />}
          title="هزینه‌های تومانی"
          value={money(summary.toman)}
          unit="تومان"
          className="incomes-summary-card"
        />
        <MiniCard
          icon={<DollarSign size={14} />}
          title="هزینه‌های دلاری"
          value={money(summary.usd, 'USD')}
          unit="دلار"
          color="blue"
          className="incomes-summary-card"
        />
        {dollarView && dollarView.counted > 0 && (
          <MiniCard
            icon={<TrendingUp size={14} />}
            title="به دلار (نرخ روز هر هزینه)"
            value={money(dollarView.usd, 'USD')}
            unit="دلار"
            color="blue"
            className="incomes-summary-card is-wide"
            footer={(
              <span className="expense-dollar-foot">
                {dollarView.todayToman !== null && (
                  <>
                    به نرخ امروز <strong>{money(dollarView.todayToman)}</strong> تومان
                    {dollarView.changePct !== null && (
                      <b className={dollarView.changePct >= 0 ? 'is-up' : 'is-down'}>
                        {' '}({dollarView.changePct >= 0 ? '+' : '−'}{Math.abs(dollarView.changePct).toLocaleString('fa-IR', { maximumFractionDigits: 0 })}٪)
                      </b>
                    )}
                  </>
                )}
                {dollarView.missing > 0 && <small> · {dollarView.missing.toLocaleString('fa-IR')} هزینه بدون نرخ دلار حساب نشده</small>}
              </span>
            )}
          />
        )}
        <MiniCard
          icon={<Hash size={14} />}
          title="تعداد هزینه‌ها"
          value={summary.count.toLocaleString('fa-IR')}
          unit="مورد"
          className="incomes-summary-card"
          footer={summary.firstDate && (
            <span>
              {formatShamsiDisplay(`${summary.firstDate}T00:00:00`)}
              {summary.lastDate !== summary.firstDate && ` تا ${formatShamsiDisplay(`${summary.lastDate}T00:00:00`)}`}
            </span>
          )}
        />
      </div>
    </>
  );
}
