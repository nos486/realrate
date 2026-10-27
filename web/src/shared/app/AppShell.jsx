/**
 * AppShell.jsx — The Android app's frame: a top app bar, a bottom navigation bar with a central
 * "+" button, and the sheets they open (shared/app/AppSheet.jsx)
 *
 * Inside the app it replaces the website's header, side menu and footer (AppLayout.jsx):
 *   bottom bar   خانه · پول · (+) · سرمایه · بیشتر   (groups: shared/app/navGroups.js); a group
 *                with several sections lists them in a sheet like «ثبت سریع», one with one opens it
 *   +            quick add: an expense, an income, a portfolio asset, the bank messages waiting
 *   بیشتر        the other groups, each with its sections, and the account actions (hide values, lock)
 * Sections come from the page's own `navItems` (MainPage), so a section a user does not have
 * (a feature not enabled) is simply not there.
 *
 * A form opened from "+" is reached with `?add=…` on the section's page (useQuickAddParam).
 */

import { intlLocale, t } from '../../utils/i18n.js';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HandCoins, Wallet, Briefcase, LayoutGrid, Plus, Eye, EyeOff, Lock,
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
import AlertCenterButton from '../alerts/AlertCenter.jsx';
import PageRefreshButton from '../refresh/PageRefreshButton.jsx';
import { APP_PRIVATE_VALUE_TABS } from './privacyTabs.js';
import { BOTTOM_NAV_GROUPS, NAV_SECTION_CARDS, buildNavGroups, groupOfTab } from './navGroups.js';

/** The bottom bar's three groups: the preferred ones the user has, then the next ones; the rest
 * are under «بیشتر» */
