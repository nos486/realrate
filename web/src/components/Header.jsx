import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Briefcase,
  Eye,
  EyeOff,
  Sun,
  Moon,
  ChevronDown,
  User,
  ShieldCheck,
  Radio,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { apiGetPrices } from '../api/client.js';
import AccountSettingsModal from './AccountSettingsModal.jsx';

const LogoMark = () => (
  <svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="10" fill="url(#rr_bg)" />
    <path d="M10 22L15 16L19 19L26 11" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 11H26V15" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="19" cy="19" r="2.2" fill="#fbbf24"/>
    <defs>
      <linearGradient id="rr_bg" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop stopColor="#1e2433"/>
        <stop offset="1" stopColor="#0f131d"/>
      </linearGradient>
    </defs>
  </svg>
);

function formatHeaderNum(num) {
  if (num === null || num === undefined || isNaN(num) || num === 0) return '...';
  const clean = typeof num === 'string' ? parseFloat(num.replace(/,/g, '')) : num;
  if (isNaN(clean) || clean === 0) return '...';
  return Math.round(clean).toLocaleString('fa-IR');
}

export default function Header({ usdToman, gold18kPrice, activeTab, setActiveTab }) {
  const { user, triggerLogin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Autonomous fallback for price ticker when props are not provided
  const [internalPrices, setInternalPrices] = useState({ usd: null, gold: null });

  useEffect(() => {
    if (usdToman !== undefined && gold18kPrice !== undefined) return;
    let mounted = true;
    apiGetPrices()
      .then((data) => {
        if (!mounted || !data) return;
        const usd = data.live_usd_toman || data.globalSettings?.default_usd_toman || 0;
        const gold =
          data.prices?.['18k']?.price ||
          (data.gold_usd && usd ? Math.round((data.gold_usd * usd * 4.3318) / 31.1034768) : 0);
        setInternalPrices({ usd, gold });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [usdToman, gold18kPrice]);

  const displayUsd = usdToman !== undefined ? usdToman : internalPrices.usd;
  const displayGold = gold18kPrice !== undefined ? gold18kPrice : internalPrices.gold;

  const [hideValues, setHideValues] = useState(() => {
    try {
      return localStorage.getItem('realrate_hide_values') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    const onPrivacyChange = () => {
      try {
        setHideValues(localStorage.getItem('realrate_hide_values') === 'true');
      } catch {}
    };
    document.addEventListener('click', handleOutsideClick);
    window.addEventListener('realrate_privacy_change', onPrivacyChange);
    window.addEventListener('storage', onPrivacyChange);
    return () => {
      document.removeEventListener('click', handleOutsideClick);
      window.removeEventListener('realrate_privacy_change', onPrivacyChange);
      window.removeEventListener('storage', onPrivacyChange);
    };
  }, []);

  const togglePrivacy = () => {
    setHideValues((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('realrate_hide_values', String(next));
      } catch {}
      window.dispatchEvent(new Event('realrate_privacy_change'));
      return next;
    });
  };

  return (
    <header className="site-header">
      <div className="header-main-row">
        {/* Brand */}
        <div className="header-brand">
          <Link to="/" className="brand-link">
            <LogoMark />
            <div className="brand-texts">
              <span className="brand-name">RealRate</span>
              <span className="brand-tagline">سامانه تحلیل زنده طلا، سکه و ارز</span>
            </div>
          </Link>
        </div>

        {/* Mobile Tab Switcher */}
        <nav className="header-tabs-switcher" aria-label="انتخاب تب">
          {setActiveTab ? (
            <>
              <button
                type="button"
                className={`header-tab-btn ${activeTab === 'market' ? 'active' : ''}`}
                onClick={() => setActiveTab('market')}
                title="نرخ و حباب طلا، سکه و ارز"
                aria-label="بازار"
              >
                <TrendingUp size={17} strokeWidth={2.2} />
                <span className="tab-btn-title">نرخ و حباب</span>
              </button>

              <button
                type="button"
                className={`header-tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`}
                onClick={() => setActiveTab('portfolio')}
                title="پورتفوی دارایی من"
                aria-label="پورتفو"
              >
                <Briefcase size={17} strokeWidth={2.2} />
                <span className="tab-btn-title">پورتفو</span>
              </button>
            </>
          ) : (
            <>
              <Link
                to="/"
                className={`header-tab-btn ${activeTab === 'market' || !activeTab ? 'active' : ''}`}
                title="نرخ و حباب طلا، سکه و ارز"
                aria-label="بازار"
              >
                <TrendingUp size={17} strokeWidth={2.2} />
                <span className="tab-btn-title">نرخ و حباب</span>
              </Link>

              <Link
                to="/portfolio"
                className={`header-tab-btn ${activeTab === 'portfolio' ? 'active' : ''}`}
                title="پورتفوی دارایی من"
                aria-label="پورتفو"
              >
                <Briefcase size={17} strokeWidth={2.2} />
                <span className="tab-btn-title">پورتفو</span>
              </Link>
            </>
          )}
        </nav>

        {/* Desktop Ticker (Hidden on Mobile) */}
        <div className="header-live-ticker desktop-only">
          <div className="header-ticker-item gold" title="نرخ روز هر گرم طلای ۱۸ عیار">
            <span className="ticker-pulse gold"></span>
            <span className="ticker-tag">طلای ۱۸:</span>
            <strong className="ticker-amount">{formatHeaderNum(displayGold)}</strong>
            <span className="ticker-unit">تومان</span>
          </div>

          <div className="ticker-separator"></div>

          <div className="header-ticker-item usd" title="نرخ روز دلار نقدی آزاد">
            <span className="ticker-pulse green"></span>
            <span className="ticker-tag">دلار آزاد:</span>
            <strong className="ticker-amount">{formatHeaderNum(displayUsd)}</strong>
            <span className="ticker-unit">تومان</span>
          </div>
        </div>

        {/* Header Right: User Profile & Auth */}
        <div className="header-right">
          {activeTab === 'portfolio' && (
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

          {/* Theme Toggle Button (Light / Dark) */}
          <button
            type="button"
            className="btn-theme-toggle icon-only"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'}
            aria-label={theme === 'dark' ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'}
          >
            {theme === 'dark' ? <Sun size={15} strokeWidth={2.2} /> : <Moon size={15} strokeWidth={2.2} />}
          </button>

          {/* User Auth / Profile */}
          <div className="auth-widget" ref={dropdownRef}>
            {user ? (
              <div className="user-profile-menu">
                <button
                  className={`user-trigger-btn ${dropdownOpen ? 'active' : ''}`}
                  onClick={() => setDropdownOpen((v) => !v)}
                  title={user.customName || user.name || 'حساب کاربری'}
                >
                  <img
                    src={user.picture || ''}
                    alt={user.name}
                    className="user-avatar"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <span className="user-firstname desktop-only">{user.customName || user.name?.split(' ')[0] || 'کاربر'}</span>
                  {user.role === 'admin' && <span className="admin-badge desktop-only">مدیر</span>}
                  <ChevronDown className="chevron-icon desktop-only" size={13} strokeWidth={2.5} />
                </button>

              {dropdownOpen && (
                <div className="dropdown-panel">
                  <div className="dropdown-user-info">
                    <strong>{user.customName ? `${user.customName} (${user.name})` : user.name}</strong>
                    <span>{user.email}</span>
                  </div>
                  <div className="dropdown-sep"></div>

                  <button
                    type="button"
                    className="dropdown-link"
                    onClick={() => { setAccountModalOpen(true); setDropdownOpen(false); }}
                  >
                    <User size={15} strokeWidth={2} />
                    <span>تنظیمات حساب</span>
                  </button>

                  {user.role === 'admin' && (
                    <>
                      <Link to="/admin" className="dropdown-link admin" onClick={() => setDropdownOpen(false)}>
                        <ShieldCheck size={15} strokeWidth={2} />
                        <span>پنل مدیریت و کاربران</span>
                      </Link>
                      <Link to="/admin/sources" className="dropdown-link admin" onClick={() => setDropdownOpen(false)}>
                        <Radio size={15} strokeWidth={2} />
                        <span>سورس‌های قیمت و نمودارها</span>
                      </Link>
                    </>
                  )}
                  <button className="dropdown-link logout" onClick={() => { logout(); setDropdownOpen(false); }}>
                    <LogOut size={15} strokeWidth={2} />
                    <span>خروج</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn-google-login" onClick={triggerLogin}>
              <svg width="15" height="15" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>ورود با گوگل</span>
            </button>
          )}
        </div>
      </div>
    </div>

      {/* Mobile Live Sub-Ticker Strip: Ultra compact, single-line, zero overflow */}
      <div className="header-mobile-ticker mobile-only">
        <div className="mobile-ticker-chip gold">
          <span className="ticker-pulse gold"></span>
          <span className="chip-label">طلا ۱۸:</span>
          <strong>{formatHeaderNum(gold18kPrice)}</strong>
          <span className="chip-unit">تومان</span>
        </div>
        <div className="ticker-dot-sep">•</div>
        <div className="mobile-ticker-chip usd">
          <span className="ticker-pulse green"></span>
          <span className="chip-label">دلار:</span>
          <strong>{formatHeaderNum(usdToman)}</strong>
          <span className="chip-unit">تومان</span>
        </div>
      </div>

      <AccountSettingsModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
      />
    </header>
  );
}
