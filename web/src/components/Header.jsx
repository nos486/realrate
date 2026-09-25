import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  LogOut,
  Lock,
  Menu,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../features/auth/index.js';
import { usePrivacyMode, setPrivacyMode } from '../hooks/usePrivacyMode.js';
import { APP_BASE, LANDING_PATH } from '../shared/routes.js';
import { useVault } from '../shared/vault/useVault.js';
import { lockAll } from '../shared/vault/vaultStore.js';
import MobileNavDrawer from './MobileNavDrawer.jsx';

const LogoMark = () => (
  <svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="10" fill="url(#rr_bg)" />
    <path d="M10 22L15 16L19 19L26 11" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 11H26V15" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="19" cy="19" r="2.2" fill="#fbbf24" />
    <defs>
      <linearGradient id="rr_bg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1e2433" />
        <stop offset="1" stopColor="#0f131d" />
      </linearGradient>
    </defs>
  </svg>
);

/** Tabs that display monetary values and therefore offer the hide-values toggle */
const PRIVACY_TABS = ['portfolio', 'transactions', 'incomes', 'loans', 'cheques'];

export default function Header({ activeTab, setActiveTab = null, navItems = null }) {
  const { user, triggerLogin, logout } = useAuth();

  const hideValues = usePrivacyMode();

  const togglePrivacy = () => setPrivacyMode(!hideValues);

  // One lock for everything encrypted that is open in this tab (account vault and any
  // portfolio opened with its own older passphrase)
  const vault = useVault();
  const canLock = Boolean(user) && (vault.status === 'unlocked' || vault.legacyUnlocked);

  // On phones the app's sections live in a side menu instead of the tab bar
  const hasDrawer = Boolean(navItems?.length);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const brand = (
    <Link to={user ? APP_BASE : LANDING_PATH} className="brand-link">
      <LogoMark />
      <div className="brand-texts">
        <span className="brand-name">RealRate</span>
        <span className="brand-tagline">سامانه تحلیل زنده طلا، سکه و ارز</span>
      </div>
    </Link>
  );

  return (
    <header className={`site-header ${hasDrawer ? 'has-nav-drawer' : ''}`}>
      <div className="header-main-row">
        {/* Brand */}
        <div className="header-brand">
          {hasDrawer && (
            <button
              type="button"
              className="header-menu-btn"
              onClick={() => setDrawerOpen(true)}
              aria-label="باز کردن منو"
              aria-expanded={drawerOpen}
            >
              <Menu size={20} strokeWidth={2.2} />
            </button>
          )}
          {brand}
        </div>

        {/* Header Right: User Profile & Auth */}
        <div className="header-right">
          {PRIVACY_TABS.includes(activeTab) && (
            <button
              type="button"
              className={`btn-privacy-toggle icon-only ${hideValues ? 'active' : ''}`}
              onClick={togglePrivacy}
              title={hideValues ? 'نمایش مجدد مقادیر مالی' : 'مخفی‌سازی مبالغ دارایی (حالت محرمانگی)'}
              aria-label={hideValues ? 'نمایش مجدد مقادیر مالی' : 'مخفی‌سازی مبالغ دارایی (حالت محرمانگی)'}
            >
              {hideValues ? <Eye size={15} strokeWidth={2.2} /> : <EyeOff size={15} strokeWidth={2.2} />}
            </button>
          )}

          {canLock && (
            <button
              type="button"
              className="btn-privacy-toggle icon-only btn-vault-lock-all"
              onClick={lockAll}
              title="قفل کردن اطلاعات رمزنگاری‌شده"
              aria-label="قفل کردن اطلاعات رمزنگاری‌شده"
            >
              <Lock size={15} strokeWidth={2.2} />
            </button>
          )}

          {/* User Auth / Profile */}
          <div className="auth-widget">
            {user ? (
              <div className="header-user-profile-direct">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || 'کاربر'}
                    className="user-avatar header-avatar-direct"
                    title={`${user.customName || user.name} (${user.email})`}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <span
                    className="user-avatar header-avatar-direct header-avatar-fallback"
                    title={`${user.customName || user.name} (${user.email})`}
                  >
                    {(user.customName || user.name || user.email || 'U')[0]}
                  </span>
                )}
                <button
                  type="button"
                  className="btn-header-logout"
                  onClick={logout}
                  title="خروج از حساب کاربری"
                  aria-label="خروج"
                >
                  <LogOut size={16} strokeWidth={2.2} />
                </button>
              </div>
            ) : (
              <button className="btn-google-login" onClick={triggerLogin}>
                <LogIn size={15} />
                <span>ورود / ثبت‌نام</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {hasDrawer && (
        <MobileNavDrawer
          isOpen={drawerOpen}
          onClose={closeDrawer}
          items={navItems}
          activeTab={activeTab}
          onSelect={setActiveTab}
          user={user}
          brand={brand}
          hideValues={hideValues}
          onTogglePrivacy={togglePrivacy}
          canLock={canLock}
          onLock={lockAll}
          onLogout={logout}
          onLogin={triggerLogin}
        />
      )}
    </header>
  );
}
