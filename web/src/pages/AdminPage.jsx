import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Ban,
  RefreshCw,
  Home,
  BarChart3,
  Users,
  Share2,
  Sliders,
  Coins,
  Megaphone,
  Save,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  apiAdminStats,
  apiAdminUsers,
  apiAdminSaveSettings,
  apiGetPrices,
} from '../api/client.js';
import AppLayout from '../components/ui/AppLayout.jsx';
import AlertBanner from '../components/ui/AlertBanner.jsx';
import MiniCard from '../components/ui/MiniCard.jsx';
import SearchBar from '../components/ui/SearchBar.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';

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
          <Button
            variant="secondary"
            size="lg"
            onClick={triggerLogin}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
            }
          >
            ورود به مدیریت با گوگل
          </Button>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
            <ShieldCheck size={14} style={{ verticalAlign: 'middle', marginLeft: '4px', display: 'inline' }} />
            احراز هویت اختصاصی بر اساس متغیر محیطی ADMIN_EMAIL
          </p>
          <Link to="/" style={{ marginTop: '12px', display: 'inline-block' }}>
            <Button variant="ghost" size="sm">
              بازگشت به صفحه اصلی سایت
            </Button>
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
            <Button variant="danger" size="sm" onClick={logout} icon={<RefreshCw size={13} />}>
              خروج و تعویض حساب گوگل
            </Button>
            <Link to="/">
              <Button variant="secondary" size="sm" icon={<Home size={13} />}>
                بازگشت به سایت
              </Button>
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
        <Button variant="ghost" size="sm" onClick={loadStats} loading={loadingStats} icon={<RefreshCw size={11} />}>
          بروزرسانی
        </Button>
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
        <Button variant="ghost" size="sm" onClick={loadUsers} loading={loadingUsers} icon={<RefreshCw size={11} />}>
          تازه‌سازی کاربران
        </Button>
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
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setUserSearch('')}
                        >
                          پاک‌کردن فیلتر جستجو
                        </Button>
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
      <form onSubmit={handleSave} style={{ marginTop: '28px' }}>
        <div className="section-title">
          <span>
            <Sliders size={15} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
            تنظیمات قیمت و انس عمومی (Fallback و محاسبات پایه)
          </span>
        </div>

        <div className="grid-2">
          <Input
            id="adminUsdToman"
            type="number"
            label="قیمت پیش‌فرض دلار (تومان)"
            value={usdToman}
            onChange={(e) => setUsdToman(e.target.value)}
          />

          <Input
            id="adminGoldUsd"
            type="number"
            label="پیش‌فرض انس طلا ($)"
            value={goldUsd}
            onChange={(e) => setGoldUsd(e.target.value)}
          />
        </div>

        <div className="section-title">
          <span>
            <Coins size={15} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
            تنظیم درصد حباب مصوب سکه‌ها
          </span>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <Input
            id="adminBubbleFull"
            type="number"
            step="0.5"
            label="درصد حباب مصوب سکه تمام (٪)"
            value={bubbleFull}
            onChange={(e) => setBubbleFull(e.target.value)}
          />
        </div>

        <div className="grid-2">
          <Input
            id="adminBubbleHalf"
            type="number"
            step="0.5"
            label="حباب مصوب نیم سکه (٪)"
            value={bubbleHalf}
            onChange={(e) => setBubbleHalf(e.target.value)}
          />

          <Input
            id="adminBubbleQuarter"
            type="number"
            step="0.5"
            label="حباب مصوب ربع سکه (٪)"
            value={bubbleQuarter}
            onChange={(e) => setBubbleQuarter(e.target.value)}
          />
        </div>

        <div className="section-title">
          <span>
            <Megaphone size={15} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
            پیام عمومی سیستم
          </span>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Input
            as="textarea"
            id="adminAnnouncement"
            rows={2}
            label="پیام یا اطلاعیه بالای سایت (در صورت خالی بودن نمایش داده نمی‌شود)"
            placeholder="متن پیام عمومی را وارد کنید..."
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
          />
        </div>

        <Button type="submit" variant="primary" size="lg" block loading={saving} icon={<Save size={16} />}>
          ذخیره کلیه تغییرات
        </Button>
      </form>
    </Card>
  );
}
