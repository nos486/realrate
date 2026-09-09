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
import AppLayout from '../components/ui/AppLayout.jsx';
import AlertBanner from '../components/ui/AlertBanner.jsx';
import MiniCard from '../components/ui/MiniCard.jsx';
import FilterPills from '../components/ui/FilterPills.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Card from '../components/ui/Card.jsx';
import Modal from '../components/ui/Modal.jsx';
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
  usd: { label: 'دلار (USD)', badgeColor: 'blue', unit: 'تومان' },
  gold_18k: { label: 'طلا ۱۸ عیار', badgeColor: 'gold', unit: 'تومان' },
  full_coin: { label: 'سکه تمام بهار', badgeColor: 'amber', unit: 'تومان' },
  half_coin: { label: 'نیم سکه بهار', badgeColor: 'orange', unit: 'تومان' },
  quarter_coin: { label: 'ربع سکه بهار', badgeColor: 'rose', unit: 'تومان' },
  mesghal: { label: 'مثقال طلا ۱۷ عیار', badgeColor: 'purple', unit: 'تومان' },
  ons_gold: { label: 'انس طلا جهانی (XAU)', badgeColor: 'gold', unit: '$' },
  ons_silver: { label: 'انس نقره جهانی (XAG)', badgeColor: 'blue', unit: '$' },
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
  ons_gold: [
    { label: 'Gold-API (وب‌سرویس استاندارد XAU/USD)', pattern: '', apiUrl: 'https://api.gold-api.com/price/XAU', jsonPath: 'price' },
  ],
  ons_silver: [
    { label: 'Gold-API (وب‌سرویس استاندارد XAG/USD)', pattern: '', apiUrl: 'https://api.gold-api.com/price/XAG', jsonPath: 'price' },
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

function formatNum(num, priceType = 'usd') {
  if (num === null || num === undefined || isNaN(num)) return '۰';
  const isUsdAsset = priceType === 'ons_gold' || priceType === 'ons_silver';
  if (isUsdAsset) {
    return Number(num).toLocaleString('fa-IR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return Math.round(num).toLocaleString('fa-IR');
}

function getPriceUnit(priceType) {
  return (priceType === 'ons_gold' || priceType === 'ons_silver') ? 'دلار ($)' : 'تومان';
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

        showMsg(`قیمت سورس «${src.name}» با موفقیت استخراج و ذخیره شد: ${formatNum(res.price, src.priceType)} ${getPriceUnit(src.priceType)}`, 'success');

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
      <AppLayout activeTab="sources">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
          <div>
            <RefreshCw size={28} className="spin-anim" style={{ color: 'var(--accent-blue)', margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-muted)' }}>در حال بررسی دسترسی مدیریت...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <AppLayout activeTab="sources">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <Card className="admin-container" padding="lg" style={{ textAlign: 'center', maxWidth: '460px' }}>
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
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      activeTab="sources"
      setActiveTab={(tab) => navigate(tab === 'portfolio' ? '/portfolio' : '/')}
      usdToman={usdToman}
      gold18kPrice={gold18kPrice}
      layoutClassName="price-sources-fullscreen-app"
      className="sources-page-main full-width-sources-page"
    >
      {/* Top Breadcrumb & Page Title Strip */}
      <Card className="sources-page-hero-banner" padding="hero">
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
      </Card>

      {/* Global Notification Banner */}
      {message && (
        <AlertBanner
          type={message.type}
          message={message.text}
          onClose={() => setMessage(null)}
          style={{ margin: '0 0 16px' }}
        />
      )}

      {/* ── SECTION 1: Individual Source Selector & Dedicated Chart ───────── */}
      <section ref={chartSectionRef} className="sources-chart-section">
        {/* Source Tabs Bar — Separate chart per source */}
        <Card className="source-tabs-header" padding="sm">
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
                    <span className="pill-price">{formatNum(src.lastPrice, src.priceType)}</span>
                  )}
                  {src.isPrimary && <Star size={11} fill="#eab308" color="#eab308" />}
                </button>
              );
            })}
          </div>
        </Card>

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
                <MiniCard
                  key={src.id}
                  selected={isSelected}
                  onClick={() => handleSelectSourceForChart(src)}
                  className="source-overview-card"
                  badge={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{typeInfo.label}</span>
                      {src.isPrimary && (
                        <span className="primary-tag" title="سورس مرجع" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', marginRight: '4px' }}>
                          <Star size={10} fill="#eab308" color="#eab308" />
                          <span>مرجع</span>
                        </span>
                      )}
                    </div>
                  }
                  badgeColor={typeInfo.badgeColor}
                  status={src.isActive ? 'active' : 'inactive'}
                  statusLabel={src.isActive ? 'فعال' : 'غیرفعال'}
                  title={<h4 className="source-card-title" style={{ margin: 0 }}>{src.name}</h4>}
                  subtitle={
                    src.sourceType === 'telegram'
                      ? `@${src.channelUsername || src.endpoint}`
                      : (src.apiUrl || src.endpoint || 'API URL')
                  }
                  value={src.lastPrice > 0 ? formatNum(src.lastPrice, src.priceType) : 'هنوز دریافت نشده'}
                  unit={src.lastPrice > 0 ? getPriceUnit(src.priceType) : null}
                  color={src.lastPrice > 0 ? (typeInfo.badgeColor === 'green' ? 'green' : typeInfo.badgeColor === 'gold' ? 'gold' : 'blue') : 'default'}
                  footer={
                    <>
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
                    </>
                  }
                />
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

            {/* Reusable Filter Pills */}
            <FilterPills
              options={[
                { value: 'all', label: 'همه', badge: sources.length.toLocaleString('fa-IR') },
                ...Object.entries(PRICE_TYPE_INFO).map(([key, info]) => ({
                  value: key,
                  label: info.label,
                  badge: sources.filter((s) => s.priceType === key).length.toLocaleString('fa-IR'),
                })),
              ]}
              activeValue={sourceFilter}
              onChange={setSourceFilter}
            />
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
                    <td colSpan="8" style={{ textAlign: 'center', padding: '24px' }}>
                      <EmptyState
                        title={loadingSources ? 'در حال دریافت لیست سورس‌ها...' : 'هیچ سورسی در این دسته‌بندی یافت نشد.'}
                        description={sourceFilter !== 'all' ? `برای مشاهده سایر سورس‌ها، فیلتر "${PRICE_TYPE_INFO[sourceFilter]?.label || sourceFilter}" را تغییر دهید.` : null}
                        action={
                          sourceFilter !== 'all' ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: '12px', padding: '6px 14px' }}
                              onClick={() => setSourceFilter('all')}
                            >
                              مشاهده همه سورس‌ها
                            </button>
                          ) : null
                        }
                      />
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
                                  {formatNum(src.lastPrice, src.priceType)} {getPriceUnit(src.priceType)}
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
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectSourceForChart(src)}
                                className="action-icon-btn chart-btn"
                                title="مشاهده نمودار اختصاصی این سورس"
                              >
                                <LineChart size={15} />
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
                                      قیمت با موفقیت استخراج و در تاریخچه اختصاصی ثبت شد: <strong>{formatNum(rowResult.price, src.priceType)} {getPriceUnit(src.priceType)}</strong>
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
        <Modal
          isOpen={sourceModalOpen}
          onClose={() => setSourceModalOpen(false)}
          title={editingSourceId ? 'ویرایش سورس قیمت' : 'افزودن سورس قیمت جدید'}
          icon={<Radio size={16} style={{ color: 'var(--accent-blue)' }} />}
          maxWidth="640px"
          className="source-edit-modal-card"
          onSubmit={handleSaveModalSource}
          footer={
            <div className="modal-actions-right">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setSourceModalOpen(false)}
                disabled={modalSaving}
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={modalSaving}
                className="btn-primary"
              >
                <Save size={14} className={modalSaving ? 'spin-anim' : ''} />
                <span>{modalSaving ? 'در حال ذخیره‌سازی...' : 'ذخیره سورس قیمت'}</span>
              </button>
            </div>
          }
        >
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
                        const isGlobal = newType === 'ons_gold' || newType === 'ons_silver';
                        const defaultPreset = PRESET_REGEX_PATTERNS[newType]?.[0];
                        setSourceForm({
                          ...sourceForm,
                          priceType: newType,
                          sourceType: isGlobal ? 'api_url' : sourceForm.sourceType,
                          apiUrl: isGlobal && defaultPreset?.apiUrl ? defaultPreset.apiUrl : sourceForm.apiUrl,
                          jsonPath: isGlobal && defaultPreset?.jsonPath ? defaultPreset.jsonPath : sourceForm.jsonPath,
                          regexPattern: defaultPreset?.pattern || sourceForm.regexPattern,
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
                            <strong>قیمت استخراج شده: {formatNum(modalTestResult.price, sourceForm.priceType)} {getPriceUnit(sourceForm.priceType)}</strong>
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

        </Modal>
    </AppLayout>
  );
}
