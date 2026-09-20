import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Radio,
  RefreshCw,
  Layers,
  Sliders,
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
  apiSetPrimarySource,
  apiTestPriceSource,
  apiFetchAllSourcesNow,
  apiGetMarketItems,
} from '../api/client.js';
import { extractMultiItems } from '../components/UniversalAssetSearch.jsx';
import {
  CANONICAL_PRICE_TYPE_INFO,
  isSourceMultiOutput,
  getPriceUnit,
  formatNum,
  PriceSourcesTableSection,
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
        <div className="price-sources-page sources-fullscreen-page">{content}</div>
      </AppLayout>
    );
  };

  // Sources State
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [fetchingAll, setFetchingAll] = useState(false);

  const PRICE_TYPE_INFO = CANONICAL_PRICE_TYPE_INFO;
  const [multiRowTestingId, setMultiRowTestingId] = useState(null);

  // Data Explorer Modal States
  const [explorerModalOpen, setExplorerModalOpen] = useState(false);
  const [explorerFeed, setExplorerFeed] = useState(null);
  const [explorerSearch, setExplorerSearch] = useState('');
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerItems, setExplorerItems] = useState([]);

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
    setExplorerItems([]);

    // 1. Direct extracted items check from source's cached multi-data
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

      // 3. Fallback to unified catalog market items if test endpoint didn't supply items
      try {
        const marketRes = await apiGetMarketItems();
        if (marketRes?.success) {
          const candidates = [
            ...(marketRes.funds || []),
            ...(marketRes.bourse || []),
            ...(marketRes.currencies || []),
            ...(marketRes.goldAndCoins || []),
          ];
          const matched = candidates.filter((it) => {
            if (it.sourceId && (it.sourceId === src.id || it.sourceId === src.sourceType)) return true;
            if (src.id === 'src_def_charisma_plans' && (it.sourceId === 'src_def_charisma_plans' || it.category === 'charisma_plans' || it.badge === 'طرح')) return true;
            if (src.id === 'src_def_charisma' && (it.sourceName?.includes('کاریزما') || it.manager?.includes('کاریزما') || it.category?.includes('کاریزما'))) return true;
            if (src.id === 'src_def_emofid' && (it.sourceName?.includes('مفید') || it.manager?.includes('مفید') || it.category?.includes('مفید'))) return true;
            if (src.id === 'src_def_bourse' && (it.category === 'bourse' || it.category === 'bourse_symbol')) return true;
            return false;
          });
          if (matched.length > 0) {
            setExplorerItems(matched.map(mapToExplorerItem));
            return;
          }
        }
      } catch {}

      if (!testRes?.success && testRes?.error) {
        showMsg(`عدم برقراری ارتباط زنده: ${testRes.error}`, 'warning');
      }
    } catch (e) {
      console.error('Error fetching explorer items:', e);
      showMsg('خطا در دریافت اقلام کاوشگر: ' + e.message, 'error');
    } finally {
      setExplorerLoading(false);
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
      <PriceSourcesTableSection
        title="سورس‌های نرخ پایه (طلا، ارز، سکه)"
        icon={Sliders}
        iconColor="var(--accent-blue)"
        items={singleSources}
        isMulti={false}
        loading={loadingSources}
        typeInfoMap={PRICE_TYPE_INFO}
        testingId={rowTestingId}
        testResults={rowTestResults}
        onClearTestResult={handleClearRowTestResult}
        onToggleActive={handleToggleActive}
        onTest={handleTestRowSource}
        onSetPrimary={handleSetPrimary}
      />

      <div style={{ height: '36px' }} />

      {/* 2. هاب سورس‌های چند خروجی و فیدها (Multi-Output Feeds) */}
      <PriceSourcesTableSection
        title="هاب سورس‌های چند خروجی و فیدها (Multi-Output Feeds)"
        icon={Layers}
        iconColor="var(--accent-indigo, #6366f1)"
        items={multiSources}
        isMulti={true}
        loading={loadingSources}
        typeInfoMap={PRICE_TYPE_INFO}
        testingId={multiRowTestingId}
        testResults={rowTestResults}
        onClearTestResult={handleClearRowTestResult}
        onToggleActive={handleToggleActive}
        onTest={handleTestMultiRowSource}
        onOpenExplorer={handleOpenExplorer}
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
