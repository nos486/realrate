/**
 * AppShell.jsx — The Android app's frame: a top app bar, a bottom navigation bar with a central
 * "+" button, and the sheets they open (shared/app/AppSheet.jsx)
 *
 * Inside the app it replaces the website's header, side menu and footer (AppLayout.jsx):
 *   bottom bar   خانه · هزینه‌ها · (+) · پورتفو · بیشتر
 *   +            quick add: an expense, an income, a portfolio asset, the bank messages waiting
 *   بیشتر        every other section, and the account actions (hide values, lock, sign out)
 * Sections come from the page's own `navItems` (MainPage), so a section a user does not have
 * (a feature not enabled) is simply not there.
 *
 * A form opened from "+" is reached with `?add=…` on the section's page (useQuickAddParam).
 */

import AlertCenterButton from '../alerts/AlertCenter.jsx';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Home, HandCoins, Wallet, Briefcase, LayoutGrid, Plus, Eye, EyeOff, Lock, LogOut,
  MessageSquareText, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../../features/auth/index.js';
import { usePrivacyMode, setPrivacyMode } from '../../hooks/usePrivacyMode.js';
import { useVault } from '../vault/useVault.js';
import { lockAll } from '../vault/vaultStore.js';
import { appPath } from '../routes.js';
import { getPendingSms, SMS_INBOX_EVENT } from '../native/smsInbox.js';
import { tap, impact } from '../native/haptics.js';
import AppSheet from './AppSheet.jsx';

/** Sections whose pages show amounts (the hide-values button is offered there) */
const MONEY_TABS = ['market', 'portfolio', 'incomes', 'expenses', 'accounts', 'loans', 'cheques'];

/** The bottom bar's own sections; everything else is under «بیشتر» */
function mainTabs(items) {
  const has = (value) => items.some((i) => i.value === value);
  const expenses = { value: 'expenses', label: 'هزینه‌ها', Icon: HandCoins };
  const incomes = { value: 'incomes', label: 'درآمدها', Icon: Wallet };
  const portfolio = { value: 'portfolio', label: 'پورتفو', Icon: Briefcase };
  // Expenses and incomes; without expenses, incomes and the portfolio (it moves to «بیشتر»
  // otherwise)
  return [{ value: 'market', label: 'خانه', Icon: Home }, ...(has('expenses') ? [expenses, incomes] : [incomes, portfolio])];
}

function usePendingSmsCount() {
  const [count, setCount] = useState(() => getPendingSms().length);
  useEffect(() => {
    const update = () => setCount(getPendingSms().length);
    window.addEventListener(SMS_INBOX_EVENT, update);
    return () => window.removeEventListener(SMS_INBOX_EVENT, update);
  }, []);
  return count;
}

const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');

