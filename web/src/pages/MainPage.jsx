import React, { useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Megaphone, TrendingUp, Briefcase, ShieldCheck, Radio, Settings, Landmark, Wallet, ReceiptText, Wrench, HandCoins, WalletCards, Smartphone, MessageSquareText } from 'lucide-react';
import { AppLayout, FilterPills, AlertBanner, Button } from '../shared/ui/index.js';
import MarketInputsToolbar from '../components/MarketInputsToolbar.jsx';
import { PriceRefreshStatus } from '../features/market/components/index.js';
import HomeDashboard from '../features/home/HomeDashboard.jsx';
// Imported from its own file (not the loans barrel) so LoansPage stays in its lazy chunk
import UpcomingInstallmentsAlert from '../features/loans/components/UpcomingInstallmentsAlert.jsx';
import UpcomingChequesAlert from '../features/cheques/components/UpcomingChequesAlert.jsx';
import VaultPendingBanner from '../shared/vault/VaultPendingBanner.jsx';
import VaultSetupScreen from '../shared/vault/VaultSetupScreen.jsx';
import { useVault } from '../shared/vault/useVault.js';
import LiveRatesTicker from '../components/LiveRatesTicker.jsx';
import { useMarketData } from '../features/market/hooks/useMarketData.js';
import { useAuth } from '../features/auth/index.js';
import { useDemo } from '../features/demo/index.js';
import { appPath, getAppSubPath } from '../shared/routes.js';
import { toEnglishDigits } from '../shared/utils/formatters.js';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle.js';
import { useTabNavigation } from '../shared/hooks/useTabNavigation.js';
import { useFeature } from '../shared/features/useFeature.js';
import { isNativeApp } from '../shared/native/nativeApp.js';
import { startSmsAutoRead } from '../shared/native/smsInbox.js';
import { useSmsAutoRecord } from '../features/sms-inbox/useSmsAutoRecord.js';

// Each tab other than the market home is loaded on first use, keeping the initial bundle small
const PortfolioTracker = lazy(() => import('../features/portfolio/components/PortfolioTracker.jsx'));
const LoansPage = lazy(() => import('../features/loans/components/LoansPage.jsx'));
const IncomesPage = lazy(() => import('../features/incomes/components/IncomesPage.jsx'));
const ChequesPage = lazy(() => import('../features/cheques/components/ChequesPage.jsx'));
const ExpensesPage = lazy(() => import('../features/expenses/components/ExpensesPage.jsx'));
const AccountsPage = lazy(() => import('../features/accounts/components/AccountsPage.jsx'));
const AccountSettingsView = lazy(() => import('../components/AccountSettingsView.jsx'));
const AppSettingsView = lazy(() => import('../features/app-settings/AppSettingsView.jsx'));
const SmsInboxPage = lazy(() => import('../features/sms-inbox/SmsInboxPage.jsx'));
const AdminPage = lazy(() => import('./AdminPage.jsx'));
const PriceSourcesPage = lazy(() => import('./PriceSourcesPage.jsx'));
// The Android app's home (its own month at a glance); the website's home is the market
const AppHomeDashboard = lazy(() => import('../features/home/AppHomeDashboard.jsx'));

function TabLoader() {
  return (
    <div className="tab-lazy-loader" role="status" aria-label="در حال بارگذاری">
      <div className="spinner-glow" />
    </div>
  );
}