function bottomGroups(groups) {
  const tabs = groups.filter((g) => !g.menu);
  const preferred = BOTTOM_NAV_GROUPS.map((key) => tabs.find((g) => g.key === key)).filter(Boolean);
  return [...preferred, ...tabs.filter((g) => !preferred.includes(g))].slice(0, 3);
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

const faNum = (n) => Number(n || 0).toLocaleString(intlLocale());

export function AppTopBar({ activeTab, navItems = [] }) {
  const hideValues = usePrivacyMode();
  const vault = useVault();
  const { user } = useAuth();
  const canLock = Boolean(user) && vault.status === 'unlocked';
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
        <PageRefreshButton className="app-icon-btn" iconSize={20} onPress={tap} />
        {APP_PRIVATE_VALUE_TABS.includes(activeTab) && (
          <button
            type="button"
            className="app-icon-btn"
            onClick={() => {
              tap();
              setPrivacyMode(!hideValues);
            }}
            aria-pressed={hideValues}
            aria-label={hideValues ? t('نمایش مبالغ') : t('پنهان کردن مبالغ')}
          >
            {hideValues ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
        )}
        {user && <AlertCenterButton className="app-icon-btn" iconSize={20} />}
        {canLock && (
          <button type="button" className="app-icon-btn" onClick={() => { tap(); lockAll(); }} aria-label={t('قفل کردن اطلاعات رمزنگاری‌شده')}>
            <Lock size={20} />
          </button>
        )}
      </div>
    </header>
  );
}

export function AppBottomNav({ activeTab, navItems = [], onSelect }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const hideValues = usePrivacyMode();
  const vault = useVault();
  const pendingSms = usePendingSmsCount();
  const [sheet, setSheet] = useState(null); // null | 'add' | 'more' | a group's key
  const closeSheet = useCallback(() => setSheet(null), [setSheet]);

  const groups = buildNavGroups(navItems);
  const bottom = bottomGroups(groups);
  const moreGroups = groups.filter((g) => !bottom.includes(g));
  const activeGroup = groupOfTab(groups, activeTab);
  const inMore = !bottom.includes(activeGroup);
  const tabs = bottom.map((g) => ({ value: g.key, label: t(g.short || g.label), Icon: g.Icon, group: g }));
  // The waiting bank messages show on the group that has the SMS page, or on «بیشتر»
  const smsGroup = groupOfTab(groups, 'sms');
  const smsOnBottom = bottom.includes(smsGroup);
  const has = (value) => navItems.some((i) => i.value === value);
  const canLock = Boolean(user) && vault.status === 'unlocked';

  const go = (value) => {
    tap();
    setSheet(null);
    if (value !== activeTab) onSelect?.(value);
  };
  // A group with several sections lists them (like «ثبت سریع»); with one, it opens it
  const openGroup = (group) => {
    if (group.items.length === 1) go(group.items[0].value);
    else {
      tap();
      setListedKey(group.key);
      setSheet(group.key);
    }
  };
  const sheetGroup = bottom.find((g) => g.key === sheet) || null;
  // The last group asked about stays in its sheet while the sheet closes
  const [listedKey, setListedKey] = useState(null);
  const shownGroup = sheetGroup || bottom.find((g) => g.key === listedKey) || null;
  const open = (path) => {
    tap();
    setSheet(null);
    navigate(appPath(path));
  };

  const quickAdd = [
    has('expenses') && { key: 'expense', label: t('هزینه'), hint: t('خرید، قبض، رفت‌وآمد…'), Icon: HandCoins, tone: 'rose', path: '/expenses?add=expense' },
    has('incomes') && { key: 'income', label: t('درآمد'), hint: t('حقوق، فروش، سود…'), Icon: Wallet, tone: 'green', path: '/incomes?add=income' },
    has('portfolio') && { key: 'holding', label: t('پورتفو'), hint: t('طلا، سکه، ارز…'), Icon: Briefcase, tone: 'amber', path: '/portfolio?add=holding' },
  ].filter(Boolean);

  return (
    <>
      <nav className="app-bottom-nav" aria-label={t('بخش‌های اصلی')}>
        {tabs.slice(0, 2).map((t) => (
          <NavButton key={t.value} tab={t} active={activeGroup === t.group || sheet === t.value} badge={smsOnBottom && smsGroup === t.group ? pendingSms : 0} onClick={() => openGroup(t.group)} />
        ))}
        <div className="app-bottom-nav-center">
          <button
            type="button"
            className={`app-fab ${sheet === 'add' ? 'is-open' : ''}`}
            onClick={() => {
              impact();
              setSheet((s) => (s === 'add' ? null : 'add'));
            }}
            aria-label={t('ثبت سریع')}
            aria-expanded={sheet === 'add'}
          >
            <Plus size={26} strokeWidth={2.4} />
          </button>
        </div>
        {tabs[2] && (
          <NavButton tab={tabs[2]} active={activeGroup === tabs[2].group || sheet === tabs[2].value} badge={smsOnBottom && smsGroup === tabs[2].group ? pendingSms : 0} onClick={() => openGroup(tabs[2].group)} />
        )}
        <NavButton
          tab={{ value: 'more', label: t('بیشتر'), Icon: LayoutGrid }}
          active={inMore || sheet === 'more'}
          badge={smsOnBottom ? 0 : pendingSms}
          onClick={() => {
            tap();
            setSheet('more');
          }}
        />
      </nav>

      <AppSheet open={sheet === 'add'} onClose={closeSheet} title={t('ثبت سریع')}>
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
            <span>{t('{n} پیامک بانکی منتظر ثبت', { n: faNum(pendingSms) })}</span>
            <ChevronLeft size={18} className="app-sheet-row-chevron" />
          </button>
        )}
      </AppSheet>

      <AppSheet open={Boolean(sheetGroup)} onClose={closeSheet} className="app-group-sheet" title={shownGroup ? t(shownGroup.label) : ''}>
        {shownGroup && (
          <div className="app-quick-add">
            {shownGroup.items.map((item) => {
              const card = NAV_SECTION_CARDS[item.value] || {};
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`app-quick-add-item tone-${card.tone || 'blue'} ${item.value === activeTab ? 'is-active' : ''}`}
                  aria-current={item.value === activeTab ? 'page' : undefined}
                  onClick={() => go(item.value)}
                >
                  <span className="app-quick-add-icon">{item.icon}</span>
                  <strong>{item.label}</strong>
                  {card.hint && <small>{t(card.hint)}</small>}
                  {item.value === 'sms' && pendingSms > 0 && <span className="app-badge">{faNum(pendingSms)}</span>}
                </button>
              );
            })}
          </div>
        )}
      </AppSheet>

      <AppSheet open={sheet === 'more'} onClose={closeSheet} title={t('بیشتر')}>
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
        {moreGroups.map((group) => (
          <div key={group.key} className="app-more-group">
            <h3 className="app-more-group-title">{t(group.label)}</h3>
            <SectionTiles items={group.items} activeTab={activeTab} pendingSms={pendingSms} onSelect={go} />
          </div>
        ))}
        {user && (
          <div className="app-sheet-rows">
            <button type="button" className="app-sheet-row" onClick={() => { tap(); setPrivacyMode(!hideValues); }} aria-pressed={hideValues}>
              {hideValues ? <Eye size={20} /> : <EyeOff size={20} />}
              <span>{hideValues ? t('نمایش مبالغ') : t('پنهان کردن مبالغ')}</span>
            </button>
            {canLock && (
              <button type="button" className="app-sheet-row" onClick={() => { tap(); setSheet(null); lockAll(); }}>
                <Lock size={20} />
                <span>{t('قفل کردن اطلاعات رمزنگاری‌شده')}</span>
              </button>
            )}
          </div>
        )}
      </AppSheet>
    </>
  );
}

/** A group's sections as tiles (each part of «بیشتر») */
function SectionTiles({ items, activeTab, pendingSms, onSelect }) {
  return (
    <div className="app-more-grid">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={`app-more-tile ${item.value === activeTab ? 'is-active' : ''}`}
          onClick={() => onSelect(item.value)}
        >
          <span className="app-more-tile-icon">{item.icon}</span>
          <span>{item.label}</span>
          {item.value === 'sms' && pendingSms > 0 && <span className="app-badge">{faNum(pendingSms)}</span>}
        </button>
      ))}
    </div>
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
        {badge > 0 && <span className="app-badge is-dot" aria-label={t('{n} مورد جدید', { n: faNum(badge) })} />}
      </span>
      <span className="app-bottom-nav-label">{tab.label}</span>
    </button>
  );
}
