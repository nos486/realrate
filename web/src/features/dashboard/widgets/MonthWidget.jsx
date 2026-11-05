/**
 * MonthWidget.jsx — «خلاصه‌ی ماه»: the month's spending (against the same days of last month) and
 * income, with the categories left out of the totals listed apart under the spending; ‹ › browse earlier months (the widget opens on the current one again).
 * Decrypted in the browser; nothing shows while the vault is locked.
 */

import { t } from '../../../utils/i18n.js';
import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useVault } from '../../../shared/vault/useVault.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { useFeature } from '../../../shared/features/useFeature.js';
import { todayIso } from '../../../shared/utils/dates.js';
import Skeleton from '../../../shared/ui/Skeleton.jsx';
import { summarizeExpenses, shiftShamsiMonth } from '../../../utils/expenseDocument.js';
import { salaryMonthRange, currentSalaryMonth } from '../../../utils/salaryMonth.js';
import { useSalaryMonths } from '../../../shared/salary/useSalaryMonths.js';
import { getCategory, splitCounted } from '../../../shared/categories/categoryStore.js';
import { useCategories } from '../../../shared/categories/useCategories.js';
import { recordOwnerOf } from '../../../utils/recordOwners.js';
import { buildIncomeReport, formatShamsiMonth } from '../../incomes/utils/incomeReport.js';
import { useDailyExpenses } from '../../expenses/hooks/useDailyExpenses.js';
import { useFxRates } from '../../market/useFxRates.js';
import { useUsdAt } from '../../market/dailyHistory.js';
import { useDashboardData } from '../DashboardContext.js';
import { useMonthIncomes } from '../useMonthIncomes.js';
import { moneyText } from '../dashboardFormat.js';

const DAY_MS = 86_400_000;

