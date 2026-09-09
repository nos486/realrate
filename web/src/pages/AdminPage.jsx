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
  CheckCircle2,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext.jsx';
import {
  apiAdminStats,
  apiAdminUsers,
  apiAdminSaveSettings,
  apiGetRates,
} from '@/api/client.js';

import { Button } from '@/components/ui/button.jsx';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card.jsx';
import { Input, Textarea, Label } from '@/components/ui/input.jsx';
import { Badge } from '@/components/ui/badge.jsx';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table.jsx';
import { cn } from '@/lib/utils.js';

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

  // USD source settings
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

      apiGetRates()
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
    } catch (err) {
      showMsg('خطا در ارتباط با سرور: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app text-primary">
        <div className="text-center">
          <RefreshCw size={32} className="animate-spin text-amber-500 mx-auto mb-3" />
          <p className="text-xs text-slate-400">در حال بررسی دسترسی مدیریت...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-app text-primary">
        <Card className="max-w-md w-full p-8 text-center border-white/10 shadow-2xl">
          <div className="mb-6 flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-3">
              <ShieldCheck size={28} />
            </div>
            <h2 className="text-lg font-bold text-white light:text-slate-900">
              ورود به پنل مدیریت RealRate
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              جهت ورود، لطفاً با حساب گوگل تعیین‌شده برای مدیر وارد شوید.
            </p>
          </div>

          <button
            onClick={triggerLogin}
            className="w-full flex items-center justify-center gap-3 h-11 px-4 rounded-xl font-medium text-sm text-slate-900 bg-white hover:bg-slate-100 active:scale-[0.98] transition-all shadow-md cursor-pointer select-none"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>ورود به مدیریت با گوگل</span>
          </button>

          <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">
            احراز هویت بر اساس شناسه متغیر محیطی <code className="text-amber-400">ADMIN_EMAIL</code> کنترل می‌شود.
          </p>

          <div className="mt-6 pt-4 border-t border-white/5 light:border-slate-100">
            <Link to="/">
              <Button variant="ghost" size="sm" className="text-xs">
                <Home size={14} className="ms-1" />
                <span>بازگشت به صفحه اصلی</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Logged in but not admin
  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-app text-primary">
        <Card className="max-w-md w-full p-8 text-center border-white/10 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 mx-auto mb-3">
            <Ban size={28} />
          </div>
          <h3 className="text-base font-bold text-rose-400 mb-2">عدم دسترسی مدیریت</h3>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            شما با حساب گوگل{' '}
            <strong className="text-white light:text-slate-900 font-mono dir-ltr inline-block">
              {user.email}
            </strong>{' '}
            وارد شده‌اید، اما این حساب مجاز به دسترسی به پنل مدیریت نیست.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="destructive" size="sm" onClick={logout}>
              <RefreshCw size={13} className="ms-1" />
              <span>خروج و تعویض حساب</span>
            </Button>
            <Link to="/">
              <Button variant="outline" size="sm">
                <Home size={13} className="ms-1" />
                <span>بازگشت به سایت</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app text-primary py-8 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        {/* Header */}
        <div className="text-center flex flex-col items-center gap-1.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-1">
            <ShieldCheck size={14} />
            <span>پنل مدیریت سیستم RealRate</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white light:text-slate-900 tracking-tight">
            مدیریت، نرخ‌های پایه و مانیتورینگ سیستم
          </h1>
          <p className="text-xs text-slate-400 light:text-slate-500">
            پیکربندی نرخ‌های پیش‌فرض، انس طلا، درصد حباب سکه‌ها و پایش آمار کاربران
          </p>
        </div>

        {/* Global Alert Notification */}
        {msg.text && (
          <div
            className={cn(
              'flex items-center gap-2.5 p-3.5 rounded-xl text-xs font-semibold animate-in fade-in duration-200',
              msg.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
            )}
          >
            {msg.type === 'success' ? (
              <CheckCircle2 size={16} className="shrink-0" />
            ) : (
              <AlertCircle size={16} className="shrink-0" />
            )}
            <span>{msg.text}</span>
          </div>
        )}

        {/* Admin Profile & Navigation Bar */}
        <div className="p-4 rounded-2xl border border-white/10 bg-[#0c1018]/90 light:bg-white light:border-slate-200 shadow-md flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* User Info */}
            <div className="flex items-center gap-3">
              <img
                className="w-10 h-10 rounded-full border-2 border-amber-500/80 object-cover bg-slate-800"
                src={user.picture || ''}
                alt={user.name || ''}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-bold text-white light:text-slate-900">
                    {user.name || 'مدیر سیستم'}
                  </strong>
                  <Badge variant="gold" className="text-[10px] py-0 px-1.5">مدیر کل</Badge>
                </div>
                <span className="text-xs text-slate-400 font-mono dir-ltr text-start">
                  {user.email}
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-xl border border-white/5 light:bg-slate-100 light:border-slate-200">
              <Link
                to="/admin"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 shadow-sm transition-colors"
              >
                <Users size={14} />
                <span>داشبورد عمومی</span>
              </Link>
              <Link
                to="/admin/sources"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5 light:text-slate-600 light:hover:text-slate-900 transition-colors"
              >
                <Radio size={14} />
                <span>سورس‌ها و نمودارها</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link to="/">
              <Button variant="outline" size="sm" title="مشاهده سایت">
                <span>مشاهده سایت</span>
                <ExternalLink size={12} className="me-1" />
              </Button>
            </Link>
            <Button variant="destructive" size="sm" onClick={logout}>
              خروج
            </Button>
          </div>
        </div>

        {/* Live Stats */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 light:text-slate-700 flex items-center gap-1.5">
              <BarChart3 size={15} className="text-sky-400" />
              <span>آمار و آنالیتیکس سیستم (Cloudflare KV)</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={loadStats}
              isLoading={loadingStats}
              className="h-7 px-2.5 text-xs"
            >
              <RefreshCw size={11} className={loadingStats ? 'animate-spin' : ''} />
              <span>{loadingStats ? 'در حال دریافت...' : 'بروزرسانی'}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="p-5 flex items-center justify-between border-white/10">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Users size={14} className="text-sky-400" />
                  <span>کاربران ثبت‌نام شده</span>
                </span>
                <span className="text-2xl font-black text-sky-400">
                  {stats?.registeredUsers?.toLocaleString('fa-IR') || users.length.toLocaleString('fa-IR')}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Users size={24} />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border-white/10">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Share2 size={14} className="text-emerald-400" />
                  <span>پورتفوهای عمومی فعال</span>
                </span>
                <span className="text-2xl font-black text-emerald-400">
                  {users.filter((u) => u.shareEnabled).length.toLocaleString('fa-IR')}
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Share2 size={24} />
              </div>
            </Card>
          </div>
        </section>

        {/* Registered Users Table */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-300 light:text-slate-700 flex items-center gap-1.5">
              <Users size={15} className="text-amber-500" />
              <span>جدول کاربران ({filteredUsers.length.toLocaleString('fa-IR')} کاربر)</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={loadUsers}
              isLoading={loadingUsers}
              className="h-7 px-2.5 text-xs"
            >
              <RefreshCw size={11} className={loadingUsers ? 'animate-spin' : ''} />
              <span>{loadingUsers ? 'در حال دریافت...' : 'تازه‌سازی کاربران'}</span>
            </Button>
          </div>

          {/* Search Box */}
          <div className="relative w-full">
            <div className="absolute inset-y-0 start-0 flex items-center ps-3.5 pointer-events-none text-slate-400">
              <Search size={15} />
            </div>
            <Input
              type="text"
              placeholder="جستجوی کاربر با نام، ایمیل، شناسه یا اسلاگ پورتفو..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="ps-10 pe-10"
            />
            {userSearch && (
              <button
                type="button"
                onClick={() => setUserSearch('')}
                className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-400 hover:text-white"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Table Container */}
          <div className="rounded-2xl border border-white/10 bg-[#0c1018]/90 overflow-hidden shadow-xl light:bg-white light:border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کاربر</TableHead>
                  <TableHead>ایمیل</TableHead>
                  <TableHead>نقش</TableHead>
                  <TableHead>لینک اشتراک</TableHead>
                  <TableHead>آخرین ورود</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-slate-400">
                      {loadingUsers ? 'در حال دریافت اطلاعات کاربران...' : 'هیچ کاربری با این مشخصات یافت نشد.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((u, idx) => (
                    <TableRow key={u.id || idx}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <img
                            src={u.picture || ''}
                            alt={u.name || ''}
                            className="w-8 h-8 rounded-full object-cover bg-slate-800"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <div className="flex flex-col">
                            <strong className="text-xs font-bold text-white light:text-slate-900">
                              {u.customName || u.name || '-'}
                            </strong>
                            {u.customName && u.name && (
                              <span className="text-[10px] text-slate-400">({u.name})</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-300 light:text-slate-700 dir-ltr block text-start">
                          {u.email}
                        </span>
                      </TableCell>
                      <TableCell>
                        {u.role === 'admin' ? (
                          <Badge variant="gold">مدیر کل</Badge>
                        ) : (
                          <Badge variant="outline">کاربر عادی</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.shareSlug ? (
                          <Badge variant={u.shareEnabled ? 'success' : 'default'} className="font-mono text-[11px]">
                            {u.shareEnabled ? 'فعال' : 'خصوصی'}: {u.shareSlug}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-500">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-slate-400">
                          {formatPersianDate(u.lastLogin)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Global Fallback Settings & Calculations Form */}
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          <Card className="p-6 border-white/10 flex flex-col gap-4">
            <CardHeader className="p-0 pb-2 border-b border-white/5 light:border-slate-100">
              <CardTitle className="text-sm">
                <Sliders size={16} className="text-amber-500" />
                <span>تنظیمات قیمت و انس عمومی (Fallback و محاسبات پایه)</span>
              </CardTitle>
            </CardHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adminUsdToman">قیمت پیش‌فرض دلار (تومان):</Label>
                <Input
                  type="number"
                  id="adminUsdToman"
                  value={usdToman}
                  onChange={(e) => setUsdToman(e.target.value)}
                  className="dir-ltr text-center font-bold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adminGoldUsd">پیش‌فرض انس طلا ($):</Label>
                <Input
                  type="number"
                  id="adminGoldUsd"
                  value={goldUsd}
                  onChange={(e) => setGoldUsd(e.target.value)}
                  className="dir-ltr text-center font-bold"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-white/10 flex flex-col gap-4">
            <CardHeader className="p-0 pb-2 border-b border-white/5 light:border-slate-100">
              <CardTitle className="text-sm">
                <Coins size={16} className="text-amber-500" />
                <span>تنظیم درصد حباب مصوب سکه‌ها</span>
              </CardTitle>
            </CardHeader>

            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adminBubbleFull">درصد حباب مصوب سکه تمام (٪):</Label>
                <Input
                  type="number"
                  id="adminBubbleFull"
                  step="0.5"
                  value={bubbleFull}
                  onChange={(e) => setBubbleFull(e.target.value)}
                  className="dir-ltr text-center font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adminBubbleHalf">حباب مصوب نیم سکه (٪):</Label>
                  <Input
                    type="number"
                    id="adminBubbleHalf"
                    step="0.5"
                    value={bubbleHalf}
                    onChange={(e) => setBubbleHalf(e.target.value)}
                    className="dir-ltr text-center font-bold"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="adminBubbleQuarter">حباب مصوب ربع سکه (٪):</Label>
                  <Input
                    type="number"
                    id="adminBubbleQuarter"
                    step="0.5"
                    value={bubbleQuarter}
                    onChange={(e) => setBubbleQuarter(e.target.value)}
                    className="dir-ltr text-center font-bold"
                  />
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-white/10 flex flex-col gap-4">
            <CardHeader className="p-0 pb-2 border-b border-white/5 light:border-slate-100">
              <CardTitle className="text-sm">
                <Megaphone size={16} className="text-amber-500" />
                <span>پیام عمومی سیستم</span>
              </CardTitle>
            </CardHeader>

            <div className="flex flex-col gap-1.5 pt-2">
              <Label htmlFor="adminAnnouncement">
                پیام یا اطلاعیه بالای سایت (در صورت خالی بودن نمایش داده نمی‌شود):
              </Label>
              <Textarea
                id="adminAnnouncement"
                rows={3}
                placeholder="متن پیام یا اطلاعیه عمومی را بنویسید..."
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
              />
            </div>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={saving}
              isLoading={saving}
              className="w-full sm:w-auto px-8"
            >
              <Save size={16} />
              <span>{saving ? 'در حال ذخیره‌سازی...' : 'ذخیره کلیه تغییرات'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
