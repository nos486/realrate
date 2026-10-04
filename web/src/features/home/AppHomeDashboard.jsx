/**
 * AppHomeDashboard.jsx — The Android app's home: the user's own month at a glance
 *
 *  - at the top, a small card of today's rates (dollar, 18k gold, coin) that opens the market
 *    page — only for users with the market page (feature `market`, the "pro" group); shown even
 *    while the records are locked
 *  - this month's spending (vs the same days of last month) and income, and what is left; ‹ ›
 *    browse earlier months (the home opens on the current one again)
 *  - bank messages waiting to be recorded
 *  - the latest expenses
 * Installment and cheque reminders are shown above it by MainPage, as on the website's home.
 * Everything is decrypted in the browser; nothing shows while the vault is locked (the card to
 * unlock it does).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useUsdAt } from '../market/dailyHistory.js';
import {
  ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, MessageSquareText, TrendingUp, TrendingDown, Plus,
} from 'lucide-react';
import { useVault } from '../../shared/vault/useVault.js';
import { usePricing } from '../market/index.js';
import VaultUnlockCard from '../../shared/vault/VaultUnlockCard.jsx';
import { usePrivacyMode } from '../../hooks/usePrivacyMode.js';
import { useFeature } from '../../shared/features/useFeature.js';
import { todayIso } from '../../shared/utils/dates.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import { getPendingSms, SMS_INBOX_EVENT } from '../../shared/native/smsInbox.js';
import { getIncomes } from '../../shared/vault/vaultIncomes.js';
import { summarizeExpenses, shamsiMonthOf, shamsiMonthRange, shiftShamsiMonth, expenseInToman } from '../../utils/expenseDocument.js';
import { useDailyExpenses } from '../expenses/hooks/useDailyExpenses.js';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { useCategories } from '../../shared/categories/useCategories.js';
import { splitCounted } from '../../shared/categories/categoryStore.js';
import { formatShamsiMonth, buildIncomeReport } from '../incomes/utils/incomeReport.js';
import { formatShamsiDisplay } from '../portfolio/components/ShamsiDatePicker.jsx';

const MASK = '••••••';
const fa = (n) => Math.round(Number(n) || 0).toLocaleString('fa-IR');
const DAY_MS = 86_400_000;

/** This month's incomes (decrypted), reloaded when the vault changes */
function useMonthIncomes(range, enabled) {
  const { epoch } = useVault();
  const [state, setState] = useState({ incomes: [], loading: true });
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    getIncomes({ from: range.from, to: range.to })
      .then((res) => !cancelled && setState({ incomes: Array.isArray(res?.incomes) ? res.incomes : [], loading: false }))
      .catch(() => !cancelled && setState({ incomes: [], loading: false }));
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, enabled, epoch]);
  return state;
}

function usePendingSms() {
  const [list, setList] = useState(() => getPendingSms());
  useEffect(() => {
    const update = () => setList(getPendingSms());
    window.addEventListener(SMS_INBOX_EVENT, update);
    return () => window.removeEventListener(SMS_INBOX_EVENT, update);
  }, []);
  return list;
}

