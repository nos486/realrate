import { t } from '../utils/i18n.js';
import React from 'react';
import AlertCenterButton from '../shared/alerts/AlertCenter.jsx';
import { Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../features/auth/index.js';
import { usePrivacyMode, setPrivacyMode } from '../hooks/usePrivacyMode.js';
import { APP_BASE, LANDING_PATH, appPath } from '../shared/routes.js';
import { useVault } from '../shared/vault/useVault.js';
import { lockAll } from '../shared/vault/vaultStore.js';
import PlanBadge from '../shared/plan/PlanBadge.jsx';
import PageRefreshButton from '../shared/refresh/PageRefreshButton.jsx';
import { PRIVATE_VALUE_TABS } from '../shared/app/privacyTabs.js';

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

/** The avatar: a link to account settings, or just the picture when there is nowhere to go */
function ProfileLink({ to, children, ...rest }) {
  if (!to) return <span {...rest}>{children}</span>;
  return <Link to={to} aria-label={t('تنظیمات حساب')} {...rest}>{children}</Link>;
}

export default function Header({ activeTab, navItems = null }) {
  const { user, triggerLogin } = useAuth();

  const hideValues = usePrivacyMode();

  const togglePrivacy = () => setPrivacyMode(!hideValues);

  // One lock for everything encrypted that is open in this tab (account vault and any
  // portfolio opened with its own older passphrase)
  const vault = useVault();
  const canLock = Boolean(user) && vault.status === 'unlocked';

  // On phones the app's sections live in a side menu instead of the tab bar

  const brand = (
    <Link to={user ? APP_BASE : LANDING_PATH} className="brand-link">
      <LogoMark />
      <div className="brand-texts">
        <span className="brand-name">RealRate</span>
        <span className="brand-tagline">{t('سامانه تحلیل زنده طلا، سکه و ارز')}</span>
      </div>
    </Link>
  );

  return (
    <header className="site-header">
      <div className="header-main-row">
        {/* Brand */}
        <div className="header-brand">
          {brand}
        </div>

        {/* Header Right: User Profile & Auth */}
        <div className="header-right">
          {user && !user.demo && <PlanBadge />}
          {user && <PageRefreshButton className="btn-privacy-toggle icon-only" iconSize={15} />}
          {PRIVATE_VALUE_TABS.includes(activeTab) && (
            <button
              type="button"
              className={`btn-privacy-toggle icon-only ${hideValues ? 'active' : ''}`}
              onClick={togglePrivacy}
              title={hideValues ? t('نمایش مجدد مقادیر مالی') : t('مخفی‌سازی مبالغ دارایی (حالت محرمانگی)')}
              aria-label={hideValues ? t('نمایش مجدد مقادیر مالی') : t('مخفی‌سازی مبالغ دارایی (حالت محرمانگی)')}
            >
              {hideValues ? <Eye size={15} strokeWidth={2.2} /> : <EyeOff size={15} strokeWidth={2.2} />}
            </button>
          )}

          {/* Every alert of the app (shared/alerts) */}
          {user && navItems?.length > 0 && <AlertCenterButton />}

          {canLock && (
            <button
              type="button"
              className="btn-privacy-toggle icon-only btn-vault-lock-all"
              onClick={lockAll}
              title={t('قفل کردن اطلاعات رمزنگاری‌شده')}
              aria-label={t('قفل کردن اطلاعات رمزنگاری‌شده')}
            >
              <Lock size={15} strokeWidth={2.2} />
            </button>
          )}

          {/* User Auth / Profile */}
          <div className="auth-widget">
            {user ? (
              // Opens account settings; signing out lives there, behind a confirmation (the demo
              // account has no settings and leaves from its banner)
              <ProfileLink
                to={user.demo ? null : appPath('/settings')}
                className="header-user-profile-direct"
                title={`${user.customName || user.name} (${user.email})`}
              >
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt=""
                    className="user-avatar header-avatar-direct"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <span className="user-avatar header-avatar-direct header-avatar-fallback">
                    {(user.customName || user.name || user.email || 'U')[0]}
                  </span>
                )}
              </ProfileLink>
            ) : (
              <button className="btn-google-login" onClick={triggerLogin}>
                <LogIn size={15} />
                <span>{t('ورود / ثبت‌نام')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
