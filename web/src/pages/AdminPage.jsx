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
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  apiAdminStats,
  apiAdminUsers,
  apiAdminSaveSettings,
  apiAdminTestUsdSource,
  apiGetPrices,
} from '../api/client.js';


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

export default function AdminPage() {
  const { user, loading, triggerLogin, logout } = useAuth();

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
      });

      if (res.success) {
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
    return (
      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
        در حال بررسی دسترسی...
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="admin-container" style={{ margin: '40px auto' }}>
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
      </div>
    );
  }

  // Logged in but not admin
  if (user.role !== 'admin') {
    return (
      <div className="admin-container" style={{ margin: '40px auto' }}>
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
      </div>
    );
  }

  return (
    <div className="admin-container" style={{ margin: '20px auto' }}>
      {/* Header */}
      <div className="admin-header">
        <h2>پنل مدیریت RealRate</h2>
        <p>تنظیمات قیمت، انس و پایش کاربران سیستم</p>
      </div>

      {msg.text && (
        <div className={`msg-box ${msg.type}`} style={{ display: 'block' }}>
          {msg.text}
        </div>
      )}

      {/* Admin Profile Bar */}
      <div className="admin-profile-bar admin-nav-header-bar">
        <div className="admin-nav-brand-group">
          <div className="admin-user-info">
            <img
              className="admin-avatar"
              src={user.picture || ''}
              alt={user.name}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <strong style={{ fontSize: '13px', color: 'var(--text-heading)' }}>{user.name || 'مدیر سیستم'}</strong>
                <span className="admin-role-badge">مدیر کل</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', direction: 'ltr', display: 'block' }}>
                {user.email}
              </span>
            </div>
          </div>

          {/* Admin Navigation Tabs */}
          <nav className="admin-nav-tabs">
            <Link to="/admin" className="admin-nav-tab active">
              <Users size={14} />
              <span>داشبورد عمومی و کاربران</span>
            </Link>
            <Link to="/admin/sources" className="admin-nav-tab">
              <Radio size={14} />
              <span>مدیریت سورس‌ها و نمودار قیمت</span>
            </Link>
          </nav>
        </div>

        <div className="admin-actions">
          <Link to="/" className="btn-sm site-link" title="مشاهده سایت">
            <span>مشاهده سایت</span>
            <ExternalLink size={12} style={{ marginRight: '4px' }} />
          </Link>
          <button className="btn-sm logout" onClick={logout}>خروج</button>
        </div>
      </div>

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
        <div className="stat-card">
          <span className="stat-card-title">
            <Users size={13} style={{ verticalAlign: 'middle', marginLeft: '5px', display: 'inline' }} />
            کاربران ثبت‌نام شده
          </span>
          <span className="stat-card-val blue">
            {stats?.registeredUsers?.toLocaleString('fa-IR') || users.length.toLocaleString('fa-IR')}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-card-title">
            <Share2 size={13} style={{ verticalAlign: 'middle', marginLeft: '5px', display: 'inline' }} />
            پورتفوهای عمومی فعال
          </span>
          <span className="stat-card-val green">
            {users.filter((u) => u.shareEnabled).length.toLocaleString('fa-IR')}
          </span>
        </div>
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
        <div className="search-box">
          <Search size={15} strokeWidth={2} />
          <input
            type="text"
            placeholder="جستجوی کاربر با نام، ایمیل، شناسه یا اسلاگ پورتفو..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
          />
          {userSearch && (
            <button className="clear-search-btn" onClick={() => setUserSearch('')}>
              <X size={14} strokeWidth={2.2} />
            </button>
          )}
        </div>
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
                <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '18px' }}>
                  {loadingUsers ? 'در حال دریافت اطلاعات کاربران...' : 'هیچ کاربری با این مشخصات یافت نشد.'}
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

        <button type="submit" className="btn" disabled={saving}>
          <Save size={16} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
          <span>{saving ? 'در حال ذخیره‌سازی...' : 'ذخیره کلیه تغییرات'}</span>
        </button>
      </form>


    </div>
  );
}