export default function MainPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const { user, maintenance } = useAuth();
  const { isDemo } = useDemo();
  const vault = useVault();
  // Expenses are in beta: only users of the `expenses` feature (admins) see the section
  const hasExpenses = useFeature('expenses');
  const hasAccounts = useFeature('bank_accounts');

  // Android app: read new bank SMS on opening, on every return to the app and as they arrive; a
  // bank SMS notification opens the SMS page, where the messages wait to be recorded
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => startSmsAutoRead({ onOpenInbox: () => navigateRef.current(appPath('/sms')) }), []);
  // Small withdrawals recorded by themselves, when turned on in the app settings
  useSmsAutoRecord(isNativeApp() && hasExpenses && !isDemo);

  // Determine active tab from the path below /app (or the ?tab= query param)
  const subPath = getAppSubPath(location.pathname);

  const isSettings =
    !isDemo && (
      subPath.startsWith('/settings') ||
      searchParams.get('tab') === 'settings'
    );

  // Settings of the Android app: only inside the app
  const isAppSettings =
    isNativeApp() && !isSettings && (
      subPath.startsWith('/app-settings') ||
      searchParams.get('tab') === 'app-settings'
    );

  // Bank SMS read by the Android app: only inside the app
  const isSms =
    isNativeApp() && !isSettings && !isAppSettings && (
      subPath.startsWith('/sms') ||
      searchParams.get('tab') === 'sms'
    );

  const isSources =
    !isSettings && !isAppSettings && !isSms && (
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

  // Transactions is a sub-tab inside the Portfolio page now, not its own top-level tab —
  // but /transactions and /transactions/:id stay working deep links into it.
  const isTransactionsSubView =
    subPath.startsWith('/transactions') || searchParams.get('tab') === 'transactions';

  const isCheques =
    !isSettings && !isSources && !isAdmin && !isIncomes && (
      subPath.startsWith('/cheques') ||
      searchParams.get('tab') === 'cheques'
    );

  const isExpenses =
    hasExpenses && !isSettings && !isSources && !isAdmin && !isIncomes && !isCheques && (
      subPath.startsWith('/expenses') ||
      searchParams.get('tab') === 'expenses'
    );

  const isAccounts =
    hasAccounts && !isSettings && !isSources && !isAdmin && !isIncomes && !isCheques && !isExpenses && (
      subPath.startsWith('/accounts') ||
      searchParams.get('tab') === 'accounts'
    );

  const isPortfolio =
    !isSettings && !isSources && !isAdmin && !isIncomes && !isCheques && !isExpenses && !isAccounts && (
      subPath.startsWith('/portfolio') ||
      searchParams.get('tab') === 'portfolio' ||
      isTransactionsSubView
    );

  // Android app: the market has its own page (the app's home is the user's own dashboard)
  const isRates = isNativeApp() && subPath.startsWith('/rates');

  const isLoans =
    !isSettings && !isSources && !isAdmin && !isIncomes && !isCheques && !isExpenses && !isAccounts && !isPortfolio && (
      subPath.startsWith('/loans') ||
      searchParams.get('tab') === 'loans'
    );

  // First matching section wins; the market home is the fallback
  const activeTab = [
    ['settings', isSettings],
    ['app-settings', isAppSettings],
    ['sms', isSms],
    ['sources', isSources],
    ['admin', isAdmin],
    ['incomes', isIncomes],
    ['cheques', isCheques],
    ['expenses', isExpenses],
    ['accounts', isAccounts],
    ['portfolio', isPortfolio],
    ['loans', isLoans],
    ['rates', isRates],
  ].find(([, matches]) => matches)?.[0] || 'market';

  const tabTitle = useMemo(() => {
    if (isTransactionsSubView) return 'تراکنش‌ها | RealRate';
    switch (activeTab) {
      case 'portfolio':
        return 'پورتفو | RealRate';
      case 'loans':
        return 'وام‌ها و اقساط | RealRate';
      case 'incomes':
        return 'درآمدها | RealRate';
      case 'cheques':
        return 'مدیریت چک‌ها | RealRate';
      case 'expenses':
        return 'هزینه‌ها | RealRate';
      case 'accounts':
        return 'حساب‌ها | RealRate';
      case 'settings':
        return 'تنظیمات حساب | RealRate';
      case 'app-settings':
        return 'تنظیمات اپ | RealRate';
      case 'sms':
        return 'پیامک‌های بانکی | RealRate';
      case 'admin':
        return 'پنل مدیریت | RealRate';
      case 'sources':
        return 'مدیریت منابع قیمت | RealRate';
      case 'rates':
        return 'نرخ و حباب | RealRate';
      default:
        return 'داشبورد بازار | RealRate';
    }
  }, [activeTab, isTransactionsSubView]);

  useDocumentTitle(tabTitle);

  const goToTab = useTabNavigation(activeTab === 'market', appPath('/'));

  const lastPortfolioPath = (base) => {
    let lastId = null;
    try {
      lastId = localStorage.getItem('realrate_last_portfolio_id');
    } catch { }
    return appPath(lastId ? `${base}/${lastId}` : base);
  };

  const TAB_PATHS = {
    incomes: '/incomes',
    cheques: '/cheques',
    expenses: '/expenses',
    accounts: '/accounts',
    loans: '/loans',
    settings: '/settings',
    'app-settings': '/app-settings',
    sms: '/sms',
    admin: '/admin',
    sources: '/admin/sources',
    rates: '/rates',
  };

  const handleTabChange = (nextTab) => {
    if (nextTab === activeTab && !isTransactionsSubView) return;
    if (nextTab === 'portfolio') {
      if (!subPath.startsWith('/portfolio')) goToTab(lastPortfolioPath('/portfolio'));
    } else if (TAB_PATHS[nextTab]) {
      goToTab(appPath(TAB_PATHS[nextTab]));
    // On the website /rates is the home page too; in the app it is the market's own page
    } else if (subPath !== '/' && (isNativeApp() || subPath !== '/rates')) {
      goToTab(appPath('/'));
    }
  };

  // Switching between the Holdings and Transactions sub-tabs inside the Portfolio page — keeps
  // /transactions and /transactions/:id working as their own deep links; a sub-tab replaces the
  // other (back leaves the portfolio instead of flipping between them)
  const handlePortfolioViewChange = (nextView) => {
    navigate(lastPortfolioPath(nextView === 'transactions' ? '/transactions' : '/portfolio'), { replace: true });
  };

  const tabOptions = useMemo(() => {
    const options = [
      { value: 'market', label: 'نرخ و حباب', icon: <TrendingUp size={16} strokeWidth={2} /> },
      // Android app: «خانه» is the dashboard, the market is one of the other sections
      ...(isNativeApp() ? [{ value: 'rates', label: 'نرخ و حباب', icon: <TrendingUp size={16} strokeWidth={2} /> }] : []),
      { value: 'incomes', label: 'درآمدها', icon: <Wallet size={16} strokeWidth={2} /> },
      // Beta (admins): expenses right after incomes, then the accounts they are paid from
      ...(hasExpenses ? [{ value: 'expenses', label: 'هزینه‌ها', icon: <HandCoins size={16} strokeWidth={2} /> }] : []),
      ...(hasAccounts ? [{ value: 'accounts', label: 'حساب‌ها', icon: <WalletCards size={16} strokeWidth={2} /> }] : []),
      // Android app: the bank messages it read, next to the expenses and incomes they become
      ...(isNativeApp() && hasExpenses ? [{ value: 'sms', label: 'پیامک‌ها', icon: <MessageSquareText size={16} strokeWidth={2} /> }] : []),
      { value: 'portfolio', label: 'پورتفو', icon: <Briefcase size={16} strokeWidth={2} /> },
      { value: 'loans', label: 'وام و اقساط', icon: <Landmark size={16} strokeWidth={2} /> },
      { value: 'cheques', label: 'چک‌ها', icon: <ReceiptText size={16} strokeWidth={2} /> },
    ];
    if (user && !isDemo) {
      options.push(
        { value: 'settings', label: 'تنظیمات', icon: <Settings size={16} strokeWidth={2} /> }
      );
      if (isNativeApp()) {
        options.push({ value: 'app-settings', label: 'تنظیمات اپ', icon: <Smartphone size={16} strokeWidth={2} /> });
      }
    }
    if (user?.role === 'admin') {
      options.push(
        { value: 'admin', label: 'پنل مدیریت و کاربران', icon: <ShieldCheck size={16} strokeWidth={2} /> },
        { value: 'sources', label: 'سورس‌های قیمت', icon: <Radio size={16} strokeWidth={2} /> }
      );
    }
    return options;
  }, [user, isDemo, hasExpenses, hasAccounts]);


  const {
    calcData,
    globalSettings,
    loading: marketLoading,
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

  const announcement = globalSettings?.announcement;
  const analysis = calcData?.analysis;
  const recommendation = calcData?.recommendation;
  const currencies = calcData?.currencies;

  const usdNum = parseFloat(toEnglishDigits(String(usdToman)).replace(/,/g, '')) || 0;
  // The book's price; its intrinsic value (at the calculator's rates) only when no source prices it
  const gold18kItem = calcData?.analysis?.find((i) => i.id === 'gold_18k');
  const gold18kPrice = gold18kItem?.market || gold18kItem?.intrinsic || null;

  const hasUsd = usdNum > 0;

  // The app's home dashboard: its cards open a section, the market, or a form
  const openFromHome = (target) => {
    if (target === 'add-expense') navigate(appPath('/expenses?add=expense'));
    else handleTabChange(target);
  };
  // Admin tools stay reachable; everything else waits for the encryption passphrase
  const needsVaultSetup =
    Boolean(user) && !isDemo && vault.status === 'off' && !vault.hasPlaintextData && activeTab !== 'admin' && activeTab !== 'sources';


  return (
    <AppLayout
      usdToman={usdToman}
      gold18kPrice={gold18kPrice}
      activeTab={activeTab}
      setActiveTab={handleTabChange}
      navItems={tabOptions}
    >
      {/* Maintenance mode is on: only admins reach this page, remind them to switch it off */}
      {maintenance?.enabled && user?.role === 'admin' && (
        <AlertBanner
          type="warning"
          icon={<Wrench size={16} />}
          message="حالت توسعه فعال است: فقط مدیران به سایت دسترسی دارند و بقیه صفحه «در حال به‌روزرسانی» را می‌بینند."
          action={
            activeTab !== 'admin' ? (
              <Button size="sm" variant="secondary" onClick={() => handleTabChange('admin')}>
                پنل مدیریت
              </Button>
            ) : null
          }
          style={{ marginBottom: '20px' }}
        />
      )}

      {/* System Announcement Banner */}
      {announcement && (
        <AlertBanner
          type="info"
          icon={<Megaphone size={16} />}
          message={announcement}
          style={{ marginBottom: '20px' }}
        />
      )}

      {/* Modern Segmented Navigation Tabs & Live Rates Ticker (in the Android app the bottom bar
          navigates, and the rates show on the home page only) */}
      {(!isNativeApp() || activeTab === 'market' || activeTab === 'rates') && (
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
            usdPrice={usdToman}
            activeReferenceRate={activeReferenceRate}
            referenceRates={referenceRates}
            onSelectReferenceRate={setReferenceRateKey}
            onCycleReferenceRate={cycleReferenceRate}
          />
        </div>
      </div>
      )}

      {/* Only where prices are shown */}
      {(isNativeApp() ? ['rates', 'portfolio'] : ['market', 'portfolio']).includes(activeTab) && <PriceRefreshStatus />}

      {/* Tab Views */}
      <section className="tab-view-container">
        {/* Encryption is mandatory: a new account (no data yet) chooses its passphrase first */}
        {needsVaultSetup ? (
          <VaultSetupScreen />
        ) : (
        <>
        {!isDemo && activeTab !== 'settings' && <VaultPendingBanner onOpenSettings={() => handleTabChange('settings')} />}

        {/* Active Loan Due Reminders Banner */}
        {/* Due-date reminders: on the home page, and installments on the loans page too — not
            repeated on every other page */}
        {(activeTab === 'market' || activeTab === 'loans') && (
          <UpcomingInstallmentsAlert onSelectLoan={(loanId) => navigate(appPath(loanId ? `/loans/${loanId}` : '/loans'))} />
        )}
        {activeTab === 'market' && <UpcomingChequesAlert onOpen={() => handleTabChange('cheques')} />}

        {activeTab === 'market' && isNativeApp() && (
          <Suspense fallback={<TabLoader />}>
            <AppHomeDashboard usdToman={usdNum} analysis={analysis} onOpen={openFromHome} />
          </Suspense>
        )}

        {activeTab === (isNativeApp() ? 'rates' : 'market') && (
          <div className="market-tab-content">
            {/* The user's own home page: sections of any assets, customizable per user */}
            <HomeDashboard
              analysis={analysis}
              currencies={currencies}
              recommendation={recommendation}
              loading={marketLoading}
              // Only once prices have loaded — while loading, a missing rate is just not here yet
              needsRates={!hasUsd && !marketLoading}
              ratesPanel={
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
              }
            />
          </div>
        )}

        <Suspense fallback={<TabLoader />}>
        {activeTab === 'portfolio' && (
          <PortfolioTracker
            initialPortfolioId={params.portfolioId || searchParams.get('p') || searchParams.get('id') || null}
            initialView={isTransactionsSubView ? 'transactions' : 'holdings'}
            onViewChange={handlePortfolioViewChange}
          />
        )}

        {activeTab === 'loans' && (
          <LoansPage initialLoanId={params.loanId || searchParams.get('id') || null} />
        )}

        {activeTab === 'incomes' && (
          <IncomesPage />
        )}

        {activeTab === 'cheques' && (
          <ChequesPage />
        )}

        {activeTab === 'accounts' && <AccountsPage />}

        {activeTab === 'expenses' && (
          <ExpensesPage
            segment={subPath.match(/^\/expenses\/([^/]+)/)?.[1] || null}
            onNavigate={(segment) => navigate(appPath(segment ? `/expenses/${segment}` : '/expenses'), { replace: true })}
          />
        )}

        {activeTab === 'settings' && (
          <AccountSettingsView />
        )}

        {activeTab === 'app-settings' && (
          <AppSettingsView onOpenSms={hasExpenses ? () => handleTabChange('sms') : null} />
        )}

        {activeTab === 'sms' && <SmsInboxPage />}

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
        </Suspense>
        </>
        )}
      </section>
    </AppLayout>
  );
}

