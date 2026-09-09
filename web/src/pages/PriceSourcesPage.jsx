import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
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
  Sparkles,
  Code,
  Check,
  X,
  Sliders,
  Users,
  LineChart,
  Activity,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Layers,
  Send,
  Globe,
  ChevronRight,
  Info,
  ShieldCheck,
  Zap,
  Save,
} from 'lucide-react';
import Header from '../components/Header.jsx';
import Footer from '../components/Footer.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMarketData } from '../hooks/useMarketData.js';
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
    { label: 'عدد قبل از «فروش» (رایج در کانال‌های دلار)', pattern: '([\\d,]+)\\s*فروش' },
    { label: 'هرات فردایی تا فروش : عدد', pattern: 'هرات[^\\n]*?([\\d,]+)\\s*فروش' },
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
  const { user, loading: authLoading, triggerLogin } = useAuth();
  const { usdToman, gold18kPrice } = useMarketData();
  const navigate = useNavigate();
  const chartSectionRef = useRef(null);

  // Sources State
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [fetchingAll, setFetchingAll] = useState(false);

  // Dedicated Source Selection for History Chart (Separate per source)
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [chartRange, setChartRange] = useState('24h');
  const [historyData, setHistoryData] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  // Notifications / Messages
  const [message, setMessage] = useState(null);

  const showMsg = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // Load Price Sources from API
  const loadSources = async () => {
    setLoadingSources(true);
    try {
      const res = await apiGetPriceSources();
      if (res.success && Array.isArray(res.sources)) {
        setSources(res.sources);
        // If no source is selected yet, select the first one
        if (!selectedSourceId && res.sources.length > 0) {
          setSelectedSourceId(res.sources[0].id);
        }
      }
    } catch (e) {
      console.error('Error loading price sources:', e);
      showMsg('خطا در دریافت لیست سورس‌ها: ' + e.message, 'error');
    } finally {
      setLoadingSources(false);
    }
  };

  // Load History for the selected source strictly
  const loadPriceHistory = async (targetSourceId = selectedSourceId, range = chartRange) => {
    if (!targetSourceId) {
      setHistoryData([]);
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await apiGetPriceHistory({
        sourceId: targetSourceId,
        range,
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

  // Initial fetch
  useEffect(() => {
    if (user?.role === 'admin') {
      loadSources();
    }
  }, [user]);

  // Load history whenever selectedSourceId or chartRange changes
  useEffect(() => {
    if (user?.role === 'admin' && selectedSourceId) {
      loadPriceHistory(selectedSourceId, chartRange);
    }
  }, [user, selectedSourceId, chartRange]);

  // Active Selected Source Object
  const activeSelectedSource = useMemo(() => {
    return sources.find((s) => s.id === selectedSourceId) || sources[0] || null;
  }, [sources, selectedSourceId]);

  // Filtered Sources for Table
  const filteredSources = useMemo(() => {
    if (sourceFilter === 'all') return sources;
    return sources.filter((s) => s.priceType === sourceFilter);
  }, [sources, sourceFilter]);

  // Force Refresh All Active Sources Now
  const handleFetchAllNow = async () => {
    setFetchingAll(true);
    try {
      const res = await apiFetchAllSourcesNow();
      if (res.success) {
        showMsg(res.message || 'تمامی سورس‌ها با موفقیت فراخوانی و در دیتابیس ثبت شدند.', 'success');
        if (Array.isArray(res.sources)) {
          setSources(res.sources);
        } else {
          loadSources();
        }
        if (selectedSourceId) {
          loadPriceHistory(selectedSourceId, chartRange);
        }
      } else {
        showMsg(res.message || 'خطا در فراخوانی سورس‌ها', 'error');
      }
    } catch (err) {
      showMsg('خطا در ارتباط با سرور: ' + err.message, 'error');
    } finally {
      setFetchingAll(false);
    }
  };

  // Open Add Modal
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

  // Open Edit Modal
  const handleOpenEditSource = (src) => {
    setEditingSourceId(src.id);
    setSourceForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || 'usd',
      sourceType: src.sourceType || 'telegram',
      channelUsername: src.channelUsername || (src.sourceType === 'telegram' ? src.endpoint : ''),
      apiUrl: src.apiUrl || (src.sourceType === 'api_url' ? src.endpoint : ''),
      jsonPath: src.jsonPath || '',
      regexPattern: src.regexPattern || src.regex || '',
      regexGroupIndex: src.regexGroupIndex || 1,
      fetchIntervalMinutes: src.fetchIntervalMinutes || Math.round((src.fetchIntervalSec || 300) / 60),
      isActive: src.isActive !== undefined ? Boolean(src.isActive) : true,
      isPrimary: Boolean(src.isPrimary),
    });
    setModalTestResult(null);
    setSourceModalOpen(true);
  };

  // Save Modal Source
  const handleSaveModalSource = async (e) => {
    e.preventDefault();
    setModalSaving(true);
    try {
      const payload = {
        ...sourceForm,
        endpoint: sourceForm.sourceType === 'telegram' ? sourceForm.channelUsername : sourceForm.apiUrl,
        regexGroupIndex: parseInt(sourceForm.regexGroupIndex, 10) || 1,
        fetchIntervalMinutes: parseInt(sourceForm.fetchIntervalMinutes, 10) || 5,
        fetchIntervalSec: (parseInt(sourceForm.fetchIntervalMinutes, 10) || 5) * 60,
      };
      const res = await apiSavePriceSource(payload);
      if (res.success) {
        showMsg(res.message || 'سورس با موفقیت ذخیره شد.', 'success');
        setSourceModalOpen(false);
        await loadSources();
        if (res.source?.id) {
          setSelectedSourceId(res.source.id);
        }
      } else {
        showMsg(res.message || 'خطا در ذخیره‌سازی سورس.', 'error');
      }
    } catch (err) {
      showMsg('خطا: ' + err.message, 'error');
    } finally {
      setModalSaving(false);
    }
  };

  // Delete Source — Also removes all historical data per user request
  const handleDeleteSource = async (src) => {
    if (!window.confirm(`آیا از حذف کامل سورس «${src.name}» و تمامی رکوردهای تاریخچه آن اطمینان دارید؟`)) return;
    try {
      const res = await apiDeletePriceSource(src.id);
      if (res.success) {
        showMsg(res.message || 'سورس و تمام تاریخچه قیمت آن با موفقیت حذف شد.', 'success');
        const remaining = sources.filter((s) => s.id !== src.id);
        setSources(remaining);
        if (selectedSourceId === src.id) {
          setSelectedSourceId(remaining[0]?.id || '');
        }
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
      const endpoint = sourceForm.sourceType === 'telegram' ? sourceForm.channelUsername : sourceForm.apiUrl;
      const res = await apiTestPriceSource({
        ...sourceForm,
        endpoint,
      });
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

  // Test Row Source with LIVE UPDATE to state & isolated history
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

        showMsg(`قیمت سورس «${src.name}» با موفقیت استخراج و ذخیره شد: ${formatNum(res.price)} تومان`, 'success');

        if (selectedSourceId === src.id) {
          loadPriceHistory(src.id, chartRange);
        }
      } else if (!res.success) {
        showMsg(`خطا در استخراج قیمت سورس «${src.name}»: ${res.error || 'قیمت استخراج نشد'}`, 'error');
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

  // Select Source for Dedicated Chart
  const handleSelectSourceForChart = (src) => {
    setSelectedSourceId(src.id);
    if (chartSectionRef.current) {
      chartSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Not logged in or not admin check
  if (authLoading) {
    return (
      <div className="app-layout">
        <Header usdToman={usdToman} gold18kPrice={gold18kPrice} activeTab="sources" setActiveTab={() => navigate('/')} />
        <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <RefreshCw size={28} className="spin-anim" style={{ color: 'var(--accent-blue)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)' }}>در حال بررسی دسترسی مدیریت...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="app-layout">
        <Header usdToman={usdToman} gold18kPrice={gold18kPrice} activeTab="sources" setActiveTab={() => navigate('/')} />
        <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="admin-container" style={{ textAlign: 'center', padding: '40px 20px', maxWidth: '460px' }}>
            <ShieldCheck size={48} style={{ color: 'var(--accent-amber, #f59e0b)', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-heading)' }}>
              دسترسی محدود به مدیر کل
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.7' }}>
              صفحه مدیریت یکپارچه سورس‌های قیمت و نمودارهای تحلیلی تنها برای مدیران سیستم در دسترس است.
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
                ورود با حساب مدیر
              </button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="app-layout price-sources-fullscreen-app">
      {/* Universal Top Header */}
      <Header
        usdToman={usdToman}
        gold18kPrice={gold18kPrice}
        activeTab="sources"
        setActiveTab={(tab) => navigate(tab === 'portfolio' ? '/portfolio' : '/')}
      />

      {/* Main Full-Width Content Container */}
      <main className="main-content sources-page-main full-width-sources-page">
        {/* Top Breadcrumb & Page Title Strip */}
        <div className="sources-page-hero-banner">
          <div className="hero-breadcrumbs">
            <Link to="/" className="breadcrumb-item">خانه</Link>
            <ChevronRight size={13} />
            <Link to="/admin" className="breadcrumb-item">پنل مدیریت و کاربران</Link>
            <ChevronRight size={13} />
            <span className="breadcrumb-item current">مدیریت سورس‌ها و نمودارهای اختصاصی قیمت</span>
          </div>

          <div className="hero-content-row">
            <div className="hero-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="hero-icon-badge">
                  <Radio size={22} style={{ color: 'var(--accent-blue, #38bdf8)' }} />
                </div>
                <div>
                  <h1 className="hero-page-title">
                    مدیریت سورس‌های بازار و تاریخچه نمودارها
                  </h1>
                  <p className="hero-page-desc">
                    پیکربندی استخراج قیمت از کانال‌های تلگرام و وب‌سرویس‌های API، ثبت تاریخچه تفکیکی و گراف‌های اختصاصی
                  </p>
                </div>
              </div>
            </div>

            <div className="hero-actions-group">
              <button
                type="button"
                onClick={handleFetchAllNow}
                disabled={fetchingAll}
                className="btn-hero-action primary-glow"
                title="فراخوانی همزمان تمام سورس‌های فعال و ثبت در تاریخچه دیتابیس"
              >
                <Zap size={14} className={fetchingAll ? 'spin-anim' : ''} />
                <span>{fetchingAll ? 'در حال دریافت نرخ‌ها...' : 'دریافت آنی قیمت همه سورس‌ها'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenAddSource(sourceFilter === 'all' ? 'usd' : sourceFilter)}
                className="btn-hero-action accent"
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>افزودن سورس جدید</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Notification Banner */}
        {message && (
          <div className={`admin-msg ${message.type}`} style={{ margin: '0 0 16px' }}>
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

        {/* ── SECTION 1: Individual Source Selector & Dedicated Chart ───────── */}
        <section ref={chartSectionRef} className="sources-chart-section">
          {/* Source Tabs Bar — Separate chart per source */}
          <div className="source-tabs-header">
            <div className="source-tabs-title">
              <LineChart size={16} style={{ color: 'var(--accent-blue, #38bdf8)' }} />
              <span>انتخاب سورس برای مشاهده نمودار اختصاصی:</span>
            </div>
            <div className="source-pills-scroll-container">
              {sources.map((src) => {
                const isSelected = src.id === selectedSourceId;
                const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, badgeColor: 'blue' };
                return (
                  <button
                    key={src.id}
                    type="button"
                    className={`source-selector-pill ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedSourceId(src.id)}
                  >
                    <span className={`pill-dot ${typeInfo.badgeColor}`} />
                    <span className="pill-name">{src.name}</span>
                    {src.lastPrice > 0 && (
                      <span className="pill-price">{formatNum(src.lastPrice)}</span>
                    )}
                    {src.isPrimary && <Star size={11} fill="#eab308" color="#eab308" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Chart for the active source */}
          {activeSelectedSource ? (
            <PriceHistoryChart
              history={historyData}
              loading={loadingHistory}
              title={`نمودار تحلیلی اختصاصی: ${activeSelectedSource.name}`}
              subtitle={`${PRICE_TYPE_INFO[activeSelectedSource.priceType]?.label || ''} — پروتکل: ${
                activeSelectedSource.sourceType === 'telegram'
                  ? `@${activeSelectedSource.channelUsername || activeSelectedSource.endpoint}`
                  : 'وب‌سرویس API'
              } ${activeSelectedSource.isPrimary ? '(سورس مرجع)' : ''}`}
              range={chartRange}
              onRangeChange={setChartRange}
              onRefresh={() => loadPriceHistory(activeSelectedSource.id, chartRange)}
              sources={sources}
              selectedSourceId={selectedSourceId}
              onSelectSource={setSelectedSourceId}
              selectedPriceType={activeSelectedSource.priceType}
              onSelectPriceType={(t) => {
                const firstOfType = sources.find((s) => s.priceType === t);
                if (firstOfType) setSelectedSourceId(firstOfType.id);
              }}
              priceTypeInfo={PRICE_TYPE_INFO}
            />
          ) : (
            <div className="chart-empty-state" style={{ background: 'var(--card-bg)', borderRadius: '16px', padding: '40px' }}>
              <Activity size={32} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
              <p>هیچ سورسی برای نمایش نمودار یافت نشد.</p>
              <span>برای مشاهده نمودار اختصاصی، یک سورس از جدول زیر تعریف یا انتخاب کنید.</span>
            </div>
          )}
        </section>

        {/* ── SECTION 2: Sources Overview Cards Grid ──────────────────────── */}
        <section className="sources-cards-grid-section">
          <div className="section-subtitle-bar">
            <span>
              <Activity size={15} style={{ verticalAlign: 'middle', marginLeft: '6px' }} />
              نمای کلی سورس‌های فعال بازار ({sources.length.toLocaleString('fa-IR')} سورس)
            </span>
          </div>

          <div className="sources-overview-grid">
            {sources.map((src) => {
              const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, badgeColor: 'blue' };
              const isSelected = src.id === selectedSourceId;

              return (
                <div
                  key={src.id}
                  className={`source-mini-card ${isSelected ? 'selected-card' : ''}`}
                  onClick={() => handleSelectSourceForChart(src)}
                >
                  <div className="mini-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`source-type-pill pill-${typeInfo.badgeColor}`}>
                        {typeInfo.label}
                      </span>
                      {src.isPrimary && (
                        <span className="primary-tag" title="سورس مرجع">
                          <Star size={10} fill="#eab308" color="#eab308" />
                          <span>مرجع</span>
                        </span>
                      )}
                    </div>
                    <span className={`status-indicator ${src.isActive ? 'active' : 'inactive'}`}>
                      {src.isActive ? 'فعال' : 'غیرفعال'}
                    </span>
                  </div>

                  <div className="mini-card-body">
                    <h4 className="source-card-title">{src.name}</h4>
                    <span className="source-endpoint-line">
                      {src.sourceType === 'telegram'
                        ? `@${src.channelUsername || src.endpoint}`
                        : (src.apiUrl || src.endpoint || 'API URL')}
                    </span>

                    <div className="source-card-price-row">
                      {src.lastPrice > 0 ? (
                        <>
                          <span className="card-price-value">{formatNum(src.lastPrice)}</span>
                          <span className="card-price-unit">تومان</span>
                        </>
                      ) : (
                        <span className="card-no-price">هنوز دریافت نشده</span>
                      )}
                    </div>
                  </div>

                  <div className="mini-card-footer">
                    <span className="last-fetched-hint">
                      {src.lastFetched ? formatPersianDate(src.lastFetched) : 'بدون ثبت تاریخچه'}
                    </span>
                    <button
                      type="button"
                      className="btn-card-chart-focus"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectSourceForChart(src);
                      }}
                    >
                      <LineChart size={13} />
                      <span>نمودار</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── SECTION 3: Unified Management Table ─────────────────────────── */}
        <section className="sources-table-section">
          <div className="table-header-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={17} style={{ color: 'var(--accent-blue)' }} />
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--text-heading)' }}>
                جدول مدیریت و پیکربندی سورس‌ها
              </h3>
            </div>

            {/* Filter Pills */}
            <div className="sources-filter-bar" style={{ margin: 0 }}>
              <button
                type="button"
                className={`filter-pill ${sourceFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSourceFilter('all')}
              >
                <span>همه</span>
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
          </div>

          {/* Table Container */}
          <div className="users-table-wrap sources-fullscreen-table-wrap">
            <table className="users-table sources-table">
              <thead>
                <tr>
                  <th>نام سورس و آدرس</th>
                  <th>نوع نرخ</th>
                  <th>پروتکل</th>
                  <th>تنظیمات استخراج</th>
                  <th>آخرین قیمت استخراجی</th>
                  <th>سورس مرجع</th>
                  <th>وضعیت</th>
                  <th style={{ textAlign: 'center' }}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filteredSources.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '36px' }}>
                      {loadingSources ? 'در حال دریافت لیست سورس‌ها...' : 'هیچ سورسی در این دسته‌بندی یافت نشد.'}
                    </td>
                  </tr>
                ) : (
                  filteredSources.map((src) => {
                    const typeInfo = PRICE_TYPE_INFO[src.priceType] || { label: src.priceType, badgeColor: 'blue' };
                    const isRowTesting = rowTestingId === src.id;
                    const rowResult = rowTestResults[src.id];
                    const isSelectedInChart = src.id === selectedSourceId;

                    return (
                      <React.Fragment key={src.id}>
                        <tr className={isSelectedInChart ? 'active-chart-row' : ''}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <strong style={{ fontSize: '13.5px', color: 'var(--text-heading)' }}>
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
                                  ? `@${(src.channelUsername || src.endpoint || '').replace(/^@/, '')}`
                                  : (src.apiUrl || src.endpoint || '')}
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
                                maxWidth: '220px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: 'var(--text-muted)',
                              }}
                              title={
                                src.sourceType === 'telegram'
                                  ? `Regex: ${src.regexPattern || src.regex} (group ${src.regexGroupIndex || 1})`
                                  : `JSON Path: ${src.jsonPath || 'بدون مسیر'}`
                              }
                            >
                              {src.sourceType === 'telegram'
                                ? (src.regexPattern || src.regex || 'پیش‌فرض')
                                : (src.jsonPath || '—')}
                            </span>
                          </td>
                          <td>
                            {src.lastPrice && Number(src.lastPrice) > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <strong
                                  style={{
                                    fontSize: '13.5px',
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
                                gap: '6px',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleTestRowSource(src)}
                                disabled={isRowTesting}
                                className="action-icon-btn test-btn"
                                title="تست استخراج قیمت و ذخیره در تاریخچه اختصاصی این سورس"
                              >
                                <PlayCircle
                                  size={15}
                                  className={isRowTesting ? 'spin-anim' : ''}
                                  style={{ color: 'var(--accent-blue)' }}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectSourceForChart(src)}
                                className="action-icon-btn chart-btn"
                                title="مشاهده نمودار اختصاصی این سورس"
                              >
                                <LineChart size={15} style={{ color: '#8b5cf6' }} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenEditSource(src)}
                                className="action-icon-btn edit-btn"
                                title="ویرایش تنظیمات سورس"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSource(src)}
                                className="action-icon-btn delete-btn"
                                title="حذف سورس و تمامی رکوردهای تاریخچه‌اش"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Inline Test Result Banner */}
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
                                      قیمت با موفقیت استخراج و در تاریخچه اختصاصی ثبت شد: <strong>{formatNum(rowResult.price)} تومان</strong>
                                    </span>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-rose, #f43f5e)' }}>
                                    <AlertCircle size={14} />
                                    <span>خطا در استخراج قیمت: {rowResult.error || 'عدم تطابق قیمت'}</span>
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
                                  <X size={13} />
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

        {/* ── SECTION 4: Add/Edit Modal ───────────────────────────────────── */}
        {sourceModalOpen && (
          <div className="admin-modal-backdrop" onClick={() => setSourceModalOpen(false)}>
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
                  className="modal-close-btn"
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
                    placeholder="مثال: دلار هرات فردایی، سبزه میدان، صرافی زرما..."
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
                    <label>نام کاربری یا آیدی کانال تلگرام:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', direction: 'ltr' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>@</span>
                      <input
                        type="text"
                        required
                        placeholder="tahran_sabza یا herat_rate"
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
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>آدرس URL وب‌سرویس API:</label>
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
                      <label>مسیر کلید در JSON (اختیاری):</label>
                      <input
                        type="text"
                        placeholder="data.usd.price یا stats[0].latest"
                        value={sourceForm.jsonPath}
                        onChange={(e) => setSourceForm({ ...sourceForm, jsonPath: e.target.value.trim() })}
                        style={{ direction: 'ltr', textAlign: 'left' }}
                      />
                    </div>
                  </>
                )}

                {/* Regex Configuration */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ margin: 0 }}>الگوی رجکس (Regex Pattern):</label>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>فلگ چندخطی <code>ims</code></span>
                  </div>
                  <input
                    type="text"
                    placeholder="مثال: ([\d,]+)\s*فروش"
                    value={sourceForm.regexPattern}
                    onChange={(e) => setSourceForm({ ...sourceForm, regexPattern: e.target.value })}
                    style={{ direction: 'ltr', textAlign: 'left', fontFamily: 'monospace' }}
                  />

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
                    <label>گروه استخراج رجکس:</label>
                    <input
                      type="number"
                      min="1"
                      max="9"
                      value={sourceForm.regexGroupIndex}
                      onChange={(e) => setSourceForm({ ...sourceForm, regexGroupIndex: e.target.value })}
                      style={{ direction: 'ltr', textAlign: 'center' }}
                    />
                  </div>

                  <div className="form-group">
                    <label>بازه استخراج خودکار (دقیقه):</label>
                    <input
                      type="number"
                      min="1"
                      max="1440"
                      value={sourceForm.fetchIntervalMinutes}
                      onChange={(e) => setSourceForm({ ...sourceForm, fetchIntervalMinutes: e.target.value })}
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
                    <span>سورس فعال باشد</span>
                  </label>

                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={sourceForm.isPrimary}
                      onChange={(e) => setSourceForm({ ...sourceForm, isPrimary: e.target.checked })}
                    />
                    <span>به عنوان سورس مرجع این نرخ تنظیم شود</span>
                  </label>
                </div>

                {/* Modal Test Area */}
                <div className="modal-test-area">
                  <button
                    type="button"
                    onClick={handleTestModalSource}
                    disabled={modalTesting}
                    className="btn-sm site-link"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px' }}
                  >
                    <PlayCircle size={14} className={modalTesting ? 'spin-anim' : ''} />
                    <span>{modalTesting ? 'در حال برقراری ارتباط...' : 'تست اتصال و استخراج قبل از ذخیره'}</span>
                  </button>

                  {modalTestResult && (
                    <div className={`modal-test-result-box ${modalTestResult.success ? 'success' : 'error'}`}>
                      {modalTestResult.success ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle2 size={16} style={{ color: 'var(--accent-green)' }} />
                            <strong>قیمت استخراج شده: {formatNum(modalTestResult.price)} تومان</strong>
                          </div>
                          {modalTestResult.post_text && (
                            <div className="sample-snippet-box">
                              <pre>{modalTestResult.post_text.substring(0, 180)}...</pre>
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

                {/* Modal Footer */}
                <div className="admin-modal-actions">
                  <button type="button" className="btn-sm site-link" onClick={() => setSourceModalOpen(false)}>
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
      </main>

      <Footer />
    </div>
  );
}
