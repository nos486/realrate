import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Radio,
  Plus,
  RefreshCw,
  ExternalLink,
  PlayCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Trash2,
  Edit3,
  Star,
  Layers,
  Sparkles,
  Code,
  Check,
  X,
  Sliders,
  Users,
  LineChart,
  Home,
  Save,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  apiGetPriceSources,
  apiSavePriceSource,
  apiDeletePriceSource,
  apiSetPrimarySource,
  apiTestPriceSource,
  apiFetchAllSourcesNow,
  apiGetPriceHistory,
} from '../api/client.js';
import PriceHistoryChart from '../components/PriceHistoryChart.jsx';

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
    { label: 'هرات فردایی تا فروش : عدد', pattern: 'هرات[^\\n]*?([\\d,]+)\\s*فروش' },
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

const DEFAULT_SOURCE_FORM = {
  id: null,
  name: '',
  priceType: 'usd',
  sourceType: 'telegram',
  channelUsername: '',
  apiUrl: '',
  jsonPath: '',
  regexPattern: '',
  regexGroupIndex: 1,
  fetchIntervalMinutes: 5,
  isActive: true,
  isPrimary: false,
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

export default function PriceSourcesPage() {
  const { user, loading, triggerLogin, logout } = useAuth();
  const chartSectionRef = useRef(null);

  // Sources State
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [fetchingAll, setFetchingAll] = useState(false);

  // Modal State
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [sourceForm, setSourceForm] = useState(DEFAULT_SOURCE_FORM);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState(null);

  // Row Testing State
  const [rowTestingId, setRowTestingId] = useState(null);
  const [rowTestResults, setRowTestResults] = useState({});

  // History Chart State
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [chartRange, setChartRange] = useState('24h');
  const [chartPriceType, setChartPriceType] = useState('usd');
  const [chartSourceId, setChartSourceId] = useState('');

  // Notifications / Messages
  const [message, setMessage] = useState(null);

  const showMsg = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Load Price Sources
  const loadSources = async () => {
    setLoadingSources(true);
    try {
      const res = await apiGetPriceSources();
      if (res.success && Array.isArray(res.sources)) {
        setSources(res.sources);
      }
    } catch (e) {
      console.error('Error loading price sources:', e);
      showMsg('خطا در دریافت لیست سورس‌ها: ' + e.message, 'error');
    } finally {
      setLoadingSources(false);
    }
  };

  // Load Historical Price Data for Chart
  const loadPriceHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await apiGetPriceHistory({
        priceType: chartPriceType,
        sourceId: chartSourceId || null,
        range: chartRange,
        limit: 300,
      });
      if (res.success && Array.isArray(res.history)) {
        setHistoryData(res.history);
      } else {
        setHistoryData([]);
      }
    } catch (e) {
      console.error('Error loading price history:', e);
      setHistoryData([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Initial Data Fetch
  useEffect(() => {
    if (user?.role === 'admin') {
      loadSources();
    }
  }, [user]);

  // Refetch History when parameters change
  useEffect(() => {
    if (user?.role === 'admin') {
      loadPriceHistory();
    }
  }, [user, chartPriceType, chartSourceId, chartRange]);

  // Filtered Sources for Table
  const filteredSources = useMemo(() => {
    if (sourceFilter === 'all') return sources;
    return sources.filter((s) => s.priceType === sourceFilter);
  }, [sources, sourceFilter]);

  // Fetch All Active Sources Now
  const handleFetchAllNow = async () => {
    setFetchingAll(true);
    try {
      const res = await apiFetchAllSourcesNow();
      if (res.success) {
        showMsg(res.message || 'تمامی سورس‌ها با موفقیت فراخوانی و بروز شدند.', 'success');
        if (Array.isArray(res.sources)) {
          setSources(res.sources);
        } else {
          loadSources();
        }
        loadPriceHistory();
      } else {
        showMsg(res.message || 'خطا در فراخوانی سورس‌ها', 'error');
      }
    } catch (err) {
      showMsg('خطا در اتصال به سرور: ' + err.message, 'error');
    } finally {
      setFetchingAll(false);
    }
  };

  // Open Modal for New Source
  const handleOpenAddSource = (defaultType = 'usd') => {
    setEditingSourceId(null);
    setSourceForm({
      ...DEFAULT_SOURCE_FORM,
      priceType: defaultType,
      regexPattern: PRESET_REGEX_PATTERNS[defaultType]?.[0]?.pattern || '([\\d,]+)\\s*فروش',
    });
    setModalTestResult(null);
    setSourceModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEditSource = (src) => {
    setEditingSourceId(src.id);
    setSourceForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || 'usd',
      sourceType: src.sourceType || 'telegram',
      channelUsername: src.channelUsername || '',
      apiUrl: src.apiUrl || '',
      jsonPath: src.jsonPath || '',
      regexPattern: src.regexPattern || '',
      regexGroupIndex: src.regexGroupIndex || 1,
      fetchIntervalMinutes: src.fetchIntervalMinutes || 5,
      isActive: src.isActive !== undefined ? !!src.isActive : true,
      isPrimary: !!src.isPrimary,
    });
    setModalTestResult(null);
    setSourceModalOpen(true);
  };

  // Save Source (Modal)
  const handleSaveModalSource = async (e) => {
    e.preventDefault();
    setModalSaving(true);
    try {
      const payload = {
        ...sourceForm,
        regexGroupIndex: parseInt(sourceForm.regexGroupIndex, 10) || 1,
        fetchIntervalMinutes: parseInt(sourceForm.fetchIntervalMinutes, 10) || 5,
      };
      const res = await apiSavePriceSource(payload);
      if (res.success) {
        showMsg(res.message || 'سورس با موفقیت ذخیره شد.', 'success');
        setSourceModalOpen(false);
        loadSources();
        loadPriceHistory();
      } else {
        showMsg(res.message || 'خطا در ذخیره‌سازی سورس.', 'error');
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    } finally {
      setModalSaving(false);
    }
  };

  // Delete Source
  const handleDeleteSource = async (src) => {
    if (!window.confirm(`آیا از حذف سورس «${src.name}» اطمینان دارید؟`)) return;
    try {
      const res = await apiDeletePriceSource(src.id);
      if (res.success) {
        showMsg(res.message || 'سورس با موفقیت حذف شد.', 'success');
        loadSources();
      } else {
        showMsg(res.message || 'خطا در حذف سورس.', 'error');
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    }
  };

  // Set Primary Source
  const handleSetPrimary = async (src) => {
    try {
      const res = await apiSetPrimarySource(src.id, src.priceType);
      if (res.success) {
        showMsg(`سورس «${src.name}» به عنوان مرجع قیمت تعیین شد.`, 'success');
        loadSources();
      } else {
        showMsg(res.message || 'خطا در تنظیم سورس مرجع.', 'error');
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    }
  };

  // Toggle Active State
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

  // Test inside Modal
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

  // Test Row Source — with INSTANT update to state and history
  const handleTestRowSource = async (src) => {
    setRowTestingId(src.id);
    try {
      const res = await apiTestPriceSource(src);
      setRowTestResults((prev) => ({ ...prev, [src.id]: res }));

      if (res.success && res.price) {
        // Instantly update the row in local state so "هنوز دریافت نشده" becomes the extracted price
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

        // Automatically update the chart if this source matches the active chart view
        if (chartPriceType === src.priceType || chartSourceId === src.id) {
          loadPriceHistory();
        }
      } else if (!res.success) {
        showMsg(`خطا در استخراج قیمت سورس «${src.name}»: ${res.error || 'قیمت یافت نشد'}`, 'error');
      }
    } catch (err) {
      setRowTestResults((prev) => ({
        ...prev,
        [src.id]: { success: false, error: err.message },
      }));
      showMsg('خطا در تست سورس: ' + err.message, 'error');
    } finally {
      setRowTestingId(null);
    }
  };

  // Focus Source in Chart
  const handleFocusSourceInChart = (src) => {
    setChartPriceType(src.priceType);
    setChartSourceId(src.id);
    if (chartSectionRef.current) {
      chartSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Not logged in or not admin check
  if (loading) {
    return (
      <div className="admin-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
        <RefreshCw size={28} className="spin-anim" style={{ color: 'var(--accent-blue)', margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--text-muted)' }}>در حال بررسی دسترسی مدیریت...</p>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="admin-container" style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ maxWidth: '420px', margin: '0 auto' }}>
          <ShieldCheck size={48} style={{ color: 'var(--accent-amber, #f59e0b)', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-heading)' }}>
            دسترسی محدود به مدیر سیستم
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
            برای مدیریت یکپارچه سورس‌های قیمت و مشاهده نمودارهای هیستوری، باید با حساب مدیر وارد شوید.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <Link to="/" className="btn-sm site-link" style={{ padding: '8px 16px', fontSize: '13px' }}>
              بازگشت به خانه
            </Link>
            <button
              onClick={triggerLogin}
              className="btn-sm btn-primary-action"
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              ورود با گوگل
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-container price-sources-page-layout">
      {/* ── Admin Navigation Bar ────────────────────────────────────────── */}
      <div className="admin-profile-bar admin-nav-header-bar">
        <div className="admin-nav-brand-group">
          <div className="admin-user-info">
            <img
              className="admin-avatar"
              src={user.picture || ''}
              alt={user.name}
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong style={{ fontSize: '13px', color: 'var(--text-heading)' }}>
                  {user.name || 'مدیر سیستم'}
                </strong>
                <span className="admin-role-badge">مدیر کل</span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', direction: 'ltr', display: 'block' }}>
                {user.email}
              </span>
            </div>
          </div>

          {/* Admin Navigation Tabs */}
          <nav className="admin-nav-tabs">
            <Link to="/admin" className="admin-nav-tab">
              <Users size={14} />
              <span>داشبورد عمومی و کاربران</span>
            </Link>
            <Link to="/admin/sources" className="admin-nav-tab active">
              <Radio size={14} />
              <span>مدیریت سورس‌ها و نمودار قیمت</span>
            </Link>
          </nav>
        </div>

        <div className="admin-actions">
          <Link to="/" className="btn-sm site-link" title="مشاهده سایت اصلی">
            <span>مشاهده سایت</span>
            <ExternalLink size={12} style={{ marginRight: '4px' }} />
          </Link>
          <button className="btn-sm logout" onClick={logout}>
            خروج
          </button>
        </div>
      </div>

      {/* ── Flash Notification Banner ───────────────────────────────────── */}
      {message && (
        <div className={`admin-msg ${message.type}`} style={{ margin: '14px 0' }}>
          {message.type === 'success' ? (
            <CheckCircle2 size={16} />
          ) : message.type === 'error' ? (
            <AlertCircle size={16} />
          ) : (
            <Activity size={16} />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* ── SECTION 1: Interactive Price History Chart ─────────────────── */}
      <section ref={chartSectionRef} style={{ marginBottom: '28px' }}>
        <PriceHistoryChart
          history={historyData}
          loading={loadingHistory}
          title={`نمودار تحلیلی تاریخچه قیمت ${PRICE_TYPE_INFO[chartPriceType]?.label || ''}`}
          subtitle={
            chartSourceId
              ? `سورس: ${sources.find((s) => s.id === chartSourceId)?.name || chartSourceId}`
              : 'تمامی سورس‌ها'
          }
          range={chartRange}
          onRangeChange={setChartRange}
          onRefresh={loadPriceHistory}
          sources={sources}
          selectedSourceId={chartSourceId}
          onSelectSource={setChartSourceId}
          selectedPriceType={chartPriceType}
          onSelectPriceType={(type) => {
            setChartPriceType(type);
            setChartSourceId('');
          }}
          priceTypeInfo={PRICE_TYPE_INFO}
        />
      </section>

      {/* ── SECTION 2: Unified Price Sources Table ──────────────────────── */}
      <section className="sources-management-section">
        <div
          className="section-title"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={18} style={{ color: 'var(--accent-blue)' }} />
            <span style={{ fontSize: '15px', fontWeight: 'bold' }}>
              مدیریت و مانیتورینگ سورس‌های تلگرام و وب‌سرویس API
            </span>
            <span className="source-counter-badge">
              {sources.filter((s) => s.isActive).length.toLocaleString('fa-IR')} از{' '}
              {sources.length.toLocaleString('fa-IR')} فعال
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleFetchAllNow}
              disabled={fetchingAll}
              className="btn-sm site-link"
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderColor: 'var(--accent-blue)',
                color: 'var(--accent-blue)',
              }}
              title="فراخوانی همزمان تمام سورس‌های فعال و ذخیره در تاریخچه دیتابیس"
            >
              <RefreshCw size={12} className={fetchingAll ? 'spin-anim' : ''} />
              <span>{fetchingAll ? 'در حال فراخوانی همه...' : 'دریافت آنی قیمت همه سورس‌ها'}</span>
            </button>

            <button
              type="button"
              onClick={loadSources}
              className="btn-sm site-link"
              style={{ padding: '6px 10px', fontSize: '12px' }}
              title="تازه‌سازی لیست جدول"
            >
              <RefreshCw size={12} className={loadingSources ? 'spin-anim' : ''} />
              <span>تازه‌سازی</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenAddSource(sourceFilter === 'all' ? 'usd' : sourceFilter)}
              className="btn-sm btn-primary-action"
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>افزودن سورس جدید</span>
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="sources-filter-bar" style={{ marginBottom: '14px' }}>
          <button
            type="button"
            className={`filter-pill ${sourceFilter === 'all' ? 'active' : ''}`}
            onClick={() => setSourceFilter('all')}
          >
            <span>همه سورس‌ها</span>
            <span className="filter-count">{sources.length.toLocaleString('fa-IR')}</span>
          </button>
          {Object.entries(PRICE_TYPE_INFO).map(([key, info]) => {
            const count = sources.filter((s) => s.priceType === key).length;
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

        {/* Table Container */}
        <div className="users-table-wrap" style={{ marginBottom: '28px' }}>
          <table className="users-table sources-table">
            <thead>
              <tr>
                <th>نام سورس و کانال/آدرس</th>
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
                  <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                    {loadingSources
                      ? 'در حال دریافت لیست سورس‌ها...'
                      : 'هیچ سورسی در این دسته‌بندی تعریف نشده است.'}
                  </td>
                </tr>
              ) : (
                filteredSources.map((src) => {
                  const typeInfo = PRICE_TYPE_INFO[src.priceType] || {
                    label: src.priceType,
                    badgeColor: 'blue',
                  };
                  const isRowTesting = rowTestingId === src.id;
                  const rowResult = rowTestResults[src.id];

                  return (
                    <React.Fragment key={src.id}>
                      <tr>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <strong style={{ fontSize: '13px', color: 'var(--text-heading)' }}>
                              {src.name}
                            </strong>
                            <span
                              style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                direction: 'ltr',
                                textAlign: 'right',
                                fontFamily: 'monospace',
                              }}
                            >
                              {src.sourceType === 'telegram'
                                ? `@${src.channelUsername}`
                                : src.apiUrl?.length > 35
                                ? src.apiUrl.substring(0, 35) + '...'
                                : src.apiUrl}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`source-type-pill pill-${typeInfo.badgeColor}`}>
                            {typeInfo.label}
                          </span>
                        </td>
                        <td>
                          <span
                            className="source-proto-tag"
                            style={{
                              background:
                                src.sourceType === 'telegram'
                                  ? 'rgba(0,136,204,0.12)'
                                  : 'rgba(16,185,129,0.12)',
                              color: src.sourceType === 'telegram' ? '#0088cc' : '#10b981',
                            }}
                          >
                            {src.sourceType === 'telegram' ? 'کانال تلگرام' : 'وب‌سرویس API'}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              fontSize: '11px',
                              fontFamily: 'monospace',
                              direction: 'ltr',
                              display: 'block',
                              maxWidth: '180px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: 'var(--text-muted)',
                            }}
                            title={
                              src.sourceType === 'telegram'
                                ? `Regex: ${src.regexPattern} (group ${src.regexGroupIndex || 1})`
                                : `JSON Path: ${src.jsonPath || 'بدون مسیر'}`
                            }
                          >
                            {src.sourceType === 'telegram'
                              ? src.regexPattern || 'پیش‌فرض'
                              : src.jsonPath || '—'}
                          </span>
                        </td>
                        <td>
                          {src.lastPrice && Number(src.lastPrice) > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <strong
                                style={{
                                  fontSize: '13px',
                                  color: 'var(--accent-green, #10b981)',
                                  fontWeight: '700',
                                }}
                              >
                                {formatNum(src.lastPrice)} تومان
                              </strong>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {formatPersianDate(src.lastFetched)}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              هنوز دریافت نشده
                            </span>
                          )}
                        </td>
                        <td>
                          {src.isPrimary ? (
                            <span className="primary-badge" title="سورس پیش‌فرض این نوع قیمت">
                              <Star size={11} fill="currentColor" />
                              <span>مرجع</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSetPrimary(src)}
                              className="btn-set-primary"
                              title="تبدیل به سورس مرجع برای محاسبات سایت"
                            >
                              <Star size={11} />
                              <span>انتخاب مرجع</span>
                            </button>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(src)}
                            className={`source-toggle-btn ${src.isActive ? 'active' : 'inactive'}`}
                            title={src.isActive ? 'کلیک برای غیرفعال‌سازی' : 'کلیک برای فعال‌سازی'}
                          >
                            <span className="toggle-indicator" />
                            <span>{src.isActive ? 'فعال' : 'غیرفعال'}</span>
                          </button>
                        </td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '4px',
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleTestRowSource(src)}
                              disabled={isRowTesting}
                              className="action-icon-btn test-btn"
                              title="تست استخراج قیمت و ذخیره زنده در دیتابیس"
                            >
                              <PlayCircle
                                size={14}
                                className={isRowTesting ? 'spin-anim' : ''}
                                style={{ color: 'var(--accent-blue)' }}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFocusSourceInChart(src)}
                              className="action-icon-btn chart-btn"
                              title="مشاهده نمودار تاریخچه این سورس"
                            >
                              <LineChart size={14} style={{ color: '#8b5cf6' }} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditSource(src)}
                              className="action-icon-btn edit-btn"
                              title="ویرایش تنظیمات سورس"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSource(src)}
                              className="action-icon-btn delete-btn"
                              title="حذف سورس"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Row Test Result Banner */}
                      {rowResult && (
                        <tr className="test-result-row">
                          <td colSpan="8" style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.06)' }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '12px',
                                gap: '8px',
                              }}
                            >
                              {rowResult.success ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green, #10b981)' }}>
                                  <CheckCircle2 size={14} />
                                  <span>
                                    قیمت با موفقیت استخراج و در دیتابیس ذخیره شد: <strong>{formatNum(rowResult.price)} تومان</strong>
                                  </span>
                                  {rowResult.datetime && (
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                      ({formatPersianDate(rowResult.datetime)})
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-rose, #f43f5e)' }}>
                                  <AlertCircle size={14} />
                                  <span>خطا در استخراج قیمت: {rowResult.error || 'قیمت استخراج نشد'}</span>
                                  {rowResult.raw_matched && (
                                    <span style={{ fontFamily: 'monospace', fontSize: '11px', direction: 'ltr' }}>
                                      (تطابق یافته: «{rowResult.raw_matched}»)
                                    </span>
                                  )}
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setRowTestResults((prev) => {
                                    const next = { ...prev };
                                    delete next[src.id];
                                    return next;
                                  })
                                }
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                              >
                                <X size={12} />
                              </button>
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
      </section>

      {/* ── SECTION 3: Modal Add / Edit Source ─────────────────────────── */}
      {sourceModalOpen && (
        <div className="admin-modal-overlay" onClick={() => setSourceModalOpen(false)}>
          <div
            className="admin-modal-card source-edit-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '640px' }}
          >
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={16} style={{ color: 'var(--accent-blue)' }} />
                <h3>{editingSourceId ? 'ویرایش سورس قیمت' : 'افزودن سورس قیمت جدید'}</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setSourceModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveModalSource} className="admin-modal-body">
              <div className="form-group">
                <label>نام سورس:</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: کانال سبزه میدان، صرافی زرما، وب‌سرویس هرات..."
                  value={sourceForm.name}
                  onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>نوع قیمت:</label>
                  <select
                    value={sourceForm.priceType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      const defaultPattern = PRESET_REGEX_PATTERNS[newType]?.[0]?.pattern || '';
                      setSourceForm({
                        ...sourceForm,
                        priceType: newType,
                        regexPattern: defaultPattern || sourceForm.regexPattern,
                      });
                    }}
                  >
                    {Object.entries(PRICE_TYPE_INFO).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>پروتکل استخراج:</label>
                  <select
                    value={sourceForm.sourceType}
                    onChange={(e) => setSourceForm({ ...sourceForm, sourceType: e.target.value })}
                  >
                    <option value="telegram">کانال عمومی تلگرام (بدون نیاز به توکن)</option>
                    <option value="api_url">وب‌سرویس خارجی (REST API JSON)</option>
                  </select>
                </div>
              </div>

              {sourceForm.sourceType === 'telegram' ? (
                <div className="form-group">
                  <label>نام کاربری کانال تلگرام (Username):</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'ltr' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>@</span>
                    <input
                      type="text"
                      required
                      placeholder="مثلاً: tahran_sabza یا zarma_co"
                      value={sourceForm.channelUsername}
                      onChange={(e) =>
                        setSourceForm({
                          ...sourceForm,
                          channelUsername: e.target.value.replace(/^@/, '').trim(),
                        })
                      }
                      style={{ direction: 'ltr', textAlign: 'left', flex: 1 }}
                    />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    کانال باید عمومی (Public) باشد. قیمت از آخرین پست‌های حاوی عدد استخراج می‌شود.
                  </span>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label>آدرس URL وب‌سرویس (API Endpoint):</label>
                    <input
                      type="url"
                      required
                      placeholder="https://api.example.com/rates/live"
                      value={sourceForm.apiUrl}
                      onChange={(e) => setSourceForm({ ...sourceForm, apiUrl: e.target.value.trim() })}
                      style={{ direction: 'ltr', textAlign: 'left' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>مسیر کلید قیمت در JSON (JSON Path):</label>
                    <input
                      type="text"
                      placeholder="مثال: data.usd.price یا rates.gold_18k"
                      value={sourceForm.jsonPath}
                      onChange={(e) => setSourceForm({ ...sourceForm, jsonPath: e.target.value.trim() })}
                      style={{ direction: 'ltr', textAlign: 'left' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      در صورت خالی بودن کل آبجکت دریافت شده پردازش می‌شود.
                    </span>
                  </div>
                </>
              )}

              {/* Regex Extraction Configuration */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label style={{ margin: 0 }}>
                    الگوی عبارات باقاعده (Regex Pattern):
                  </label>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    فلگ‌های چندخطی <code>ims</code> فعال هستند
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="مثال: ([\d,]+)\s*فروش"
                  value={sourceForm.regexPattern}
                  onChange={(e) => setSourceForm({ ...sourceForm, regexPattern: e.target.value })}
                  style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                />

                {/* Preset Suggestions */}
                {PRESET_REGEX_PATTERNS[sourceForm.priceType] && (
                  <div className="regex-presets-box">
                    <span className="regex-preset-title">
                      <Sparkles size={11} style={{ color: 'var(--accent-amber)' }} />
                      الگوهای آماده برای {PRICE_TYPE_INFO[sourceForm.priceType]?.label}:
                    </span>
                    <div className="regex-chips-list">
                      {PRESET_REGEX_PATTERNS[sourceForm.priceType].map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="regex-preset-chip"
                          onClick={() => setSourceForm({ ...sourceForm, regexPattern: preset.pattern })}
                          title={preset.pattern}
                        >
                          <span>{preset.label}</span>
                          <code>{preset.pattern}</code>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>شماره گروه استخراج رجکس (Regex Group):</label>
                  <input
                    type="number"
                    min="1"
                    max="9"
                    value={sourceForm.regexGroupIndex}
                    onChange={(e) => setSourceForm({ ...sourceForm, regexGroupIndex: e.target.value })}
                    style={{ direction: 'ltr', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    معمولاً ۱ است (اولین پرانتز باز و بسته)
                  </span>
                </div>

                <div className="form-group">
                  <label>فاصله زمانی واکشی (دقیقه):</label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={sourceForm.fetchIntervalMinutes}
                    onChange={(e) =>
                      setSourceForm({ ...sourceForm, fetchIntervalMinutes: e.target.value })
                    }
                    style={{ direction: 'ltr', textAlign: 'center' }}
                  />
                </div>
              </div>

              <div className="form-row-2" style={{ margin: '8px 0' }}>
                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={sourceForm.isActive}
                    onChange={(e) => setSourceForm({ ...sourceForm, isActive: e.target.checked })}
                  />
                  <span>این سورس فعال باشد</span>
                </label>

                <label className="admin-checkbox-label">
                  <input
                    type="checkbox"
                    checked={sourceForm.isPrimary}
                    onChange={(e) => setSourceForm({ ...sourceForm, isPrimary: e.target.checked })}
                  />
                  <span>به عنوان سورس مرجع این نوع قیمت تنظیم شود</span>
                </label>
              </div>

              {/* Test inside modal before saving */}
              <div className="modal-test-area">
                <button
                  type="button"
                  onClick={handleTestModalSource}
                  disabled={modalTesting}
                  className="btn-sm site-link"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                  }}
                >
                  <PlayCircle size={14} className={modalTesting ? 'spin-anim' : ''} />
                  <span>{modalTesting ? 'در حال برقراری ارتباط...' : 'تست این تنظیمات'}</span>
                </button>

                {modalTestResult && (
                  <div
                    className={`modal-test-result-box ${
                      modalTestResult.success ? 'success' : 'error'
                    }`}
                  >
                    {modalTestResult.success ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle2 size={16} style={{ color: 'var(--accent-green)' }} />
                          <strong>
                            قیمت استخراج شده: {formatNum(modalTestResult.price)} تومان
                          </strong>
                        </div>
                        {modalTestResult.post_text && (
                          <div className="sample-snippet-box">
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              متن آخرین پست یافت‌شده:
                            </span>
                            <pre>{modalTestResult.post_text.substring(0, 200)}...</pre>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertCircle size={16} style={{ color: 'var(--accent-rose)' }} />
                        <span>خطا: {modalTestResult.error}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Actions Footer */}
              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="btn-sm site-link"
                  onClick={() => setSourceModalOpen(false)}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="btn-sm btn-primary-action"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Save size={14} className={modalSaving ? 'spin-anim' : ''} />
                  <span>{modalSaving ? 'در حال ذخیره‌سازی...' : 'ذخیره سورس قیمت'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
