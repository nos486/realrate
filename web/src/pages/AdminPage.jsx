import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Ban,
  RefreshCw,
  Home,
  ExternalLink,
  BarChart3,
  Users,
  Share2,
  Search,
  X,
  Sliders,
  Coins,
  Megaphone,
  Save,
  Radio,
  Globe,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  Send,
  Plus,
  Trash2,
  Edit3,
  Star,
  Clock,
  Layers,
  Sparkles,
  Code,
  Check,
  Palette,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme, COLOR_PRESETS, getContrastColor, shadeColor } from '../context/ThemeContext.jsx';
import {
  apiAdminStats,
  apiAdminUsers,
  apiAdminSaveSettings,
  apiAdminTestUsdSource,
  apiGetPrices,
} from '../api/client.js';
import AppLayout from '../components/ui/AppLayout.jsx';
import AlertBanner from '../components/ui/AlertBanner.jsx';
import MiniCard from '../components/ui/MiniCard.jsx';
import SearchBar from '../components/ui/SearchBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Card from '../components/ui/Card.jsx';


function formatNum(num) {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  return Math.round(num).toLocaleString('fa-IR');
}

function formatPersianDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return (
      d.toLocaleDateString('fa-IR') +
      ' ' +
      d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return isoStr;
  }
}

export default function AdminPage({ embedded = false }) {
  const { user, loading, triggerLogin, logout } = useAuth();

  const renderLayout = (content) => {
    if (embedded) return content;
    return <AppLayout activeTab="admin">{content}</AppLayout>;
  };

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [marketRates, setMarketRates] = useState(null);
  const [userSearch, setUserSearch] = useState('');

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase().trim();
    return users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.customName && u.customName.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.id && u.id.toLowerCase().includes(q)) ||
        (u.shareSlug && u.shareSlug.toLowerCase().includes(q))
    );
  }, [users, userSearch]);

  // Fallback defaults
  const [usdToman, setUsdToman] = useState(62000);
  const [goldUsd, setGoldUsd] = useState(2450);
  const [bubbleFull, setBubbleFull] = useState(15);
  const [bubbleHalf, setBubbleHalf] = useState(20);
  const [bubbleQuarter, setBubbleQuarter] = useState(25);
  const [announcement, setAnnouncement] = useState('');

  // USD dynamic source configuration
  const [usdSourceType, setUsdSourceType] = useState('telegram');
  const [usdTelegramChannel, setUsdTelegramChannel] = useState('tahran_sabza');
  const [usdApiUrl, setUsdApiUrl] = useState('');
  const [usdApiJsonPath, setUsdApiJsonPath] = useState('');

  // Brand color theme standards state
  const {
    primaryColor: currentPrimary,
    accentColor: currentAccent,
    borderColor: currentBorder,
    cardBgColor: currentCardBg,
    colorPreset: currentPreset,
    applyThemeColor
  } = useTheme();

  const [selectedPrimary, setSelectedPrimary] = useState(currentPrimary || '#0284c7');
  const [selectedAccent, setSelectedAccent] = useState(currentAccent || '#38bdf8');
  const [selectedBorder, setSelectedBorder] = useState(currentBorder || '#1e293b');
  const [selectedCardBg, setSelectedCardBg] = useState(currentCardBg || '#0d131f');
  const [selectedPreset, setSelectedPreset] = useState(currentPreset || 'ocean');

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset.id);
    setSelectedPrimary(preset.primary);
    setSelectedAccent(preset.accent);
    setSelectedBorder(preset.border || '#1e293b');
    setSelectedCardBg(preset.cardBg || '#0d131f');
    applyThemeColor(preset.primary, preset.accent, preset.id, preset.border || '#1e293b', preset.cardBg || '#0d131f');
  };

  const handleCustomPrimaryChange = (color) => {
    setSelectedPreset('custom');
    setSelectedPrimary(color);
    applyThemeColor(color, selectedAccent, 'custom', selectedBorder, selectedCardBg);
  };

  const handleCustomAccentChange = (color) => {
    setSelectedPreset('custom');
    setSelectedAccent(color);
    applyThemeColor(selectedPrimary, color, 'custom', selectedBorder, selectedCardBg);
  };

  const handleCustomBorderChange = (color) => {
    setSelectedPreset('custom');
    setSelectedBorder(color);
    applyThemeColor(selectedPrimary, selectedAccent, 'custom', color, selectedCardBg);
  };

  const handleCustomCardBgChange = (color) => {
    setSelectedPreset('custom');
    setSelectedCardBg(color);
    applyThemeColor(selectedPrimary, selectedAccent, 'custom', selectedBorder, color);
  };

  // Test source state
  const [testingUsdSource, setTestingUsdSource] = useState(false);
  const [usdTestResult, setUsdTestResult] = useState(null);

  const [msg, setMsg] = useState({ text: '', type: '' });
  const [saving, setSaving] = useState(false);

  const showMsg = (text, type = 'info') => {
    setMsg({ text, type });
    if (type === 'success') {
      setTimeout(() => setMsg({ text: '', type: '' }), 5000);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await apiAdminStats();
      if (data.success) {
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to load stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await apiAdminUsers();
      if (data.success && Array.isArray(data.users)) {
        setUsers(data.users);
      }
    } catch (e) {
      console.error('Failed to load users:', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Fetch initial data once admin user is confirmed
  useEffect(() => {
    if (user?.role === 'admin') {
      loadStats();
      loadUsers();

      apiGetPrices()
        .then((data) => {
          if (data) setMarketRates(data);
          if (data?.globalSettings) {
            const s = data.globalSettings;
            if (s.default_usd_toman) setUsdToman(s.default_usd_toman);
            if (s.default_gold_usd) setGoldUsd(s.default_gold_usd);
            if (s.bubble_pct_full !== undefined) setBubbleFull(s.bubble_pct_full);
            if (s.bubble_pct_half !== undefined) setBubbleHalf(s.bubble_pct_half);
            if (s.bubble_pct_quarter !== undefined) setBubbleQuarter(s.bubble_pct_quarter);
            if (s.announcement !== undefined) setAnnouncement(s.announcement || '');
            if (s.usd_source_type) setUsdSourceType(s.usd_source_type);
            if (s.usd_telegram_channel) setUsdTelegramChannel(s.usd_telegram_channel);
            if (s.usd_api_url !== undefined) setUsdApiUrl(s.usd_api_url || '');
            if (s.usd_api_json_path !== undefined) setUsdApiJsonPath(s.usd_api_json_path || '');
            if (s.primary_color) setSelectedPrimary(s.primary_color);
            if (s.accent_color) setSelectedAccent(s.accent_color);
            if (s.border_color) setSelectedBorder(s.border_color);
            if (s.card_bg_color) setSelectedCardBg(s.card_bg_color);
            if (s.color_preset) setSelectedPreset(s.color_preset);
          }
        })
        .catch(console.error);
    }
  }, [user]);

  const handleTestUsdSource = async () => {
    setTestingUsdSource(true);
    setUsdTestResult(null);
    try {
      const res = await apiAdminTestUsdSource({
        usd_source_type: usdSourceType,
        usd_telegram_channel: usdTelegramChannel,
        usd_api_url: usdApiUrl,
        usd_api_json_path: usdApiJsonPath,
      });
      setUsdTestResult(res);
    } catch (err) {
      setUsdTestResult({
        success: false,
        error: 'خطا در ارتباط با سرور: ' + err.message,
      });
    } finally {
      setTestingUsdSource(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiAdminSaveSettings({
        default_usd_toman: parseFloat(usdToman),
        default_gold_usd: parseFloat(goldUsd),
        bubble_pct_full: parseFloat(bubbleFull),
        bubble_pct_half: parseFloat(bubbleHalf),
        bubble_pct_quarter: parseFloat(bubbleQuarter),
        announcement,
        usd_source_type: usdSourceType,
        usd_telegram_channel: usdTelegramChannel,
        usd_api_url: usdApiUrl,
        usd_api_json_path: usdApiJsonPath,
        primary_color: selectedPrimary,
        accent_color: selectedAccent,
        border_color: selectedBorder,
        card_bg_color: selectedCardBg,
        color_preset: selectedPreset,
      });

      if (res.success) {
        applyThemeColor(selectedPrimary, selectedAccent, selectedPreset, selectedBorder, selectedCardBg);
        showMsg(res.message || 'تنظیمات با موفقیت ذخیره شد.', 'success');
      } else {
        showMsg(res.message || 'خطا در ذخیره‌سازی تنظیمات', 'error');
      }
    } catch (e) {
      showMsg('خطا در ارتباط با سرور: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return renderLayout(
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="spin-anim" style={{ color: 'var(--accent-blue)', margin: '0 auto 10px', display: 'block' }} />
        در حال بررسی دسترسی...
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return renderLayout(
      <Card className="admin-container" padding="lg" style={{ margin: '40px auto' }}>
        <div className="admin-header">
          <h2>ورود به پنل مدیریت RealRate</h2>
          <p>جهت ورود، لطفاً با حساب گوگل تعیین‌شده برای مدیر وارد شوید.</p>
        </div>
        <div className="login-box">
          <button className="google-admin-btn" onClick={triggerLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>ورود به مدیریت با گوگل</span>
          </button>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
            <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginLeft: '4px', display: 'inline' }} />
            احراز هویت اختصاصی بر اساس متغیر محیطی ADMIN_EMAIL
          </p>
          <Link to="/" className="btn-sm site-link" style={{ marginTop: '12px' }}>
            بازگشت به صفحه اصلی سایت
          </Link>
        </div>
      </Card>
    );
  }

  // Logged in but not admin
  if (user.role !== 'admin') {
    return renderLayout(
      <Card className="admin-container" padding="lg" style={{ margin: '40px auto' }}>
        <div className="login-box">
          <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
            <Ban size={44} color="#f87171" strokeWidth={1.8} />
          </div>
          <h3 style={{ color: '#f87171', fontWeight: 800 }}>عدم دسترسی مدیریت</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: '1.8' }}>
            شما با حساب گوگل{' '}
            <strong style={{ color: 'var(--text-heading)', direction: 'ltr', display: 'inline-block' }}>
              {user.email}
            </strong>{' '}
            وارد شده‌اید، اما این حساب به عنوان مدیر ثبت نشده است.
          </p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn-sm logout" onClick={logout}>
              <RefreshCw size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
              خروج و تعویض حساب گوگل
            </button>
            <Link to="/" className="btn-sm site-link">
              <Home size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
              بازگشت به سایت
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return renderLayout(
    <Card className="admin-container" padding="lg" style={{ width: '100%', maxWidth: '100%', margin: '0 0 32px 0' }}>
        {msg.text && (
          <AlertBanner
            type={msg.type || 'info'}
            message={msg.text}
            onClose={() => setMsg({ text: '', type: '' })}
          />
        )}

        {/* Live Stats */}
        <div className="section-title">
          <span>
            <BarChart3 size={15} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
            آمار و آنالیتیکس سیستم (Cloudflare KV)
          </span>
          <button onClick={loadStats} className="btn-sm site-link" style={{ padding: '2px 8px', fontSize: '11px' }}>
            <RefreshCw size={11} className={loadingStats ? 'spin-anim' : ''} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
            {loadingStats ? 'در حال دریافت...' : 'بروزرسانی'}
          </button>
        </div>

        <div className="stats-grid">
          <MiniCard
            icon={<Users size={14} />}
            title="کاربران ثبت‌نام شده"
            value={stats?.registeredUsers?.toLocaleString('fa-IR') || users.length.toLocaleString('fa-IR')}
            color="blue"
          />
          <MiniCard
            icon={<Share2 size={14} />}
            title="پورتفوهای عمومی فعال"
            value={users.filter((u) => u.shareEnabled).length.toLocaleString('fa-IR')}
            color="green"
          />
        </div>

      {/* Registered Users Table */}
      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span>
          <Users size={15} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
          جدول کاربران ({filteredUsers.length.toLocaleString('fa-IR')} کاربر)
        </span>
        <button onClick={loadUsers} className="btn-sm site-link" style={{ padding: '3px 10px', fontSize: '11px' }}>
          <RefreshCw size={11} className={loadingUsers ? 'spin-anim' : ''} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          {loadingUsers ? 'در حال دریافت...' : 'تازه‌سازی کاربران'}
        </button>
      </div>

      <div className="admin-user-search-wrap" style={{ marginBottom: '14px' }}>
        <SearchBar
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          onClear={() => setUserSearch('')}
          placeholder="جستجوی کاربر با نام، ایمیل، شناسه یا اسلاگ پورتفو..."
        />
      </div>

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>کاربر</th>
              <th>ایمیل</th>
              <th>نقش</th>
              <th>لینک اشتراک</th>
              <th>آخرین ورود</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>
                  <EmptyState
                    title={loadingUsers ? 'در حال دریافت اطلاعات کاربران...' : 'هیچ کاربری با این مشخصات یافت نشد.'}
                    description={userSearch ? `کاربری با عبارت "${userSearch}" پیدا نشد.` : null}
                    action={
                      userSearch ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '12px', padding: '6px 14px' }}
                          onClick={() => setUserSearch('')}
                        >
                          پاک‌کردن فیلتر جستجو
                        </button>
                      ) : null
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredUsers.map((u, idx) => (
                <tr key={u.id || idx}>
                  <td>
                    <div className="user-cell">
                      <img
                        src={u.picture || ''}
                        alt={u.name || ''}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div>
                        <strong>{u.customName || u.name || '-'}</strong>
                        {u.customName && u.name && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({u.name})</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ direction: 'ltr', textAlign: 'right' }}>{u.email}</td>
                  <td>
                    {u.role === 'admin' ? (
                      <span className="role-tag admin">مدیر کل</span>
                    ) : (
                      <span className="role-tag user">کاربر عادی</span>
                    )}
                  </td>
                  <td>
                    {u.shareSlug ? (
                      <span className={`share-badge ${u.shareEnabled ? 'active' : 'disabled'}`}>
                        {u.shareEnabled ? 'فعال' : 'خصوصی'}: {u.shareSlug}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                    )}
                  </td>
                  <td>{formatPersianDate(u.lastLogin)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* ─── Global Fallback Settings & Calculations ───────────────────────── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <form onSubmit={handleSave}>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* ─── Brand Identity & Color Standards (هویت بصری و استانداردهای رنگی) */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <div className="section-title">
          <span>
            <Palette size={16} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline', color: selectedPrimary }} />
            هویت بصری و استانداردهای رنگی سامانه (Color Standards & Branding)
          </span>
        </div>

        <div className="admin-theme-config-panel" style={{
          background: 'rgba(255, 255, 255, 0.025)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-lg, 16px)',
          padding: '22px',
          marginBottom: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '22px'
        }}>
          {/* Preset Color Swatches */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <label style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-heading)' }}>
                پالت‌های استاندارد سازمانی (Color Presets)
              </label>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                کلیک روی هر پالت، تم را به صورت پیش‌نمایش زنده در برنامه فعال می‌کند
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '12px' }}>
              {COLOR_PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '11px 13px',
                      background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? `2px solid ${preset.primary}` : '1px solid var(--border-control)',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? `0 0 16px ${preset.primary}44` : 'none',
                      textAlign: 'right'
                    }}
                  >
                    <span style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${preset.primary}, ${preset.accent})`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                    }}>
                      {isSelected && <Check size={14} strokeWidth={3} />}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '13px', fontWeight: isSelected ? 800 : 600, color: 'var(--text-primary)' }}>
                        {preset.name}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', direction: 'ltr' }}>
                        {preset.primary}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Color Controls (4-dimension Design System) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', paddingTop: '16px', borderTop: '1px solid var(--border-medium)' }}>
            {/* 1. Primary Color */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selectedPrimary }} />
                رنگ اصلی برند (Primary)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={selectedPrimary.startsWith('#') ? selectedPrimary : '#0284c7'}
                  onChange={(e) => handleCustomPrimaryChange(e.target.value)}
                  style={{ width: '42px', height: '38px', padding: '2px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border-control)' }}
                />
                <input
                  type="text"
                  value={selectedPrimary}
                  onChange={(e) => handleCustomPrimaryChange(e.target.value)}
                  placeholder="#0284c7"
                  style={{ direction: 'ltr', fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                دکمه‌های اصلی، تب‌های فعال و فوکوس
              </span>
            </div>

            {/* 2. Accent & Highlight Color */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selectedAccent }} />
                متون هایلایت و اکسنت (Accent)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={selectedAccent.startsWith('#') ? selectedAccent : '#38bdf8'}
                  onChange={(e) => handleCustomAccentChange(e.target.value)}
                  style={{ width: '42px', height: '38px', padding: '2px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border-control)' }}
                />
                <input
                  type="text"
                  value={selectedAccent}
                  onChange={(e) => handleCustomAccentChange(e.target.value)}
                  placeholder="#38bdf8"
                  style={{ direction: 'ltr', fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                تیتر بخش‌ها (متن‌های شاخص)، آیکون‌ها و بج‌ها
              </span>
            </div>

            {/* 3. Border Color */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selectedBorder }} />
                رنگ حاشیه‌ها و کادرها (Border)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={selectedBorder.startsWith('#') ? selectedBorder : '#1e293b'}
                  onChange={(e) => handleCustomBorderChange(e.target.value)}
                  style={{ width: '42px', height: '38px', padding: '2px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border-control)' }}
                />
                <input
                  type="text"
                  value={selectedBorder}
                  onChange={(e) => handleCustomBorderChange(e.target.value)}
                  placeholder="#1e293b"
                  style={{ direction: 'ltr', fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                خط دور یکپارچه تمام کارت‌ها و نوار تب‌ها
              </span>
            </div>

            {/* 4. Card & Container Background */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: selectedCardBg }} />
                پس‌زمینه کارت‌ها و تب‌ها (Card Bg)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={selectedCardBg.startsWith('#') ? selectedCardBg : '#0d131f'}
                  onChange={(e) => handleCustomCardBgChange(e.target.value)}
                  style={{ width: '42px', height: '38px', padding: '2px', borderRadius: '8px', cursor: 'pointer', border: '1px solid var(--border-control)' }}
                />
                <input
                  type="text"
                  value={selectedCardBg}
                  onChange={(e) => handleCustomCardBgChange(e.target.value)}
                  placeholder="#0d131f"
                  style={{ direction: 'ltr', fontFamily: 'monospace', fontWeight: 700, fontSize: '13px' }}
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                پس‌زمینه سطوح کارت‌ها و داک شناور تب‌ها
              </span>
            </div>
          </div>

          {/* Live Component Preview */}
          <div style={{
            background: selectedCardBg,
            border: `1px solid ${selectedBorder}`,
            borderRadius: '16px',
            padding: '18px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxShadow: 'var(--card-shadow)',
            transition: 'all 0.2s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Sparkles size={14} style={{ color: selectedPrimary }} />
                پیش‌نمایش زنده المان‌ها و استانداردهای رنگی سامانه (Live Preview):
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} style={{ color: selectedAccent }} />
                بوردر تب و کارت کاملاً یکسان هستند
              </span>
            </div>

            {/* Live Section Heading Demo (Orange text fix) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontSize: '13.5px',
              fontWeight: 800,
              color: selectedAccent,
              paddingBottom: '8px',
              borderBottom: `1px dashed ${selectedBorder}`
            }}>
              <BarChart3 size={15} style={{ verticalAlign: 'middle' }} />
              <span>عنوان بخش / متن شاخص (تکست‌های هایلایت با رنگ ثانویه: {selectedAccent})</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              {/* Primary Button */}
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  padding: '9px 20px',
                  fontSize: '13px',
                  pointerEvents: 'none',
                  background: `linear-gradient(135deg, ${selectedPrimary} 0%, ${shadeColor(selectedPrimary, -18)} 100%)`,
                  color: `${getContrastColor(selectedPrimary)} !important`,
                  border: `1px solid ${selectedPrimary}66`,
                  boxShadow: `0 4px 16px ${selectedPrimary}44`
                }}
              >
                دکمه اکشن اصلی (Primary Button)
              </button>

              {/* Segmented Tab Dock */}
              <div
                className="ui-filter-pills variant-segmented size-md"
                style={{
                  pointerEvents: 'none',
                  background: selectedCardBg,
                  border: `1px solid ${selectedBorder}`
                }}
              >
                <button
                  type="button"
                  className="filter-pill-btn active"
                  style={{
                    pointerEvents: 'none',
                    background: `linear-gradient(135deg, ${selectedPrimary} 0%, ${shadeColor(selectedPrimary, -18)} 100%)`,
                    color: `${getContrastColor(selectedPrimary)} !important`,
                    boxShadow: `0 4px 16px ${selectedPrimary}44`
                  }}
                >
                  تب فعال سیستم
                </button>
                <button type="button" className="filter-pill-btn" style={{ pointerEvents: 'none' }}>
                  تب عادی
                </button>
              </div>

              {/* Accent Badge */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 13px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                background: `${selectedAccent}22`,
                color: selectedAccent,
                border: `1px solid ${selectedAccent}55`
              }}>
                بج هایلایت فعال
              </span>
            </div>
          </div>
        </div>


        <div className="section-title">
          <span>
            <Sliders size={15} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
            تنظیمات قیمت و انس عمومی (Fallback و محاسبات پایه)
          </span>
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label htmlFor="adminUsdToman">قیمت پیش‌فرض دلار (تومان)</label>
            <input
              type="number"
              id="adminUsdToman"
              value={usdToman}
              onChange={(e) => setUsdToman(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="adminGoldUsd">پیش‌فرض انس طلا ($)</label>
            <input
              type="number"
              id="adminGoldUsd"
              value={goldUsd}
              onChange={(e) => setGoldUsd(e.target.value)}
            />
          </div>
        </div>

        <div className="section-title">
          <span>
            <Coins size={15} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
            تنظیم درصد حباب مصوب سکه‌ها
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="adminBubbleFull">درصد حباب مصوب سکه تمام (٪)</label>
          <input
            type="number"
            id="adminBubbleFull"
            step="0.5"
            value={bubbleFull}
            onChange={(e) => setBubbleFull(e.target.value)}
          />
        </div>

        <div className="grid-2">
          <div className="form-group">
            <label htmlFor="adminBubbleHalf">حباب مصوب نیم سکه (٪)</label>
            <input
              type="number"
              id="adminBubbleHalf"
              step="0.5"
              value={bubbleHalf}
              onChange={(e) => setBubbleHalf(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="adminBubbleQuarter">حباب مصوب ربع سکه (٪)</label>
            <input
              type="number"
              id="adminBubbleQuarter"
              step="0.5"
              value={bubbleQuarter}
              onChange={(e) => setBubbleQuarter(e.target.value)}
            />
          </div>
        </div>

        <div className="section-title">
          <span>
            <Megaphone size={15} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
            پیام عمومی سیستم
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="adminAnnouncement">
            پیام یا اطلاعیه بالای سایت (در صورت خالی بودن نمایش داده نمی‌شود)
          </label>
          <textarea
            id="adminAnnouncement"
            rows="2"
            placeholder="متن پیام عمومی را وارد کنید..."
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary btn-admin-submit" disabled={saving}>
          <Save size={16} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
          <span>{saving ? 'در حال ذخیره‌سازی...' : 'ذخیره کلیه تغییرات'}</span>
        </button>
      </form>
    </Card>
  );
}

