/**
 * ExpensesLatestWidget.jsx — «آخرین هزینه‌ها»: the latest expenses of the current month (how many
 * is the widget's `count` option); a row-less month offers to record the first one.
 */

import { t } from '../../../utils/i18n.js';
import React, { useMemo } from 'react';
import { Receipt } from 'lucide-react';
import { useVault } from '../../../shared/vault/useVault.js';
import { usePrivacyMode } from '../../../hooks/usePrivacyMode.js';
import { todayIso } from '../../../shared/utils/dates.js';
import { expenseInToman } from '../../../utils/expenseDocument.js';
import { currentSalaryMonth } from '../../../utils/salaryMonth.js';
import { useSalaryMonths } from '../../../shared/salary/useSalaryMonths.js';
import { formatShamsiDisplay } from '../../portfolio/components/ShamsiDatePicker.jsx';
import { getExpenseCategory } from '../../expenses/constants/expenseCategories.js';
import { useDailyExpenses } from '../../expenses/hooks/useDailyExpenses.js';
import { useFxRates } from '../../market/useFxRates.js';
import { useUsdAt } from '../../market/dailyHistory.js';
import { useDashboardData } from '../DashboardContext.js';
import { moneyText } from '../dashboardFormat.js';
import WidgetCard from '../WidgetCard.jsx';
import WidgetState from '../WidgetState.jsx';

export default function ExpensesLatestWidget({ widget }) {
  const { usdToman, open } = useDashboardData();
  const unlocked = useVault().status === 'unlocked';
  const hideValues = usePrivacyMode();
  const starts = useSalaryMonths().activeStarts;
  const month = useMemo(() => currentSalaryMonth(todayIso(), starts), [starts]);
  const { expenses, loading } = useDailyExpenses(month, { enabled: unlocked, salaryStarts: starts });
  const usdAt = useUsdAt((expenses || []).some((r) => r.currency === 'USD'));
  const fx = useFxRates(expenses || []);
  const rates = useMemo(() => ({ usdToman, usdAt, ...fx }), [usdToman, usdAt, fx]);
  const count = widget.config?.count || 5;
  const latest = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, count),
    [expenses, count],
  );

  if (!unlocked) return null;
  return (
    <WidgetCard title={t('آخرین هزینه‌ها')} Icon={Receipt} action={{ onClick: () => open('expenses') }}>
      {loading ? (
        <WidgetState state="loading" />
      ) : latest.length ? (
        <ul className="app-home-list">
          {latest.map((e) => {
            const cat = getExpenseCategory(e.category);
            const toman = expenseInToman(e, rates);
            return (
              <li key={e.id} className="app-home-row">
                <span className="app-home-row-icon"><cat.Icon size={18} /></span>
                <span className="app-home-row-text">
                  <strong>{e.title || cat.label}</strong>
                  <small>{cat.label} · {formatShamsiDisplay(`${e.date}T00:00:00`)}</small>
                </span>
                <span className="app-home-row-amount">{toman === null ? '—' : moneyText(toman, hideValues)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <WidgetState state="empty" message={t('هنوز هزینه‌ای برای این ماه ثبت نشده؛ اولین را ثبت کنید')} onAction={() => open('add-expense')} />
      )}
    </WidgetCard>
  );
}
