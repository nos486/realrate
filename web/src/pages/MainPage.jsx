import React, { useState, useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Megaphone, TrendingUp, Briefcase, ShieldCheck, Radio, Settings, Receipt, Landmark, Wallet } from 'lucide-react';
import { AppLayout, FilterPills, AlertBanner } from '../shared/ui/index.js';
import MarketInputsToolbar from '../components/MarketInputsToolbar.jsx';
import { AnalysisCards, CurrenciesList } from '../features/market/components/index.js';
import { PortfolioTracker } from '../features/portfolio/index.js';
import { TransactionsPage } from '../features/transactions/index.js';
import { LoansPage, UpcomingInstallmentsAlert } from '../features/loans/index.js';
import { IncomesPage } from '../features/incomes/index.js';
import AdminPage from './AdminPage.jsx';
import PriceSourcesPage from './PriceSourcesPage.jsx';
import AccountSettingsView from '../components/AccountSettingsView.jsx';
import LiveRatesTicker from '../components/LiveRatesTicker.jsx';
import { useMarketData } from '../features/market/hooks/useMarketData.js';
import { useAuth } from '../features/auth/index.js';
import { appPath, getAppSubPath } from '../shared/routes.js';
import { toEnglishDigits } from '../utils/formatters.js';

export default function MainPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Determine active tab from the path below /app (or the ?tab= query param)
  const subPath = getAppSubPath(location.pathname);

  const isSettings =
    subPath.startsWith('/settings') ||
    searchParams.get('tab') === 'settings';

  const isSources =
    !isSettings && (
      subPath.startsWith('/admin/sources') ||
      subPath.startsWith('/sources') ||
      searchParams.get('tab') === 'sources'
    );

  const isAdmin =
    !isSettings && !isSources && (
      subPath.startsWith('/admin') ||
      searchParams.get('tab') === 'admin'
    );

  const isIncomes =
    !isSettings && !isSources && !isAdmin && (
      subPath.startsWith('/incomes') ||
      searchParams.get('tab') === 'incomes'
    );

  const isPortfolio =
    !isSettings && !isSources && !isAdmin && !isIncomes && (
      subPath.startsWith('/portfolio') ||
      searchParams.get('tab') === 'portfolio'
    );

  const isTransactions =
    !isSettings && !isSources && !isAdmin && !isIncomes && !isPortfolio && (
      subPath.startsWith('/transactions') ||
      searchParams.get('tab') === 'transactions'
    );

  const isLoans =
    !isSettings && !isSources && !isAdmin && !isIncomes && !isPortfolio && !isTransactions && (
      subPath.startsWith('/loans') ||
      searchParams.get('tab') === 'loans'
    );

  const activeTab = isSettings
    ? 'settings'
    : isSources
      ? 'sources'
      : isAdmin
        ? 'admin'
        : isIncomes
          ? 'incomes'
          : isPortfolio
            ? 'portfolio'
            : isTransactions
              ? 'transactions'
              : isLoans
                ? 'loans'
                : 'market';

  const handleTabChange = (nextTab) => {
    if (nextTab === 'incomes') {
      if (!subPath.startsWith('/incomes')) {
        navigate(appPath('/incomes'));
      }
    } else if (nextTab === 'loans') {
      if (!subPath.startsWith('/loans')) {
        navigate(appPath('/loans'));
      }
    } else if (nextTab === 'transactions') {
      if (!subPath.startsWith('/transactions')) {
        let lastId = null;
        try {
          lastId = localStorage.getItem('realrate_last_portfolio_id');
        } catch { }
        navigate(appPath(lastId ? `/transactions/${lastId}` : '/transactions'));
      }
    } else if (nextTab === 'portfolio') {
      if (!subPath.startsWith('/portfolio')) {
        let lastId = null;
        try {
          lastId = localStorage.getItem('realrate_last_portfolio_id');
        } catch { }
        navigate(appPath(lastId ? `/portfolio/${lastId}` : '/portfolio'));
      }
    } else if (nextTab === 'settings') {
      if (subPath !== '/settings') {
        navigate(appPath('/settings'));
      }
    } else if (nextTab === 'admin') {
      if (subPath !== '/admin') {
        navigate(appPath('/admin'));
      }
    } else if (nextTab === 'sources') {
      if (subPath !== '/admin/sources') {
        navigate(appPath('/admin/sources'));
      }
    } else {
      if (subPath !== '/' && subPath !== '/rates') {
        navigate(appPath('/'));
      }
    }
  };

  const tabOptions = useMemo(() => {
    const options = [
      { value: 'market', label: 'نرخ و حباب', icon: <TrendingUp size={16} strokeWidth={2} /> },
      { value: 'incomes', label: 'درآمدها', icon: <Wallet size={16} strokeWidth={2} /> },
      { value: 'portfolio', label: 'پورتفو', icon: <Briefcase size={16} strokeWidth={2} /> },
      { value: 'transactions', label: 'تراکنش‌ها', icon: <Receipt size={16} strokeWidth={2} /> },
      { value: 'loans', label: 'وام و اقساط', icon: <Landmark size={16} strokeWidth={2} /> },
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
        {/* Active Loan Due Reminders Banner */}
        <div style={{ marginBottom: '14px', width: '100%' }}>
          <UpcomingInstallmentsAlert onSelectLoan={(loanId) => navigate(appPath(loanId ? `/loans/${loanId}` : '/loans'))} />
        </div>

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

        {activeTab === 'transactions' && (
          <TransactionsPage
            calcData={calcData}
            rates={rates}
            usdToman={usdToman}
            goldUsd={goldUsd}
            initialPortfolioId={params.portfolioId || searchParams.get('p') || searchParams.get('id') || null}
          />
        )}

        {activeTab === 'loans' && (
          <LoansPage initialLoanId={params.loanId || searchParams.get('id') || null} />
        )}

        {activeTab === 'incomes' && (
          <IncomesPage />
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

