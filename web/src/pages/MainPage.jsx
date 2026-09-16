import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Megaphone, TrendingUp, Briefcase, ShieldCheck, Radio, Settings } from 'lucide-react';
import { AppLayout, FilterPills, AlertBanner } from '../shared/ui/index.js';
import MarketInputsToolbar from '../components/MarketInputsToolbar.jsx';
import { AnalysisCards, CurrenciesList } from '../features/market/components/index.js';
import { PortfolioTracker } from '../features/portfolio/index.js';
import AdminPage from './AdminPage.jsx';
import PriceSourcesPage from './PriceSourcesPage.jsx';
import AccountSettingsView from '../components/AccountSettingsView.jsx';
import LiveRatesTicker from '../components/LiveRatesTicker.jsx';
import { useMarketData } from '../features/market/hooks/useMarketData.js';
import { useAuth } from '../features/auth/index.js';
import { toEnglishDigits } from '../utils/formatters.js';

export default function MainPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Determine active tab from pathname or query params
  const isSettings =
    location.pathname.startsWith('/settings') ||
    searchParams.get('tab') === 'settings';

  const isSources =
    !isSettings && (
      location.pathname.startsWith('/admin/sources') ||
      location.pathname.startsWith('/sources') ||
      searchParams.get('tab') === 'sources'
    );

  const isAdmin =
    !isSettings && !isSources && (
      location.pathname.startsWith('/admin') ||
      searchParams.get('tab') === 'admin'
    );

  const isPortfolio =
    !isSettings && !isSources && !isAdmin && (
      location.pathname.startsWith('/portfolio') ||
      searchParams.get('tab') === 'portfolio'
    );

  const activeTab = isSettings
    ? 'settings'
    : isSources
      ? 'sources'
      : isAdmin
        ? 'admin'
        : isPortfolio
          ? 'portfolio'
          : 'market';

  const handleTabChange = (nextTab) => {
    if (nextTab === 'portfolio') {
      if (!location.pathname.startsWith('/portfolio')) {
        let lastId = null;
        try {
          lastId = localStorage.getItem('realrate_last_portfolio_id');
        } catch { }
        navigate(lastId ? `/portfolio/${lastId}` : '/portfolio');
      }
    } else if (nextTab === 'settings') {
      if (location.pathname !== '/settings') {
        navigate('/settings');
      }
    } else if (nextTab === 'admin') {
      if (location.pathname !== '/admin') {
        navigate('/admin');
      }
    } else if (nextTab === 'sources') {
      if (location.pathname !== '/admin/sources') {
        navigate('/admin/sources');
      }
    } else {
      if (location.pathname !== '/' && location.pathname !== '/rates') {
        navigate('/');
      }
    }
  };

  const tabOptions = useMemo(() => {
    const options = [
      { value: 'market', label: 'نرخ و حباب', icon: <TrendingUp size={16} strokeWidth={2} /> },
      { value: 'portfolio', label: 'پورتفو', icon: <Briefcase size={16} strokeWidth={2} /> },
    ];
    if (user) {
      options.push(
        { value: 'settings', label: 'تنظیمات', icon: <Settings size={16} strokeWidth={2} /> }
      );
    }
    if (user?.role === 'admin') {
      options.push(
        { value: 'admin', label: 'پنل مدیریت و کاربران', icon: <ShieldCheck size={16} strokeWidth={2} /> },
        { value: 'sources', label: 'سورس‌های قیمت', icon: <Radio size={16} strokeWidth={2} /> }
      );
    }
    return options;
  }, [user]);


  const {
    rates,
    calcData,
    loading,
    usdToman,
    goldUsd,
    setUsdToman,
    setGoldUsd,
    liveUsdSource,
    liveUsdDatetime,
    referenceRates,
    activeReferenceRate,
    cycleReferenceRate,
    setReferenceRateKey,
  } = useMarketData();

  const announcement = calcData?.globalSettings?.announcement || rates?.globalSettings?.announcement;
  const analysis = calcData?.analysis;
  const recommendation = calcData?.recommendation;
  const currencies = calcData?.currencies || rates?.currencies;

  const usdNum = parseFloat(toEnglishDigits(String(usdToman)).replace(/,/g, '')) || 0;
  const goldUsdNum = parseFloat(toEnglishDigits(String(goldUsd)).replace(/,/g, '')) || 0;
  const gold18kItem = calcData?.analysis?.find((i) => i.id === 'gold_18k');
  const computed18k = (goldUsdNum > 0 && usdNum > 0)
    ? Math.round(((goldUsdNum / 31.1034768) * usdNum) * 0.75)
    : null;
  const gold18kPrice = gold18kItem?.market || gold18kItem?.intrinsic || computed18k;

  const hasUsd = usdNum > 0;

  const showUsdOnHome = true;

  return (
    <AppLayout
      usdToman={usdToman}
      gold18kPrice={gold18kPrice}
      activeTab={activeTab}
      setActiveTab={handleTabChange}
    >
      {/* System Announcement Banner */}
      {announcement && (
        <AlertBanner
          type="info"
          icon={<Megaphone size={16} />}
          message={announcement}
          style={{ marginBottom: '20px' }}
        />
      )}

      {/* Modern Segmented Navigation Tabs & Live Rates Ticker */}
      <div className="main-nav-container">
        <div className="main-nav-tabs-bar">
          <FilterPills
            variant="segmented"
            size="lg"
            options={tabOptions}
            activeValue={activeTab}
            onChange={handleTabChange}
          />
        </div>

        <div className="main-live-ticker-row">
          <LiveRatesTicker
            usdPrice={usdToman || rates?.live_usd_toman || rates?.prices?.usd_toman?.price}
            activeReferenceRate={activeReferenceRate}
            referenceRates={referenceRates}
            onSelectReferenceRate={setReferenceRateKey}
            onCycleReferenceRate={cycleReferenceRate}
          />
        </div>
      </div>

      {/* Tab Views */}
      <section className="tab-view-container">
        {activeTab === 'market' && (
          <div className="market-tab-content">
            {/* Market Inputs Toolbar */}
            <MarketInputsToolbar
              usdToman={usdToman}
              setUsdToman={setUsdToman}
              goldUsd={goldUsd}
              setGoldUsd={setGoldUsd}
              liveUsdSource={liveUsdSource}
              liveUsdDatetime={liveUsdDatetime}
              activeReferenceRate={activeReferenceRate}
              referenceRates={referenceRates}
              onCycleReferenceRate={cycleReferenceRate}
            />

            {/* Alert Banner if USD is null or 0 */}
            {!hasUsd && (
              <AlertBanner
                type="warning"
                message="لطفاً نرخ دلار را برای محاسبه ارزش واقعی و حباب وارد کنید."
                style={{ marginBottom: '8px' }}
              />
            )}

            <AnalysisCards
              analysis={analysis}
              recommendation={recommendation}
            />
            <CurrenciesList
              currencies={currencies}
            />
          </div>
        )}

        {activeTab === 'portfolio' && (
          <PortfolioTracker
            calcData={calcData}
            rates={rates}
            usdToman={usdToman}
            goldUsd={goldUsd}
            initialPortfolioId={params.portfolioId || searchParams.get('p') || searchParams.get('id') || null}
          />
        )}

        {activeTab === 'settings' && (
          <AccountSettingsView />
        )}

        {activeTab === 'admin' && (
          <AdminPage embedded={true} />
        )}

        {activeTab === 'sources' && (
          <PriceSourcesPage
            embedded={true}
            usdToman={usdToman}
            gold18kPrice={gold18kPrice}
          />
        )}
      </section>
    </AppLayout>
  );
}

