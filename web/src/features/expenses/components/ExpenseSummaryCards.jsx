/**
 * ExpenseSummaryCards.jsx — A project's totals: everything in tomans, the sums per currency as
 * recorded (tomans, dollars, and each other currency it has: utils/currencies.js), and «به دلار»
 * (FlowDollarCard): what its expenses were in dollars at each one's day rate and what that costs
 * today
 */

import React from 'react';
import { Coins, DollarSign, Banknote, Hash } from 'lucide-react';
import { MiniCard } from '../../../shared/ui/index.js';
import { FlowDollarCard } from '../../../shared/flow/FlowCards.jsx';
import { formatAmount } from '../utils/format.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import BudgetProgress from './BudgetProgress.jsx';
import { currencyAdjective, currencyAmounts, currencyLabel, formatCurrencyAmounts } from '../../../utils/currencies.js';

const MASK = '****';

export default function ExpenseSummaryCards({ summary, budget = null, hideValues = false, dollarView = null }) {
  const money = (v, currency = 'IRT') => (hideValues ? MASK : formatAmount(v, currency));
  const unpriced = summary.unpriced || {};
  const totalFoot = Object.keys(unpriced).length > 0
    ? <span>{formatCurrencyAmounts(unpriced)} بدون نرخ حساب نشده</span>
    : summary.usesTodayRate
      ? <span>ارزهای بدون نرخ، به نرخ امروز</span>
      : null;
  // The other foreign currencies it has (the dollar's card is always shown)
  const others = currencyAmounts(summary.byCurrency).filter((c) => c.code !== 'IRT' && c.code !== 'USD');

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
          value={money(summary.byCurrency?.USD || 0, 'USD')}
          unit="دلار"
          color="blue"
          className="incomes-summary-card"
        />
        {others.map(({ code, amount }) => (
          <MiniCard
            key={code}
            icon={<Banknote size={14} />}
            title={`هزینه‌های ${currencyAdjective(code)}`}
            value={money(amount, code)}
            unit={currencyLabel(code)}
            color="blue"
            className="incomes-summary-card"
          />
        ))}
        {/* Next to «تعداد هزینه‌ها» on a phone (two per row) */}
        <FlowDollarCard kind="expense" view={dollarView} hideValues={hideValues} wide={false} />
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
