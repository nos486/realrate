import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Radio,
  RefreshCw,
  Layers,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import AppLayout from '../components/ui/AppLayout.jsx';
import AlertBanner from '../components/ui/AlertBanner.jsx';
import Card from '../components/ui/Card.jsx';
import { useAuth } from '../features/auth/index.js';
import { useMarketData } from '../hooks/useMarketData.js';
import {
  apiGetPriceSources,
  apiSavePriceSource,
  apiDeletePriceSource,
  apiSetPrimarySource,
  apiTestPriceSource,
  apiFetchAllSourcesNow,
} from '../api/client.js';
import { extractMultiItems } from '../components/UniversalAssetSearch.jsx';
import {
  CANONICAL_PRICE_TYPE_INFO,
  DEFAULT_SOURCE_FORM,
  DEFAULT_MULTI_FEED_FORM,
  isSourceMultiOutput,
  getPriceUnit,
  formatNum,
  SingleSourcesTable,
  MultiFeedsTable,
  FeedDataExplorerModal,
} from '../features/admin/components/priceSources/index.js';

export default function PriceSourcesPage({ embedded = false, usdToman: propUsdToman, gold18kPrice: propGold18kPrice }) {
  const { user, loading: authLoading, triggerLogin } = useAuth();
  const marketData = useMarketData();
  const usdToman = propUsdToman !== undefined ? propUsdToman : marketData.usdToman;
  const gold18kPrice = propGold18kPrice !== undefined ? propGold18kPrice : marketData.gold18kPrice;
  const navigate = useNavigate();

  const renderLayout = (content) => {
    if (embedded) {
      return (
        <div className="embedded-sources-view" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {content}
        </div>
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
        {content}
      </AppLayout>
    );
  };

  // Sources State
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [fetchingAll, setFetchingAll] = useState(false);

  const PRICE_TYPE_INFO = CANONICAL_PRICE_TYPE_INFO;
  const [multiSearch, setMultiSearch] = useState('');

  // Multi-Output Modal States
  const [multiWizardOpen, setMultiWizardOpen] = useState(false);
  const [multiForm, setMultiForm] = useState(DEFAULT_MULTI_FEED_FORM);
  const [multiTesting, setMultiTesting] = useState(false);
  const [multiTestResult, setMultiTestResult] = useState(null);
  const [savingMultiSource, setSavingMultiSource] = useState(false);
  const [multiRowTestingId, setMultiRowTestingId] = useState(null);

  // Data Explorer Modal States
  const [explorerModalOpen, setExplorerModalOpen] = useState(false);
  const [explorerFeed, setExplorerFeed] = useState(null);
  const [explorerSearch, setExplorerSearch] = useState('');
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerItems, setExplorerItems] = useState([]);

  // Single Source Modal State
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSourceId, setEditingSourceId] = useState(null);
  const [sourceForm, setSourceForm] = useState(DEFAULT_SOURCE_FORM);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalTestResult, setModalTestResult] = useState(null);

  // Row Testing State for Base Sources
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
      }
    } catch (e) {
      console.error('Error loading price sources:', e);
      showMsg('خطا در دریافت لیست سورس‌ها: ' + e.message, 'error');
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    loadSources();
  }, []);

  // Partition sources into Single-Rate Base Sources vs Multi-Output Feeds
  const singleSources = useMemo(() => {
    return sources.filter((s) => !isSourceMultiOutput(s, PRICE_TYPE_INFO));
  }, [sources, PRICE_TYPE_INFO]);

  const multiSources = useMemo(() => {
    return sources.filter((s) => isSourceMultiOutput(s, PRICE_TYPE_INFO));
  }, [sources, PRICE_TYPE_INFO]);

  // Dynamic filter options for Base Rates Table
  const dynamicFilterOptions = useMemo(() => {
    const counts = {};
    for (const s of singleSources) {
      const k = s.priceType || 'general';
      counts[k] = (counts[k] || 0) + 1;
    }
    const options = [
      { value: 'all', label: 'همه نرخ‌ها و سورس‌ها', badge: singleSources.length.toLocaleString('fa-IR') },
    ];
    for (const [key, count] of Object.entries(counts)) {
      const info = PRICE_TYPE_INFO[key];
      options.push({
        value: key,
        label: info?.label || key,
        badge: count.toLocaleString('fa-IR'),
      });
    }
    return options;
  }, [singleSources, PRICE_TYPE_INFO]);

  // Filtered Sources for Base Rates Table
  const filteredSingleSources = useMemo(() => {
    if (sourceFilter === 'all') return singleSources;
    return singleSources.filter((s) => s.priceType === sourceFilter);
  }, [singleSources, sourceFilter]);

  // Filtered Multi Sources for Multi-Feeds Hub Table
  const filteredMultiSources = useMemo(() => {
    if (!multiSearch.trim()) return multiSources;
    const q = multiSearch.trim().toLowerCase();
    return multiSources.filter((s) => {
      return (
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.priceType && s.priceType.toLowerCase().includes(q)) ||
        (s.endpoint && s.endpoint.toLowerCase().includes(q))
      );
    });
  }, [multiSources, multiSearch]);

  // Force Refresh All Active Sources Now
  const handleFetchAllNow = async () => {
    setFetchingAll(true);
    try {
      const res = await apiFetchAllSourcesNow();
      if (res.success) {
        showMsg(`استخراج آنی انجام شد: ${res.extractedCount} سورس به‌روزرسانی شد.`, 'success');
        await loadSources();
      } else {
        showMsg('خطا در استخراج سورس‌ها: ' + (res.message || 'نامشخص'), 'error');
      }
    } catch (err) {
      showMsg('خطا در ارتباط با سرور: ' + err.message, 'error');
    } finally {
      setFetchingAll(false);
    }
  };

  // Open Add Modal
  const handleOpenAddSource = (initialType = '') => {
    setEditingSourceId(null);
    const typeToUse = initialType || 'usd';
    setSourceForm({
      ...DEFAULT_SOURCE_FORM,
      priceType: typeToUse,
      unit: 'تومان',
      showOnHomePage: true,
      regexPattern: '([\\d,]+)\\s*فروش',
    });
    setModalTestResult(null);
    setSourceModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditSource = (src) => {
    if (isSourceMultiOutput(src, PRICE_TYPE_INFO)) {
      handleOpenEditMultiFeed(src);
      return;
    }
    const displayCfg = typeof src.displayConfig === 'string'
      ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
      : (src.displayConfig || {});
    const showOnHomePage = displayCfg.showOnHomePage !== undefined ? Boolean(displayCfg.showOnHomePage) : true;

    setEditingSourceId(src.id);
    setSourceForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || '',
      unit: src.unit || getPriceUnit(src.priceType),
      sourceType: src.sourceType || 'telegram',
      channelUsername: src.channelUsername || (src.sourceType === 'telegram' ? src.endpoint : ''),
      apiUrl: src.apiUrl || (src.sourceType === 'api_url' ? src.endpoint : ''),
      jsonPath: src.jsonPath || '',
      fieldMapping: src.fieldMapping || null,
      excludedOutputs: Array.isArray(src.excludedOutputs) ? src.excludedOutputs : [],
      displayConfig: src.displayConfig || null,
      showOnHomePage,
      regexPattern: src.regexPattern || src.regex || '',
      regexGroupIndex: src.regexGroupIndex || 1,
      fetchIntervalMinutes: src.fetchIntervalMinutes || Math.round((src.fetchIntervalSec || 300) / 60),
      isActive: src.isActive !== undefined ? Boolean(src.isActive) : true,
      isPrimary: Boolean(src.isPrimary),
    });
    setModalTestResult(null);
    setSourceModalOpen(true);
  };

  // Multi-Feed Handlers
  const handleOpenAddMultiFeed = () => {
    setMultiForm({
      ...DEFAULT_MULTI_FEED_FORM,
      name: '',
      priceType: 'custom_feed',
      apiUrl: '',
      fetchIntervalMinutes: 60,
      isActive: true,
      showOnHomePage: true,
      homePageOutputsText: '',
    });
    setMultiTestResult(null);
    setMultiWizardOpen(true);
  };

  const handleOpenEditMultiFeed = (src) => {
    const displayCfg = typeof src.displayConfig === 'string'
      ? (() => { try { return JSON.parse(src.displayConfig); } catch { return {}; } })()
      : (src.displayConfig || {});
    const showOnHomePage = displayCfg.showOnHomePage !== undefined ? Boolean(displayCfg.showOnHomePage) : true;
    const homeList = Array.isArray(displayCfg.homePageOutputs)
      ? displayCfg.homePageOutputs
      : (Array.isArray(displayCfg.showOnHomePage) ? displayCfg.showOnHomePage : []);

    setMultiForm({
      id: src.id,
      name: src.name || '',
      priceType: src.priceType || 'custom_feed',
      apiUrl: src.apiUrl || src.endpoint || '',
      fetchIntervalMinutes: src.fetchIntervalMinutes || Math.round((src.fetchIntervalSec || 3600) / 60),
      isActive: src.isActive !== undefined ? Boolean(src.isActive) : true,
      showOnHomePage,
      homePageOutputsText: homeList.join(', '),
    });
    setMultiTestResult(null);
    setMultiWizardOpen(true);
  };

  const handleTestMultiSource = async () => {
    if (!multiForm.apiUrl) {
      alert('لطفاً آدرس وب‌سرویس را وارد کنید.');
      return;
    }
    setMultiTesting(true);
    setMultiTestResult(null);
    try {
      const res = await apiTestPriceSource({
        sourceType: 'api_url',
        priceType: multiForm.priceType,
        endpoint: multiForm.apiUrl,
        name: multiForm.name || 'تست فید',
      });
      setMultiTestResult(res);
      if (res.success) {
        showMsg(res.message || 'تست با موفقیت انجام شد.', 'success');
      }
    } catch (err) {
      setMultiTestResult({ success: false, error: err.message });
    } finally {
      setMultiTesting(false);
    }
  };

  const handleTestMultiRowSource = async (src) => {
    setMultiRowTestingId(src.id);
    try {
      const res = await apiTestPriceSource(src);
      if (res.success) {
        showMsg(res.message || `تست فید «${src.name}» با موفقیت انجام شد.`, 'success');
      } else {
        showMsg(`خطا در تست فید «${src.name}»: ${res.error || 'ناشناخته'}`, 'error');
      }
    } catch (err) {
      showMsg('خطا در تست فید: ' + err.message, 'error');
    } finally {
      setMultiRowTestingId(null);
    }
  };

  const handleSaveMultiSource = async (e) => {
    if (e) e.preventDefault();
    if (!multiForm.name.trim()) {
      alert('لطفاً نام فید را وارد کنید.');
      return;
    }
    if (!multiForm.apiUrl.trim()) {
      alert('لطفاً آدرس وب‌سرویس API را وارد کنید.');
      return;
    }

    setSavingMultiSource(true);
    try {
      const homePageOutputsArr = multiForm.homePageOutputsText
        ? multiForm.homePageOutputsText.split(/[,،\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)
        : null;

      const displayConfig = {
        showOnHomePage: multiForm.showOnHomePage !== false,
        ...(homePageOutputsArr && homePageOutputsArr.length > 0 ? { homePageOutputs: homePageOutputsArr } : {}),
      };

      const payload = {
        id: multiForm.id,
        name: multiForm.name.trim(),
        priceType: multiForm.priceType || 'custom_feed',
        sourceType: 'api_url',
        endpoint: multiForm.apiUrl.trim(),
        fetchIntervalMinutes: Number(multiForm.fetchIntervalMinutes) || 60,
        isActive: multiForm.isActive,
        displayConfig,
      };

      const res = await apiSavePriceSource(payload);
      if (res.success) {
        showMsg(`سورس چند خروجی «${multiForm.name}» با موفقیت ذخیره شد.`, 'success');
        setMultiWizardOpen(false);
        await loadSources();
      } else {
        alert('خطا در ذخیره‌سازی: ' + (res.error || 'ناشناخته'));
      }
    } catch (err) {
      alert('خطا در ذخیره‌سازی سورس: ' + err.message);
    } finally {
      setSavingMultiSource(false);
    }
  };

  const mapToExplorerItem = (it) => {
    const sym = it.symbol || it.s || it.code || it.id || '—';
    const name = it.name || it.n || it.title || it.label || sym;
    const p = Number(it.priceToman || it.priceTomans || it.price || it.p || 0);
    const cat = it.category || it.cat || (it.isFund ? 'صندوق سرمایه‌گذاری' : '');
    return {
      s: sym,
      symbol: sym,
      n: name,
      name,
      p,
      price: p,
      priceToman: p,
      priceRial: it.priceRial,
      isFund: Boolean(it.isFund),
      cat,
      category: cat,
      extra: it.extra,
      rawRate: it.rawRate,
      usdCrossRate: it.usdCrossRate,
      cp: it.changePercent !== undefined ? it.changePercent : it.cp,
    };
  };

  const handleOpenExplorer = async (src) => {
    setExplorerFeed(src);
    setExplorerSearch('');
    setExplorerModalOpen(true);

    // 1. Direct extracted items check
    let items = extractMultiItems(src);
    if (items.length > 0) {
      setExplorerItems(items.map(mapToExplorerItem));
      return;
    }

    // 2. Fetch live data via universal test/preview endpoint
    setExplorerLoading(true);
    try {
      const testRes = await apiTestPriceSource(src);
      if (testRes.success) {
        const rawList = testRes.compactList || testRes.items || testRes.sampleItems;
        if (Array.isArray(rawList) && rawList.length > 0) {
          setExplorerItems(rawList.map(mapToExplorerItem));
          return;
        }
        const testItems = extractMultiItems({ ...src, lastMultiData: testRes.multiData || testRes });
        if (testItems.length > 0) {
          setExplorerItems(testItems.map(mapToExplorerItem));
          return;
        }
      }
    } catch (e) {
      console.error('Error fetching explorer items:', e);
    } finally {
      setExplorerLoading(false);
    }
  };

  // Save Modal Source
  const handleSaveModalSource = async (e) => {
    e.preventDefault();
    setModalSaving(true);
    try {
      const prevDisplay = typeof sourceForm.displayConfig === 'string'
        ? (() => { try { return JSON.parse(sourceForm.displayConfig); } catch { return {}; } })()
        : (sourceForm.displayConfig || {});
      const displayConfig = {
        ...prevDisplay,
        showOnHomePage: sourceForm.showOnHomePage !== false,
      };

      const payload = {
        ...sourceForm,
        displayConfig,
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
    if (!window.confirm(`آیا از حذف کامل سورس «${src.name}» و تمامی رکوردهای تاریخچه آن اطمینان دارید؟`)) return;
    try {
      const res = await apiDeletePriceSource(src.id);
      if (res.success) {
        showMsg(res.message || 'سورس و تمام تاریخچه قیمت آن با موفقیت حذف شد.', 'success');
        setSources((prev) => prev.filter((s) => s.id !== src.id));
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

  // Test Row Source
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

  const handleClearRowTestResult = (srcId) => {
    setRowTestResults((prev) => {
      const next = { ...prev };
      delete next[srcId];
      return next;
    });
  };

  // Auth Guard
  if (authLoading) {
    return renderLayout(
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div>
          <RefreshCw size={28} className="spin-anim" style={{ color: 'var(--accent-blue)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)' }}>در حال بررسی دسترسی مدیریت...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return renderLayout(
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
    );
  }

  return renderLayout(
    <>
      {/* Top Page Title Strip */}
      <Card className="sources-page-hero-banner" padding="hero">
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
                  پیکربندی استخراج قیمت، ثبت تاریخچه تفکیکی و گراف‌های اختصاصی بازار
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
              title="فراخوانی همزمان تمام سورس‌های فعال و بروزرسانی قیمت‌ها"
            >
              <Zap size={14} className={fetchingAll ? 'spin-anim' : ''} />
              <span>{fetchingAll ? 'در حال دریافت نرخ‌ها...' : 'بروزرسانی همگانی سورس‌ها'}</span>
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

      {/* 1. سورس‌های نرخ پایه (طلا، ارز، سکه) */}
      <SingleSourcesTable
        singleSources={singleSources}
        filteredSingleSources={filteredSingleSources}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        dynamicFilterOptions={dynamicFilterOptions}
        loadingSources={loadingSources}
        rowTestingId={rowTestingId}
        rowTestResults={rowTestResults}
        onOpenAddSource={handleOpenAddSource}
        onOpenEditSource={handleOpenEditSource}
        onTestRowSource={handleTestRowSource}
        onSetPrimary={handleSetPrimary}
        onToggleActive={handleToggleActive}
        onDeleteSource={handleDeleteSource}
        onClearRowTestResult={handleClearRowTestResult}
        priceTypeInfo={PRICE_TYPE_INFO}
      />

      <div style={{ height: '36px' }} />

      {/* 2. هاب سورس‌های چند خروجی و فیدها (Multi-Output Feeds) */}
      <MultiFeedsTable
        multiSources={multiSources}
        filteredMultiSources={filteredMultiSources}
        multiSearch={multiSearch}
        setMultiSearch={setMultiSearch}
        loadingSources={loadingSources}
        onOpenAddMultiFeed={handleOpenAddMultiFeed}
        onOpenEditMultiFeed={handleOpenEditMultiFeed}
        onOpenExplorer={handleOpenExplorer}
        onToggleActive={handleToggleActive}
        onDeleteMultiFeed={handleDeleteSource}
        onTestMultiSource={handleTestMultiRowSource}
        testingFeedId={multiRowTestingId}
      />

      {/* Feed Data Explorer Modal */}
      <FeedDataExplorerModal
        isOpen={explorerModalOpen}
        onClose={() => setExplorerModalOpen(false)}
        explorerFeed={explorerFeed}
        explorerSearch={explorerSearch}
        setExplorerSearch={setExplorerSearch}
        explorerLoading={explorerLoading}
        explorerItems={explorerItems}
        handleOpenExplorer={handleOpenExplorer}
      />
    </>
  );
}