export default function MonthWidget({ widget }) {
  const compact = widget.config?.style === 'compact';
  const showComparison = widget.config?.comparison !== false;
  const showBreakdown = widget.config?.breakdown !== false;
  const showStats = widget.config?.stats !== false;
  const { usdToman, open } = useDashboardData();
  const expenseCategories = useCategories('expense', { includeHidden: true });
  const incomeCategories = useCategories('income', { includeHidden: true });
  const exclusionKey = [...expenseCategories, ...incomeCategories].filter((c) => c.excluded).map((c) => c.value).join(',');
  const vault = useVault();
  const hideValues = usePrivacyMode();
  const hasExpenses = useFeature('expenses');
  const unlocked = vault.status === 'unlocked';
  const today = todayIso();
  const starts = useSalaryMonths().activeStarts;
  const currentMonth = useMemo(() => currentSalaryMonth(today, starts), [today, starts]);
  // ‹ › browse other months; the widget opens on the current one again (this state starts over)
  const [picked, setPicked] = useState({ for: null, month: null });
  const month = picked.for === starts ? picked.month : currentMonth;
  const isCurrentMonth = month.jy === currentMonth.jy && month.jm === currentMonth.jm;
  const canGoNext = month.jy < currentMonth.jy || (month.jy === currentMonth.jy && month.jm < currentMonth.jm);
  const range = useMemo(() => salaryMonthRange(month.jy, month.jm, starts), [month, starts]);

  const { expenses, previousExpenses, loading: expensesLoading } = useDailyExpenses(month, { enabled: hasExpenses && unlocked, salaryStarts: starts });
  const monthIncomes = useMonthIncomes(range, unlocked);
  const split = useMemo(() => splitCounted('expense', expenses), [expenses, exclusionKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const counted = useMemo(
    () => ({ expenses: split.counted, previous: splitCounted('expense', previousExpenses).counted }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [split, previousExpenses, exclusionKey],
  );
  // The rates of the currencies the month's records are in: today's, and on each one's day
  const monthRecords = useMemo(() => [...(expenses || []), ...(previousExpenses || []), ...(monthIncomes.incomes || [])], [expenses, previousExpenses, monthIncomes.incomes]);
  const usdAt = useUsdAt(monthRecords.some((r) => r.currency === 'USD'));
  const fx = useFxRates(monthRecords);
  const dollarRates = useMemo(() => ({ usdToman, usdAt, ...fx }), [usdToman, usdAt, fx]);
  // Income and spending only: «سرمایه‌گذاری», «فروش دارایی» and the like are left out
  const incomeTotal = useMemo(
    () => buildIncomeReport(splitCounted('income', monthIncomes.incomes).counted, dollarRates).total,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthIncomes, exclusionKey, dollarRates],
  );
  const spent = useMemo(() => summarizeExpenses(counted.expenses, dollarRates).totalToman, [counted, dollarRates]);
  // What the loans' installments cost this month, shown apart from the rest of the spending
  const loanSpent = useMemo(
    () => summarizeExpenses(counted.expenses.filter((e) => recordOwnerOf(e) === 'loan'), dollarRates).totalToman,
    [counted, dollarRates],
  );
  // What each category left out of the totals («سرمایه‌گذاری», …) came to this month, biggest first
  const leftOut = useMemo(() => {
    const byCategory = new Map();
    for (const e of split.excluded) {
      const key = e.category || 'other';
      byCategory.set(key, [...(byCategory.get(key) || []), e]);
    }
    return [...byCategory].map(([value, list]) => {
      const category = getCategory('expense', value);
      return { value, label: category.label, color: category.color, total: summarizeExpenses(list, dollarRates).totalToman };
    }).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  }, [split, dollarRates]);
  // The current month against the same number of days of last month; a past month against the
  // whole month before it
  const change = useMemo(() => {
    let previous = counted.previous;
    if (isCurrentMonth) {
      const days = Math.round((Date.parse(today) - Date.parse(range.from)) / DAY_MS);
      const prev = shiftShamsiMonth(month, -1);
      const cutoff = new Date(Date.parse(salaryMonthRange(prev.jy, prev.jm, starts).from) + days * DAY_MS).toISOString().slice(0, 10);
      previous = previous.filter((e) => e.date <= cutoff);
    }
    const before = summarizeExpenses(previous, dollarRates).totalToman;
    return before > 0 ? ((spent - before) / before) * 100 : null;
  }, [counted, spent, dollarRates, today, range.from, month, isCurrentMonth, starts]);

  if (!unlocked) return null;
  const loading = (hasExpenses && expensesLoading) || monthIncomes.loading;
  const money = (v) => moneyText(v, hideValues);

  return (
    <section className={`app-home-hero dash-month${compact ? ' is-compact' : ''}`} aria-label={t('خلاصه‌ی {month}', { month: formatShamsiMonth(month.jy, month.jm) })}>
      <div className="app-home-hero-top">
        <span className="app-home-month-nav">
          <button type="button" className="app-home-month-btn" onClick={() => setPicked({ for: starts, month: shiftShamsiMonth(month, -1) })} aria-label={t('ماه قبل')}>
            <ChevronRight size={16} />
          </button>
          <span className="app-home-month">{formatShamsiMonth(month.jy, month.jm)}</span>
          <button type="button" className="app-home-month-btn" onClick={() => setPicked({ for: starts, month: shiftShamsiMonth(month, 1) })} disabled={!canGoNext} aria-label={t('ماه بعد')}>
            <ChevronLeft size={16} />
          </button>
        </span>
        {showComparison && change !== null && !loading && (
          <span className={`app-home-change ${change > 0 ? 'is-up' : 'is-down'}`}>
            {change > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {change > 0 ? t('{n}٪ بیشتر از ماه قبل', { n: moneyText(Math.abs(change)) }) : t('{n}٪ کمتر از ماه قبل', { n: moneyText(Math.abs(change)) })}
          </span>
        )}
      </div>
      <div className="app-home-hero-label">{isCurrentMonth ? t('خرج این ماه') : t('خرج ماه')}</div>
      <div className="app-home-hero-value">
        {loading ? <Skeleton width="60%" height={36} radius={10} /> : <>{money(spent)} <small>{t('تومان')}</small></>}
      </div>
      {showBreakdown && !loading && loanSpent > 0 && (
        <div className="app-home-hero-breakdown">
          <span><small>{t('بدون اقساط وام')}</small> <strong>{money(spent - loanSpent)}</strong></span>
          <span><small>{t('اقساط وام')}</small> <strong>{money(loanSpent)}</strong></span>
        </div>
      )}
      {showBreakdown && !loading && leftOut.length > 0 && (
        <ul className="app-home-hero-leftout" aria-label={t('خارج از جمع خرج')}>
          {leftOut.map((c) => (
            <li key={c.value}>
              <span className="app-home-leftout-dot" style={{ background: c.color }} aria-hidden="true" />
              <small>{t(c.label)}</small>
              <strong>{money(c.total)}</strong>
            </li>
          ))}
        </ul>
      )}
      {showStats && <div className="app-home-hero-split">
        <button type="button" className="app-home-stat" onClick={() => open('incomes')}>
          <span className="app-home-stat-icon is-in"><ArrowDownLeft size={16} /></span>
          <span className="app-home-stat-text">
            <small>{t('درآمد')}</small>
            <strong>{loading ? '…' : money(incomeTotal)}</strong>
          </span>
        </button>
      </div>}
    </section>
  );
}
