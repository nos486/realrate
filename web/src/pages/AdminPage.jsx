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
  apiGetPriceSources,
  apiSavePriceSource,
  apiDeletePriceSource,
  apiSetPrimarySource,
  apiTestPriceSource,
  apiGetRates,
} from '../api/client.js';

const PRICE_TYPE_INFO = {
  usd: { label: 'دلار (USD)', badgeColor: 'blue' },
  gold_18k: { label: 'طلا ۱۸ عیار', badgeColor: 'gold' },
  full_coin: { label: 'سکه تمام بهار', badgeColor: 'amber' },
  half_coin: { label: 'نیم سکه بهار', badgeColor: 'orange' },
  quarter_coin: { label: 'ربع سکه بهار', badgeColor: 'rose' },
  mesghal: { label: 'مثقال طلا ۱۷ عیار', badgeColor: 'purple' },
};

const PRESET_REGEX_PATTERNS = {
  usd: [
    { label: 'عدد قبل از «فروش» (رایج در اکثر کانال‌های دلار)', pattern: '([\\d,]+)\\s*فروش' },
    { label: 'فروش : عدد (کانال‌های سبزه میدان و صرافی)', pattern: 'فروش\\s*:\\s*([\\d,]+)' },
    { label: 'دلار : عدد (کانال‌های تجمیعی نرخ ارز)', pattern: '(?:دلار|USD)[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
  gold_18k: [
    { label: '۱۸ عیار تا فروش : عدد (کانال زرما و طلا)', pattern: '(?:18|۱۸)\\s*عیار.*?فروش[:\\s]+([\\d,]+)' },
    { label: 'طلا ۱۸ عیار : عدد (فرمت ساده)', pattern: '(?:طلا|18\\s*عیار|۱۸\\s*عیار)[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
    { label: 'فروش : عدد (کانال‌های تک‌نرخی طلا)', pattern: 'فروش\\s*:\\s*([\\d,]+)' },
  ],
  full_coin: [
    { label: 'سکه تمام تا فروش : عدد (کانال زرما و بازار سکه)', pattern: '(?:سکه\\s*تمام|سکه\\s*امامی|تمام\\s*سکه).*?فروش[:\\s]+([\\d,]+)' },
    { label: 'سکه تمام : عدد (فرمت ساده صرافی)', pattern: '(?:سکه\\s*تمام|سکه\\s*امامی|تمام\\s*سکه)[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
  half_coin: [
    { label: 'نیم سکه تا فروش : عدد (کانال زرما و صرافی)', pattern: 'نیم\\s*سکه.*?فروش[:\\s]+([\\d,]+)' },
    { label: 'نیم سکه : عدد (فرمت ساده)', pattern: 'نیم\\s*سکه[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
  quarter_coin: [
    { label: 'ربع سکه تا فروش : عدد (کانال زرما و صرافی)', pattern: 'ربع\\s*سکه.*?فروش[:\\s]+([\\d,]+)' },
    { label: 'ربع سکه : عدد (فرمت ساده)', pattern: 'ربع\\s*سکه[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
  mesghal: [
    { label: 'مثقال/آبشده تا فروش : عدد (کانال زرما و آبشده)', pattern: '(?:مثقال|آبشده).*?فروش[:\\s]+([\\d,]+)' },
    { label: 'مثقال یا آبشده : عدد (فرمت ساده)', pattern: '(?:مثقال|آبشده)[^:\\d]*[:\\s\\-–]+([\\d,]+)' },
  ],
};


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

  // ─── Price Sources State & Handlers ─────────────────────────────────────────
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');

  const [showSourceModal, setShowSourceModal] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [sourceForm, setSourceForm] = useState({
    id: '',
    name: '',
    priceType: 'usd',
    sourceType: 'telegram',
    endpoint: '',
    regex: '',
    jsonPath: '',
    fetchIntervalSec: 60,
    isActive: true,
    isPrimary: false,
  });

  const [savingSource, setSavingSource] = useState(false);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState(null);
  const [rowTestingId, setRowTestingId] = useState(null);
  const [rowTestResults, setRowTestResults] = useState({});

  const loadSources = async () => {
    setLoadingSources(true);
    try {
      const data = await apiGetPriceSources();
      if (data.success && Array.isArray(data.sources)) {
        setSources(data.sources);
      }
    } catch (e) {
      console.error('Failed to load price sources:', e);
    } finally {
      setLoadingSources(false);
    }
  };

  const handleOpenAddSource = (defaultPriceType = 'usd') => {
    setEditingSourceId(null);
    setSourceForm({
      id: '',
      name: '',
      priceType: defaultPriceType,
      sourceType: 'telegram',
      endpoint: '',
      regex: '',
      jsonPath: '',
      fetchIntervalSec: 60,
      isActive: true,
      isPrimary: false,
    });
    setModalTestResult(null);
    setShowSourceModal(true);
  };

  const handleOpenEditSource = (src) => {
    setEditingSourceId(src.id);
    setSourceForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || 'usd',
      sourceType: src.sourceType || 'telegram',
      endpoint: src.endpoint || '',
      regex: src.regex || '',
      jsonPath: src.jsonPath || '',
      fetchIntervalSec: src.fetchIntervalSec || 60,
      isActive: Boolean(src.isActive),
      isPrimary: Boolean(src.isPrimary),
    });
    setModalTestResult(null);
    setShowSourceModal(true);
  };

  const handleSaveSourceForm = async (e) => {
    if (e) e.preventDefault();
    if (!sourceForm.name.trim() || !sourceForm.endpoint.trim()) {
      showMsg('نام سورس و آدرس endpoint الزامی هستند.', 'error');
      return;
    }

    setSavingSource(true);
    try {
      const res = await apiSavePriceSource(sourceForm);
      if (res.success) {
        showMsg(res.message || 'سورس قیمت با موفقیت ذخیره شد.', 'success');
        setShowSourceModal(false);
        loadSources();
      } else {
        showMsg(res.message || 'خطا در ذخیره سورس قیمت', 'error');
      }
    } catch (err) {
      showMsg('خطا در ارتباط با سرور: ' + err.message, 'error');
    } finally {
      setSavingSource(false);
    }
  };

  const handleDeleteSource = async (src) => {
    const ok = window.confirm(`آیا از حذف سورس قیمت «${src.name}» اطمینان دارید؟`);
    if (!ok) return;

    try {
      const res = await apiDeletePriceSource(src.id);
      if (res.success) {
        showMsg('سورس با موفقیت حذف شد.', 'success');
        loadSources();
      } else {
        showMsg(res.message || 'خطا در حذف سورس', 'error');
      }
    } catch (err) {
      showMsg('خطا در ارتباط با سرور: ' + err.message, 'error');
    }
  };

  const handleSetPrimary = async (src) => {
    try {
      const res = await apiSetPrimarySource(src.id, src.priceType);
      if (res.success) {
        showMsg(`سورس «${src.name}» به عنوان مرجع اصلی ${PRICE_TYPE_INFO[src.priceType]?.label || src.priceType} تعیین شد.`, 'success');
        loadSources();
      } else {
        showMsg(res.message || 'خطا در تعیین سورس مرجع', 'error');
      }
    } catch (err) {
      showMsg('خطا در ارتباط با سرور: ' + err.message, 'error');
    }
  };

  const handleToggleActive = async (src) => {
    try {
      const res = await apiSavePriceSource({
        ...src,
        isActive: !src.isActive,
      });
      if (res.success) {
        showMsg(`وضعیت سورس «${src.name}» بروز شد.`, 'success');
        loadSources();
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    }
  };

  const handleTestModalSource = async () => {
    setModalTesting(true);
    setModalTestResult(null);
    try {
      const res = await apiTestPriceSource(sourceForm);
      setModalTestResult(res);
    } catch (err) {
      setModalTestResult({
        success: false,
        error: 'خطا در اتصال به سورس: ' + err.message,
      });
    } finally {
      setModalTesting(false);
    }
  };

  const handleTestRowSource = async (src) => {
    setRowTestingId(src.id);
    try {
      const res = await apiTestPriceSource(src);
      setRowTestResults((prev) => ({ ...prev, [src.id]: res }));
      if (res.success && res.price) {
        setSources((prev) =>
          prev.map((s) =>
            s.id === src.id
              ? {
                  ...s,
                  lastPrice: res.price,
                  lastFetched: res.datetime || new Date().toISOString(),
                }
              : s
          )
        );
        showMsg(`قیمت با موفقیت استخراج و ذخیره شد: ${formatNum(res.price)} تومان`, 'success');
      }
    } catch (err) {
      setRowTestResults((prev) => ({
        ...prev,
        [src.id]: { success: false, error: err.message },
      }));
    } finally {
      setRowTestingId(null);
    }
  };

  const filteredSources = useMemo(() => {
    if (sourceFilter === 'all') return sources;
    return sources.filter((s) => s.priceType === sourceFilter);
  }, [sources, sourceFilter]);

  // Fetch initial data once admin user is confirmed
  useEffect(() => {
    if (user?.role === 'admin') {
      loadStats();
      loadUsers();
      loadSources();

      apiGetRates()
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
      {/* ─── Unified Price Sources Management (Telegram & API Feeds) ───────── */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Radio size={16} style={{ color: 'var(--accent-blue)' }} />
          <span>مدیریت یکپارچه سورس‌های قیمت بازار (تلگرام و وب‌سرویس API)</span>
          <span className="source-counter-badge">
            {sources.filter(s => s.isActive).length.toLocaleString('fa-IR')} از {sources.length.toLocaleString('fa-IR')} فعال
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={loadSources}
            className="btn-sm site-link"
            style={{ padding: '4px 10px', fontSize: '11px' }}
            title="تازه‌سازی لیست سورس‌ها"
          >
            <RefreshCw size={11} className={loadingSources ? 'spin-anim' : ''} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
            <span>بروزرسانی</span>
          </button>
          <Link
            to="/admin/sources"
            className="btn-sm site-link"
            style={{ padding: '5px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
            title="رفتن به صفحه اختصاصی سورس‌ها و نمودار تاریخچه قیمت"
          >
            <span>صفحه اختصاصی و نمودار</span>
            <ExternalLink size={12} />
          </Link>
          <button
            type="button"
            onClick={() => handleOpenAddSource(sourceFilter === 'all' ? 'usd' : sourceFilter)}
            className="btn-sm btn-primary-action"
            style={{ padding: '5px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>افزودن سورس جدید</span>
          </button>
        </div>
      </div>

      {/* Price Type Filter Pills */}
      <div className="sources-filter-bar">
        <button
          type="button"
          className={`filter-pill ${sourceFilter === 'all' ? 'active' : ''}`}
          onClick={() => setSourceFilter('all')}
        >
          <span>همه سورس‌ها</span>
          <span className="filter-count">{sources.length.toLocaleString('fa-IR')}</span>
        </button>
        {Object.entries(PRICE_TYPE_INFO).map(([key, info]) => {
          const count = sources.filter(s => s.priceType === key).length;
          return (
            <button
              key={key}
              type="button"
              className={`filter-pill ${sourceFilter === key ? 'active' : ''}`}
              onClick={() => setSourceFilter(key)}
            >
              <span>{info.label}</span>
              <span className="filter-count">{count.toLocaleString('fa-IR')}</span>
            </button>
          );
        })}
      </div>

      {/* Sources Table */}
      <div className="users-table-wrap" style={{ marginBottom: '24px' }}>
        <table className="users-table sources-table">
          <thead>
            <tr>
              <th>نام سورس و آدرس</th>
              <th>نوع قیمت</th>
              <th>پروتکل</th>
              <th>تنظیمات استخراج</th>
              <th>آخرین قیمت</th>
              <th>سورس مرجع</th>
              <th>وضعیت</th>
              <th style={{ textAlign: 'center' }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredSources.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  {loadingSources ? 'در حال دریافت لیست سورس‌ها...' : 'هیچ سورسی در این دسته‌بندی تعریف نشده است.'}
                </td>
              </tr>
            ) : (
              filteredSources.map((src) => {
                const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, badgeColor: 'blue' };
                const isRowTesting = rowTestingId === src.id;
                const rowResult = rowTestResults[src.id];

                return (
                  <React.Fragment key={src.id}>
                    <tr>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <strong style={{ fontSize: '13px', color: 'var(--text-heading)' }}>{src.name}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', direction: 'ltr', textAlign: 'right', fontFamily: 'monospace' }}>
                            {src.sourceType === 'api_url' ? (src.endpoint.length > 40 ? src.endpoint.slice(0, 40) + '...' : src.endpoint) : `@${src.endpoint.replace(/^@/, '')}`}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`price-type-tag ${typeInfo.badgeColor}`}>
                          {typeInfo.label}
                        </span>
                      </td>
                      <td>
                        <span className={`proto-tag ${src.sourceType === 'api_url' ? 'api' : 'telegram'}`}>
                          {src.sourceType === 'api_url' ? (
                            <>
                              <Globe size={11} />
                              <span>API وب</span>
                            </>
                          ) : (
                            <>
                              <Send size={11} />
                              <span>تلگرام</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          <span className="cfg-badge" title="بازه فراخوانی">
                            <Clock size={10} />
                            <span>{src.fetchIntervalSec || 60} ثانیه</span>
                          </span>
                          {src.regex ? (
                            <span className="cfg-badge regex" title={`Regex: ${src.regex}`}>
                              <Code size={10} />
                              <span>ریجکس سفارشی</span>
                            </span>
                          ) : null}
                          {src.jsonPath ? (
                            <span className="cfg-badge path" title={`JSON Path: ${src.jsonPath}`}>
                              <span>{src.jsonPath}</span>
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {src.lastPrice > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <strong style={{ color: 'var(--accent-green, #10b981)', fontSize: '13px' }}>
                              {formatNum(src.lastPrice)} <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>تومان</span>
                            </strong>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {formatPersianDate(src.lastFetched)}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>هنوز دریافت نشده</span>
                        )}
                      </td>
                      <td>
                        {src.isPrimary ? (
                          <span className="primary-source-badge">
                            <Star size={12} fill="#eab308" color="#eab308" />
                            <span>مرجع اصلی</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn-set-primary"
                            onClick={() => handleSetPrimary(src)}
                            title="تعیین به عنوان مرجع اصلی برای این نرخ"
                          >
                            <Star size={11} />
                            <span>تعیین مرجع</span>
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`status-toggle-btn ${src.isActive ? 'active' : 'inactive'}`}
                          onClick={() => handleToggleActive(src)}
                          title={src.isActive ? 'کلیک جهت غیرفعال‌سازی' : 'کلیک جهت فعال‌سازی'}
                        >
                          <span className="status-dot" />
                          <span>{src.isActive ? 'فعال' : 'غیرفعال'}</span>
                        </button>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn-action-icon test"
                            onClick={() => handleTestRowSource(src)}
                            disabled={isRowTesting}
                            title="تست اتصال زنده"
                          >
                            {isRowTesting ? <RefreshCw size={12} className="spin-anim" /> : <PlayCircle size={13} />}
                          </button>
                          <button
                            type="button"
                            className="btn-action-icon edit"
                            onClick={() => handleOpenEditSource(src)}
                            title="ویرایش تنظیمات"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn-action-icon delete"
                            onClick={() => handleDeleteSource(src)}
                            title="حذف سورس"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Inline Test Result Row if tested */}
                    {rowResult && (
                      <tr className="test-result-subrow">
                        <td colSpan="8" style={{ padding: '6px 12px' }}>
                          <div className={`row-test-box ${rowResult.success ? 'success' : 'error'}`}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {rowResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                              <span>{rowResult.message || rowResult.error}</span>
                            </div>
                            {rowResult.success && (
                              <span style={{ fontSize: '11px', color: 'var(--text-heading)', fontWeight: 700 }}>
                                قیمت: {formatNum(rowResult.price)} تومان
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ─── Add / Edit Source Modal Dialog ─────────────────────────────────── */}
      {showSourceModal && (
        <div className="admin-modal-backdrop" onClick={() => setShowSourceModal(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={18} style={{ color: 'var(--accent-blue)' }} />
                <h3>{editingSourceId ? 'ویرایش سورس قیمت' : 'تعریف سورس قیمت جدید'}</h3>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowSourceModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSourceForm} className="admin-modal-body">
              <div className="grid-2">
                <div className="form-group">
                  <label htmlFor="modalSourceName">نام نمایشی سورس</label>
                  <input
                    type="text"
                    id="modalSourceName"
                    placeholder="مثال: دلار سبزه میدان یا API نوبیتکس"
                    value={sourceForm.name}
                    onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="modalPriceType">نوع قیمت (کالای مرجع)</label>
                  <select
                    id="modalPriceType"
                    value={sourceForm.priceType}
                    onChange={(e) => setSourceForm({ ...sourceForm, priceType: e.target.value })}
                  >
                    {Object.entries(PRICE_TYPE_INFO).map(([key, info]) => (
                      <option key={key} value={key}>{info.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Source Type Selector Tabs */}
              <div className="form-group" style={{ marginTop: '6px' }}>
                <label>نوع پروتکل استخراج</label>
                <div className="source-type-tabs">
                  <button
                    type="button"
                    className={`source-type-tab ${sourceForm.sourceType === 'telegram' ? 'active' : ''}`}
                    onClick={() => { setSourceForm({ ...sourceForm, sourceType: 'telegram' }); setModalTestResult(null); }}
                  >
                    <Send size={13} />
                    <span>کانال تلگرام عمومی</span>
                  </button>
                  <button
                    type="button"
                    className={`source-type-tab ${sourceForm.sourceType === 'api_url' ? 'active' : ''}`}
                    onClick={() => { setSourceForm({ ...sourceForm, sourceType: 'api_url' }); setModalTestResult(null); }}
                  >
                    <Globe size={13} />
                    <span>وب‌سرویس خارجی (API URL)</span>
                  </button>
                </div>
              </div>

              {/* Endpoint */}
              <div className="form-group" style={{ marginTop: '8px' }}>
                <label htmlFor="modalEndpoint">
                  {sourceForm.sourceType === 'api_url' ? 'آدرس وب‌سرویس API (URL با پاسخ JSON)' : 'نام کاربری یا لینک کانال/پست تلگرام'}
                </label>
                <input
                  type={sourceForm.sourceType === 'api_url' ? 'url' : 'text'}
                  id="modalEndpoint"
                  dir="ltr"
                  placeholder={sourceForm.sourceType === 'api_url' ? 'https://api.nobitex.ir/market/stats' : 'tahran_sabza یا zarmagoldd یا https://t.me/channel/123'}
                  value={sourceForm.endpoint}
                  onChange={(e) => setSourceForm({ ...sourceForm, endpoint: e.target.value })}
                  required
                />
                <span className="source-hint">
                  {sourceForm.sourceType === 'api_url'
                    ? 'آدرس معتبر وب‌سرویس که پاسخی با فرمت JSON بازگرداند.'
                    : 'نام کانال تلگرام (بدون @ یا با @) و یا لینک مستقیم پیام کانال.'}
                </span>
              </div>

              {/* JSON Path (if API) */}
              {sourceForm.sourceType === 'api_url' && (
                <div className="form-group" style={{ marginTop: '8px' }}>
                  <label htmlFor="modalJsonPath">مسیر کلید JSON (اختیاری)</label>
                  <input
                    type="text"
                    id="modalJsonPath"
                    dir="ltr"
                    placeholder="data.price یا rates.usd یا stats[0].latest"
                    value={sourceForm.jsonPath}
                    onChange={(e) => setSourceForm({ ...sourceForm, jsonPath: e.target.value })}
                  />
                  <span className="source-hint">
                    برای نمونه: <code>rates.USD</code> یا <code>data.price</code>. در صورت خالی بودن، فیلدهای معمول به صورت خودکار شناسایی می‌شوند.
                  </span>
                </div>
              )}

              {/* Custom Regex */}
              <div className="form-group" style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label htmlFor="modalRegex">الگوی Regex اختصاصی (اختیاری)</label>
                  {sourceForm.regex && (
                    <button
                      type="button"
                      onClick={() => { setSourceForm({ ...sourceForm, regex: '' }); setModalTestResult(null); }}
                      style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '11px', cursor: 'pointer' }}
                    >
                      پاک کردن و استفاده از پارسر خودکار
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  id="modalRegex"
                  dir="ltr"
                  placeholder={sourceForm.priceType === 'usd' ? '([\\d,]+)\\s*فروش   یا   دلار[:\\s]+([\\d,]+)' : 'فروش:\\s*([\\d,]+)'}
                  value={sourceForm.regex}
                  onChange={(e) => setSourceForm({ ...sourceForm, regex: e.target.value })}
                />
                
                {/* Presets List for this priceType */}
                {PRESET_REGEX_PATTERNS[sourceForm.priceType] && (
                  <div className="regex-presets-box">
                    <div className="regex-presets-title">
                      <Sparkles size={13} />
                      <span>الگوهای آماده و پیشنهادی برای {PRICE_TYPE_INFO[sourceForm.priceType]?.label} (کلیک جهت درج خودکار):</span>
                    </div>
                    <div className="regex-presets-list">
                      {PRESET_REGEX_PATTERNS[sourceForm.priceType].map((preset, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          className="regex-preset-item"
                          onClick={() => {
                            setSourceForm({ ...sourceForm, regex: preset.pattern });
                            setModalTestResult(null);
                          }}
                          title="کلیک برای انتخاب این الگو"
                        >
                          <span className="regex-preset-label">{preset.label}</span>
                          <span className="regex-preset-code">{preset.pattern}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="regex-guide-info">
                  <strong>راهنمای استخراج:</strong> پرانتز اول <code>(...)</code> در الگو به عنوان عدد قیمت استخراج شده و ارقام فارسی/عربی و کاماها به طور خودکار پاکسازی می‌شوند. در صورت خالی بودن، پارسر هوشمند و چندالگویی پیش‌فرض RealRate استفاده می‌شود.
                </div>
              </div>


              {/* Settings: Interval + Toggles */}
              <div className="grid-2" style={{ marginTop: '8px', alignItems: 'center' }}>
                <div className="form-group">
                  <label htmlFor="modalInterval">بازه بروزرسانی (ثانیه)</label>
                  <input
                    type="number"
                    id="modalInterval"
                    min="10"
                    max="86400"
                    value={sourceForm.fetchIntervalSec}
                    onChange={(e) => setSourceForm({ ...sourceForm, fetchIntervalSec: parseInt(e.target.value, 10) || 60 })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-heading)' }}>
                    <input
                      type="checkbox"
                      checked={sourceForm.isActive}
                      onChange={(e) => setSourceForm({ ...sourceForm, isActive: e.target.checked })}
                    />
                    <span>سورس فعال باشد</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-heading)' }}>
                    <input
                      type="checkbox"
                      checked={sourceForm.isPrimary}
                      onChange={(e) => setSourceForm({ ...sourceForm, isPrimary: e.target.checked })}
                    />
                    <span>تنظیم به عنوان مرجع اصلی برای {PRICE_TYPE_INFO[sourceForm.priceType]?.label || sourceForm.priceType}</span>
                  </label>
                </div>
              </div>

              {/* Modal Test Row */}
              <div className="source-test-row" style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  className="btn-test-source"
                  onClick={handleTestModalSource}
                  disabled={modalTesting}
                >
                  {modalTesting ? (
                    <>
                      <RefreshCw size={13} className="spin-anim" />
                      <span>در حال آزمودن اتصال و استخراج قیمت...</span>
                    </>
                  ) : (
                    <>
                      <PlayCircle size={14} />
                      <span>تست زنده این تنظیمات</span>
                    </>
                  )}
                </button>
              </div>

              {/* Modal Test Result */}
              {modalTestResult && (
                <div className={`test-result-box ${modalTestResult.success ? 'success' : 'error'}`} style={{ marginTop: '8px' }}>
                  <div className="test-result-header">
                    {modalTestResult.success ? (
                      <>
                        <CheckCircle2 size={15} />
                        <span>استخراج با موفقیت انجام شد</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={15} />
                        <span>خطا در آزمودن سورس</span>
                      </>
                    )}
                  </div>
                  <div>{modalTestResult.message || modalTestResult.error}</div>
                  {modalTestResult.success && (
                    <div className="test-result-details">
                      <span><strong>قیمت شناسایی‌شده:</strong> {formatNum(modalTestResult.price)} تومان</span>
                      {modalTestResult.label && <span><strong>برچسب:</strong> {modalTestResult.label}</span>}
                      {modalTestResult.datetime && <span><strong>زمان ثبت:</strong> {formatPersianDate(modalTestResult.datetime)}</span>}
                    </div>
                  )}
                </div>
              )}

              {/* Modal Actions */}
              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="btn-sm site-link"
                  onClick={() => setShowSourceModal(false)}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn-sm btn-primary-action"
                  disabled={savingSource}
                  style={{ padding: '8px 18px', fontSize: '13px' }}
                >
                  <Save size={14} />
                  <span>{savingSource ? 'در حال ذخیره‌سازی...' : (editingSourceId ? 'بروزرسانی سورس' : 'ثبت سورس جدید')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
