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
import { useAuth } from '@/context/AuthContext.jsx';
import { useTheme } from '@/context/ThemeContext.jsx';
import AccountSettingsModal from './AccountSettingsModal.jsx';
import { cn } from '@/lib/utils.js';

const LogoMark = () => (
  <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="10" fill="url(#rr_bg)" />
    <path d="M10 22L15 16L19 19L26 11" stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 11H26V15" stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
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
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#06080d]/92 border-b border-white/[0.08] light:bg-white/95 light:border-slate-200 select-none transition-colors shadow-sm">
      <div className="w-full px-4 sm:px-8 lg:px-12 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <LogoMark />
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tight text-white light:text-slate-900 leading-none">
                RealRate
              </span>
              <span className="text-[11px] text-slate-400 light:text-slate-500 mt-1 font-medium hidden sm:inline">
                سامانه تحلیل زنده طلا، سکه و ارز
              </span>
            </div>
          </Link>
        </div>

        {/* Tab Switcher (When on main view) */}
        {setActiveTab && (
          <nav className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-2xl border border-white/5 light:bg-slate-100 light:border-slate-200" aria-label="انتخاب تب">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none',
                activeTab === 'market'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white light:text-slate-600 light:hover:text-slate-900'
              )}
              onClick={() => setActiveTab('market')}
              title="نرخ و حباب طلا، سکه و ارز"
            >
              <TrendingUp size={16} strokeWidth={2.4} />
              <span className="hidden sm:inline">نرخ و حباب</span>
            </button>

            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none',
                activeTab === 'portfolio'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white light:text-slate-600 light:hover:text-slate-900'
              )}
              onClick={() => setActiveTab('portfolio')}
              title="پورتفوی دارایی من"
            >
              <Briefcase size={16} strokeWidth={2.4} />
              <span className="hidden sm:inline">پورتفو</span>
            </button>
          </nav>
        )}

        {/* Desktop Ticker (Hidden on Mobile) */}
        <div className="hidden lg:flex items-center gap-4 bg-white/[0.03] border border-white/[0.08] px-4 py-2 rounded-2xl light:bg-slate-100 light:border-slate-200 text-xs shadow-inner">
          <div className="flex items-center gap-2" title="نرخ روز هر گرم طلای ۱۸ عیار">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ring-2 ring-amber-400/20" />
            <span className="text-slate-400 light:text-slate-500">طلای ۱۸:</span>
            <strong className="font-extrabold text-amber-400 text-xs tracking-wide">{formatHeaderNum(gold18kPrice)}</strong>
            <span className="text-[10px] text-slate-500">تومان</span>
          </div>

          <div className="h-3.5 w-px bg-white/10 light:bg-slate-300" />

          <div className="flex items-center gap-2" title="نرخ روز دلار نقدی آزاد">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ring-2 ring-emerald-400/20" />
            <span className="text-slate-400 light:text-slate-500">دلار آزاد:</span>
            <strong className="font-extrabold text-emerald-400 text-xs tracking-wide">{formatHeaderNum(usdToman)}</strong>
            <span className="text-[10px] text-slate-500">تومان</span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5">
          {activeTab === 'portfolio' && (
            <button
              type="button"
              className={cn(
                'p-2.5 rounded-xl border border-white/5 transition-all cursor-pointer',
                hideValues
                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.06] light:text-slate-600 light:hover:text-slate-900 light:hover:bg-slate-100'
              )}
              onClick={togglePrivacy}
              title={hideValues ? 'نمایش مجدد مقادیر مالی' : 'مخفی‌سازی مبالغ دارایی'}
              aria-label="حالت محرمانگی"
            >
              {hideValues ? <Eye size={17} strokeWidth={2} /> : <EyeOff size={17} strokeWidth={2} />}
            </button>
          )}

          {/* Theme Toggle */}
          <button
            type="button"
            className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] light:text-slate-600 light:hover:text-slate-900 light:hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-white/5"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'}
            aria-label="تغییر تم"
          >
            {theme === 'dark' ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
          </button>

          {/* User Auth Profile / Login */}
          <div className="relative" ref={dropdownRef}>
            {user ? (
              <div>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-2.5 p-1.5 ps-3 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] light:bg-slate-100 light:border-slate-200 transition-all cursor-pointer',
                    dropdownOpen && 'border-amber-500/50 ring-2 ring-amber-500/20 bg-amber-500/5'
                  )}
                  onClick={() => setDropdownOpen((v) => !v)}
                  title={user.customName || user.name || 'حساب کاربری'}
                >
                  <img
                    src={user.picture || ''}
                    alt={user.name || ''}
                    className="w-8 h-8 rounded-full object-cover border-2 border-amber-500/60 bg-slate-800 shrink-0"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                  <span className="hidden sm:inline text-xs font-bold text-slate-200 light:text-slate-800 max-w-[100px] truncate">
                    {user.customName || user.name?.split(' ')[0] || 'کاربر'}
                  </span>
                  {user.role === 'admin' && (
                    <span className="hidden sm:inline text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/40 font-black">
                      مدیر
                    </span>
                  )}
                  <ChevronDown size={14} className="hidden sm:inline text-slate-400" />
                </button>

                {dropdownOpen && (
                  <div className="absolute end-0 top-full mt-2 w-60 p-2.5 rounded-2xl border border-white/10 bg-[#0e131f] shadow-2xl z-50 text-xs flex flex-col gap-1 light:bg-white light:border-slate-200 animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-2.5 flex flex-col gap-0.5 bg-white/[0.02] rounded-xl mb-1 light:bg-slate-50">
                      <strong className="text-white light:text-slate-900 font-bold truncate text-xs">
                        {user.customName ? `${user.customName} (${user.name})` : user.name}
                      </strong>
                      <span className="text-[11px] text-slate-400 font-mono dir-ltr text-start truncate">
                        {user.email}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/[0.07] light:text-slate-700 light:hover:text-slate-900 light:hover:bg-slate-100 transition-colors text-start cursor-pointer font-medium"
                      onClick={() => { setAccountModalOpen(true); setDropdownOpen(false); }}
                    >
                      <User size={16} strokeWidth={2} />
                      <span>تنظیمات حساب کاربری</span>
                    </button>

                    {user.role === 'admin' && (
                      <>
                        <Link
                          to="/admin"
                          className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-amber-400 hover:bg-amber-500/10 transition-colors text-start font-medium"
                          onClick={() => setDropdownOpen(false)}
                        >
                          <ShieldCheck size={16} strokeWidth={2} />
                          <span>پنل مدیریت و کاربران</span>
                        </Link>
                        <Link
                          to="/admin/sources"
                          className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-sky-400 hover:bg-sky-500/10 transition-colors text-start font-medium"
                          onClick={() => setDropdownOpen(false)}
                        >
                          <Radio size={16} strokeWidth={2} />
                          <span>سورس‌های قیمت و نمودارها</span>
                        </Link>
                      </>
                    )}

                    <div className="h-px bg-white/5 light:bg-slate-100 my-1" />

                    <button
                      type="button"
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors text-start cursor-pointer font-medium"
                      onClick={() => { logout(); setDropdownOpen(false); }}
                    >
                      <LogOut size={16} strokeWidth={2} />
                      <span>خروج از حساب</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={triggerLogin}
                className="flex items-center gap-2.5 h-10 px-4 rounded-xl text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 active:scale-[0.98] transition-all shadow-md cursor-pointer select-none"
              >
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

      {/* Mobile Live Sub-Ticker Strip */}
      <div className="lg:hidden flex items-center justify-center gap-4 py-2 px-4 bg-white/[0.02] border-t border-white/5 light:bg-slate-50 light:border-slate-200 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-slate-400 light:text-slate-500">طلا ۱۸:</span>
          <strong className="font-extrabold text-amber-400">{formatHeaderNum(gold18kPrice)}</strong>
          <span className="text-[10px] text-slate-500">تومان</span>
        </div>
        <div className="text-slate-600 light:text-slate-400">•</div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-400 light:text-slate-500">دلار:</span>
          <strong className="font-extrabold text-emerald-400">{formatHeaderNum(usdToman)}</strong>
          <span className="text-[10px] text-slate-500">تومان</span>
        </div>
      </div>

      <AccountSettingsModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
      />
    </header>
  );
}