export function AppTopBar({ activeTab, navItems = [] }) {
  const hideValues = usePrivacyMode();
  const vault = useVault();
  const { user } = useAuth();
  const canLock = Boolean(user) && (vault.status === 'unlocked' || vault.legacyUnlocked);
  const current = navItems.find((i) => i.value === activeTab);
  const isHome = activeTab === 'market';

  return (
    <header className="app-topbar">
      <h1 className="app-topbar-title">
        {isHome ? (
          <>
            <span className="app-topbar-logo" aria-hidden="true" />
            RealRate
          </>
        ) : (
          current?.label || 'RealRate'
        )}
      </h1>
      <div className="app-topbar-actions">
        {MONEY_TABS.includes(activeTab) && (
          <button
            type="button"
            className="app-icon-btn"
            onClick={() => {
              tap();
              setPrivacyMode(!hideValues);
            }}
            aria-pressed={hideValues}
            aria-label={hideValues ? 'نمایش مبالغ' : 'پنهان کردن مبالغ'}
          >
            {hideValues ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
        )}
        {user && <AlertCenterButton className="app-icon-btn" iconSize={20} />}
        {canLock && (
          <button type="button" className="app-icon-btn" onClick={() => { tap(); lockAll(); }} aria-label="قفل کردن اطلاعات رمزنگاری‌شده">
            <Lock size={20} />
          </button>
        )}
      </div>
    </header>
  );
}

export function AppBottomNav({ activeTab, navItems = [], onSelect }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const hideValues = usePrivacyMode();
  const vault = useVault();
  const pendingSms = usePendingSmsCount();
  const [sheet, setSheet] = useState(null); // null | 'add' | 'more'
  const closeSheet = useCallback(() => setSheet(null), [setSheet]);

  const tabs = mainTabs(navItems);
  const mainValues = tabs.map((t) => t.value);
  const moreItems = navItems.filter((i) => !mainValues.includes(i.value));
  const inMore = !mainValues.includes(activeTab);
  const has = (value) => navItems.some((i) => i.value === value);
  const canLock = Boolean(user) && (vault.status === 'unlocked' || vault.legacyUnlocked);

  const go = (value) => {
    tap();
    setSheet(null);
    if (value !== activeTab) onSelect?.(value);
  };
  const open = (path) => {
    tap();
    setSheet(null);
    navigate(appPath(path));
  };

  const quickAdd = [
    has('expenses') && { key: 'expense', label: 'هزینه', hint: 'خرید، قبض، رفت‌وآمد…', Icon: HandCoins, tone: 'rose', path: '/expenses?add=expense' },
    has('incomes') && { key: 'income', label: 'درآمد', hint: 'حقوق، فروش، سود…', Icon: Wallet, tone: 'green', path: '/incomes?add=income' },
    has('portfolio') && { key: 'holding', label: 'پورتفو', hint: 'طلا، سکه، ارز…', Icon: Briefcase, tone: 'amber', path: '/portfolio?add=holding' },
  ].filter(Boolean);

  return (
    <>
      <nav className="app-bottom-nav" aria-label="بخش‌های اصلی">
        {tabs.slice(0, 2).map((t) => (
          <NavButton key={t.value} tab={t} active={activeTab === t.value} onClick={() => go(t.value)} />
        ))}
        <div className="app-bottom-nav-center">
          <button
            type="button"
            className={`app-fab ${sheet === 'add' ? 'is-open' : ''}`}
            onClick={() => {
              impact();
              setSheet((s) => (s === 'add' ? null : 'add'));
            }}
            aria-label="ثبت سریع"
            aria-expanded={sheet === 'add'}
          >
            <Plus size={26} strokeWidth={2.4} />
          </button>
        </div>
        <NavButton tab={tabs[2]} active={activeTab === tabs[2].value} onClick={() => go(tabs[2].value)} />
        <NavButton
          tab={{ value: 'more', label: 'بیشتر', Icon: LayoutGrid }}
          active={inMore || sheet === 'more'}
          badge={pendingSms}
          onClick={() => {
            tap();
            setSheet('more');
          }}
        />
      </nav>

      <AppSheet open={sheet === 'add'} onClose={closeSheet} title="ثبت سریع">
        <div className="app-quick-add">
          {quickAdd.map((q) => (
            <button key={q.key} type="button" className={`app-quick-add-item tone-${q.tone}`} onClick={() => open(q.path)}>
              <span className="app-quick-add-icon"><q.Icon size={22} /></span>
              <strong>{q.label}</strong>
              <small>{q.hint}</small>
            </button>
          ))}
        </div>
        {has('sms') && pendingSms > 0 && (
          <button type="button" className="app-sheet-row is-highlight" onClick={() => open('/sms')}>
            <MessageSquareText size={20} />
            <span>{faNum(pendingSms)} پیامک بانکی منتظر ثبت</span>
            <ChevronLeft size={18} className="app-sheet-row-chevron" />
          </button>
        )}
      </AppSheet>

      <AppSheet open={sheet === 'more'} onClose={closeSheet} title="بیشتر">
        {user && (
          <div className="app-more-user">
            {user.picture ? (
              <img src={user.picture} alt="" className="app-more-avatar" onError={(e) => { e.target.style.display = 'none'; }} />
            ) : (
              <span className="app-more-avatar is-fallback">{(user.customName || user.name || user.email || 'U')[0]}</span>
            )}
            <div>
              <strong>{user.customName || user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>
        )}
        <div className="app-more-grid">
          {moreItems.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`app-more-tile ${item.value === activeTab ? 'is-active' : ''}`}
              onClick={() => go(item.value)}
            >
              <span className="app-more-tile-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.value === 'sms' && pendingSms > 0 && <span className="app-badge">{faNum(pendingSms)}</span>}
            </button>
          ))}
        </div>
        {user && (
          <div className="app-sheet-rows">
            <button type="button" className="app-sheet-row" onClick={() => { tap(); setPrivacyMode(!hideValues); }} aria-pressed={hideValues}>
              {hideValues ? <Eye size={20} /> : <EyeOff size={20} />}
              <span>{hideValues ? 'نمایش مبالغ' : 'پنهان کردن مبالغ'}</span>
            </button>
            {canLock && (
              <button type="button" className="app-sheet-row" onClick={() => { tap(); setSheet(null); lockAll(); }}>
                <Lock size={20} />
                <span>قفل کردن اطلاعات رمزنگاری‌شده</span>
              </button>
            )}
            <button type="button" className="app-sheet-row is-danger" onClick={() => { setSheet(null); logout(); }}>
              <LogOut size={20} />
              <span>خروج از حساب</span>
            </button>
          </div>
        )}
      </AppSheet>
    </>
  );
}

function NavButton({ tab, active, onClick, badge = 0 }) {
  const { Icon } = tab;
  return (
    <button
      type="button"
      className={`app-bottom-nav-item ${active ? 'is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <span className="app-bottom-nav-icon">
        <Icon size={22} strokeWidth={active ? 2.4 : 2} />
        {badge > 0 && <span className="app-badge is-dot" aria-label={`${faNum(badge)} مورد جدید`} />}
      </span>
      <span className="app-bottom-nav-label">{tab.label}</span>
    </button>
  );
}