export default function AppHomeDashboard({ usdToman = 0, analysis = [], onOpen }) {
  // The user's category names, and which ones are left out of the totals
  const expenseCategories = useCategories('expense', { includeHidden: true });
  const incomeCategories = useCategories('income', { includeHidden: true });
  const exclusionKey = [...expenseCategories, ...incomeCategories].filter((c) => c.excluded).map((c) => c.value).join(',');
  const vault = useVault();
  const hideValues = usePrivacyMode();
  const hasExpenses = useFeature('expenses');
  const hasMarket = useFeature('market');
  const unlocked = vault.status === 'unlocked';
  const today = todayIso();
  const currentMonth = useMemo(() => shamsiMonthOf(today), [today]);
  // ‹ › browse other months; the home opens on the current one again (this state starts over)
  const [month, setMonth] = useState(currentMonth);
  const isCurrentMonth = month.jy === currentMonth.jy && month.jm === currentMonth.jm;
  const canGoNext = month.jy < currentMonth.jy || (month.jy === currentMonth.jy && month.jm < currentMonth.jm);
  const range = useMemo(() => shamsiMonthRange(month.jy, month.jm), [month]);

  const { expenses, previousExpenses, loading: expensesLoading } = useDailyExpenses(month, { enabled: hasExpenses && unlocked });
  const monthIncomes = useMonthIncomes(range, unlocked);
  // Income and spending only: «مدیریت نقدینگی», «سرمایه‌گذاری» and the like are left out
  const incomes = useMemo(
    () => ({ loading: monthIncomes.loading, total: buildIncomeReport(splitCounted('income', monthIncomes.incomes).counted).total }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthIncomes, exclusionKey],
  );
  const counted = useMemo(
    () => ({ expenses: splitCounted('expense', expenses).counted, previous: splitCounted('expense', previousExpenses).counted }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, previousExpenses, exclusionKey],
  );
  const pendingSms = usePendingSms();
  // The dollar's rate on each expense's day (a dollar expense without its own), from the price history
  const usdAt = useUsdAt([...(expenses || []), ...(previousExpenses || [])].some((e) => e.currency === 'USD' && !e.usdRate));
  const dollarRates = useMemo(() => ({ usdToman, usdAt }), [usdToman, usdAt]);

  const spent = useMemo(() => summarizeExpenses(counted.expenses, dollarRates).totalToman, [counted, dollarRates]);
  // The current month against the same number of days of last month; a past month against the
  // whole month before it
  const change = useMemo(() => {
    let previous = counted.previous;
    if (isCurrentMonth) {
      const days = Math.round((Date.parse(today) - Date.parse(range.from)) / DAY_MS);
      const prev = shiftShamsiMonth(month, -1);
      const cutoff = new Date(Date.parse(shamsiMonthRange(prev.jy, prev.jm).from) + days * DAY_MS).toISOString().slice(0, 10);
      previous = previous.filter((e) => e.date <= cutoff);
    }
    const before = summarizeExpenses(previous, dollarRates).totalToman;
    return before > 0 ? ((spent - before) / before) * 100 : null;
  }, [counted, spent, dollarRates, today, range.from, month, isCurrentMonth]);
  const latest = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 5),
    [expenses],
  );

  const money = (v) => (hideValues ? MASK : fa(v));
  const price = (id) => {
    const item = analysis?.find((i) => i.id === id);
    return item?.market || item?.intrinsic || 0;
  };
  // Today's change of each rate: against the day's first price (the book's params.dayOpen)
  const pricing = usePricing();
  const dayChange = (id, value) => {
    const open = Number(pricing?.priceBook?.items?.[id]?.params?.dayOpen);
    return open > 0 && value > 0 ? ((value - open) / open) * 100 : null;
  };
  const rates = [
    { key: 'usd', label: 'دلار', value: usdToman, change: dayChange('usd', usdToman) },
    { key: 'gold', label: 'طلای ۱۸', value: price('gold_18k'), change: dayChange('gold_18k', price('gold_18k')) },
    { key: 'coin', label: 'سکه امامی', value: price('full_coin'), change: dayChange('full_coin', price('full_coin')) },
  ].filter((r) => hasMarket && r.value > 0);

  // Today's rates: at the top of the home, open even while the records are locked (they aren't
  // encrypted)
  const ratesCard = rates.length > 0 && (
    <button type="button" className="app-home-card app-home-rates" onClick={() => onOpen?.('rates')} aria-label="نرخ‌های امروز — رفتن به بازار">
      <span className="app-home-rates-head">
        <span>نرخ‌های امروز <small>تومان</small></span>
        <ChevronLeft size={16} aria-hidden="true" />
      </span>
      <span className="app-home-rates-grid">
        {rates.map((r) => (
          <span key={r.key} className="app-home-rate">
            <small>{r.label}</small>
            <strong>{fa(r.value)}</strong>
            {r.change !== null && Math.abs(r.change) >= 0.05 && (
              <em className={r.change > 0 ? 'is-up' : 'is-down'}>
                {r.change > 0 ? '▲' : '▼'} {Math.abs(r.change).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪
              </em>
            )}
          </span>
        ))}
      </span>
    </button>
  );

  if (vault.status === 'locked') {
    return (
      <div className="app-home">
        {ratesCard}
        <VaultUnlockCard title="برای دیدن خلاصه‌ی ماه، اطلاعات را باز کنید" />
      </div>
    );
  }

  const loading = (hasExpenses && expensesLoading) || incomes.loading;
  const left = incomes.total - spent;

  return (
    <div className="app-home">
      {ratesCard}

      {/* This month */}
      <section className="app-home-hero" aria-label={`خلاصه‌ی ${formatShamsiMonth(month.jy, month.jm)}`}>
        <div className="app-home-hero-top">
          <span className="app-home-month-nav">
            <button type="button" className="app-home-month-btn" onClick={() => setMonth(shiftShamsiMonth(month, -1))} aria-label="ماه قبل">
              <ChevronRight size={16} />
            </button>
            <span className="app-home-month">{formatShamsiMonth(month.jy, month.jm)}</span>
            <button type="button" className="app-home-month-btn" onClick={() => setMonth(shiftShamsiMonth(month, 1))} disabled={!canGoNext} aria-label="ماه بعد">
              <ChevronLeft size={16} />
            </button>
          </span>
          {change !== null && !loading && (
            <span className={`app-home-change ${change > 0 ? 'is-up' : 'is-down'}`}>
              {change > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {fa(Math.abs(change))}٪ {change > 0 ? 'بیشتر' : 'کمتر'} از ماه قبل
            </span>
          )}
        </div>
        <div className="app-home-hero-label">{isCurrentMonth ? 'خرج این ماه' : 'خرج ماه'}</div>
        <div className="app-home-hero-value">
          {loading ? <Skeleton width="60%" height={36} radius={10} /> : <>{money(spent)} <small>تومان</small></>}
        </div>
        <div className="app-home-hero-split">
          <button type="button" className="app-home-stat" onClick={() => onOpen?.('incomes')}>
            <span className="app-home-stat-icon is-in"><ArrowDownLeft size={16} /></span>
            <span className="app-home-stat-text">
              <small>درآمد</small>
              <strong>{loading ? '…' : money(incomes.total)}</strong>
            </span>
          </button>
          <button type="button" className="app-home-stat" onClick={() => onOpen?.('expenses')}>
            <span className="app-home-stat-icon is-left"><ArrowUpRight size={16} /></span>
            <span className="app-home-stat-text">
              <small>{left >= 0 ? 'باقی‌مانده' : 'کسری'}</small>
              <strong className={left < 0 ? 'is-negative' : ''}>{loading ? '…' : money(Math.abs(left))}</strong>
            </span>
          </button>
        </div>
      </section>

      {/* Bank messages waiting */}
      {pendingSms.length > 0 && (
        <button type="button" className="app-home-card app-home-sms" onClick={() => onOpen?.('sms')}>
          <span className="app-home-sms-icon"><MessageSquareText size={20} /></span>
          <span className="app-home-sms-text">
            <strong>{fa(pendingSms.length)} پیامک بانکی منتظر ثبت</strong>
            <small>با یک ضربه دسته را انتخاب کنید</small>
          </span>
          <ChevronLeft size={18} />
        </button>
      )}

      {/* Latest expenses */}
      {hasExpenses && (
        <section className="app-home-card">
          <header className="app-home-card-head">
            <h2>آخرین هزینه‌ها</h2>
            <button type="button" className="app-home-link" onClick={() => onOpen?.('expenses')}>
              همه <ChevronLeft size={16} />
            </button>
          </header>
          {loading ? (
            <div className="app-home-list">
              {[0, 1, 2].map((i) => <Skeleton key={i} height={44} radius={12} />)}
            </div>
          ) : latest.length ? (
            <ul className="app-home-list">
              {latest.map((e) => {
                const cat = getExpenseCategory(e.category);
                const toman = expenseInToman(e, usdToman, usdAt);
                return (
                  <li key={e.id} className="app-home-row">
                    <span className="app-home-row-icon"><cat.Icon size={18} /></span>
                    <span className="app-home-row-text">
                      <strong>{e.title || cat.label}</strong>
                      <small>{cat.label} · {formatShamsiDisplay(`${e.date}T00:00:00`)}</small>
                    </span>
                    <span className="app-home-row-amount">{toman === null ? '—' : money(toman)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <button type="button" className="app-home-empty" onClick={() => onOpen?.('add-expense')}>
              <Plus size={18} />
              هنوز هزینه‌ای برای این ماه ثبت نشده؛ اولین را ثبت کنید
            </button>
          )}
        </section>
      )}
    </div>
  );
}
