import { hasNews as localeHasNews, t } from '../utils/i18n.js';
import React, { useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ErrorBoundary from '../shared/ui/ErrorBoundary.jsx';
import { TrendingUp, Briefcase, ShieldCheck, Settings, Landmark, Wallet, ReceiptText, Wrench, HandCoins, WalletCards, Smartphone, MessageSquareText, FolderKanban, Newspaper, ChartColumn, CalendarSync, Crown, Compass, Target, Home } from 'lucide-react';
import { AppLayout, AlertBanner, Button } from '../shared/ui/index.js';
import { PriceRefreshStatus } from '../features/market/components/index.js';
import HomeDashboard from '../features/home/HomeDashboard.jsx';
// Imported from its own file (not the loans barrel) so LoansPage stays in its lazy chunk
import AlertStack from '../shared/alerts/AlertStack.jsx';
import AppAlertSources from '../shared/alerts/AppAlertSources.jsx';
import VaultSetupScreen from '../shared/vault/VaultSetupScreen.jsx';
import { useVault } from '../shared/vault/useVault.js';
import { useMarketData } from '../features/market/hooks/useMarketData.js';
import { useAuth } from '../features/auth/index.js';
import { useDemo } from '../features/demo/index.js';
import { appPath, getAppSubPath } from '../shared/routes.js';
import { toEnglishDigits } from '../shared/utils/formatters.js';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle.js';
import { useTabNavigation } from '../shared/hooks/useTabNavigation.js';
import { useFeature } from '../shared/features/useFeature.js';
import FeatureOffer from '../shared/features/FeatureOffer.jsx';
import PlanNote from '../shared/plan/PlanNote.jsx';
import PlanLimitPrompt from '../shared/plan/PlanLimitPrompt.jsx';
import { useIsPro, usePlan, PRO_PATH } from '../shared/plan/usePlan.js';
import { setSmsLimits } from '../shared/native/smsPlan.js';
import { useAppLayout } from '../shared/app/appLayout.js';
import { buildNavGroups } from '../shared/app/navGroups.js';
import GroupTabs from '../shared/app/GroupTabs.jsx';
import { isNativeApp, smsEnabled } from '../shared/native/nativeApp.js';
import { startSmsAutoRead } from '../shared/native/smsInbox.js';
import { startWidgetLinks, refreshWidgets } from '../shared/native/widgets.js';
import { initDueNotificationClicks } from '../shared/native/dueNotifications.js';
import { startNewsAlerts } from '../features/news/newsAlerts.js';
import { useSmsAutoRecord } from '../features/sms-inbox/useSmsAutoRecord.js';
import { usePageScopes, startFocusRefresh } from '../shared/refresh/pageRefresh.js';
import { refreshScopesOf } from '../shared/refresh/tabScopes.js';
import TabLoadingGate from '../shared/refresh/TabLoadingGate.jsx';

// Each tab other than the market home is loaded on first use, keeping the initial bundle small
const PortfolioTracker = lazy(() => import('../features/portfolio/components/PortfolioTracker.jsx'));
const LoansPage = lazy(() => import('../features/loans/components/LoansPage.jsx'));
const IncomesPage = lazy(() => import('../features/incomes/components/IncomesPage.jsx'));
const ChequesPage = lazy(() => import('../features/cheques/components/ChequesPage.jsx'));
const SubscriptionsPage = lazy(() => import('../features/subscriptions/components/SubscriptionsPage.jsx'));
const GoalsPage = lazy(() => import('../features/goals/components/GoalsPage.jsx'));
const ExpensesPage = lazy(() => import('../features/expenses/components/ExpensesPage.jsx'));
const ProjectsPage = lazy(() => import('../features/expenses/components/ProjectsPage.jsx'));
const AccountsPage = lazy(() => import('../features/accounts/components/AccountsPage.jsx'));
const AccountSettingsView = lazy(() => import('../components/AccountSettingsView.jsx'));
const AppSettingsView = lazy(() => import('../features/app-settings/AppSettingsView.jsx'));
const SmsInboxPage = lazy(() => import('../features/sms-inbox/SmsInboxPage.jsx'));
const NewsPage = lazy(() => import('../features/news/NewsPage.jsx'));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage.jsx'));
const ExplorePage = lazy(() => import('../features/explore/ExplorePage.jsx'));
const ProPage = lazy(() => import('../features/pro/ProPage.jsx'));
// The Android app's home (its own month at a glance); the website's home is the market
const Dashboard = lazy(() => import('../features/dashboard/Dashboard.jsx'));

/** What the news give, shown to users without them (FeatureOffer) */
const NEWS_BENEFITS = [
  t('خبرهای مهم دلار، طلا، سکه، نفت و اقتصاد، گزینش‌شده با هوش مصنوعی'),
  t('تحلیل روز و مهم‌ترین خبرهای هفته'),
  t('اعلان خبرهای مهم'),
];

/** What the reports give, shown to users without them (FeatureOffer) */
const REPORTS_BENEFITS = [
  t('درآمد، هزینه، مانده و نرخ پس‌انداز هر ماه و کل سال'),
  t('نمودار دسته‌ها، منابع درآمد و سرمایه‌گذاری‌ها'),
  t('جدول ماه‌به‌ماه و خروجی چاپی'),
];

/** What the market explorer gives, shown to users without it (FeatureOffer) */
const EXPLORE_BENEFITS = [
  t('جست‌وجوی هر دارایی بازار: طلا، سکه، ارز، رمزارز، نمادهای بورس و صندوق‌ها'),
  t('قیمت لحظه‌ای، تغییر روز، کف و سقف امروز و میانگین‌ها بدون ذخیره‌ی چیزی'),
  t('نمودار کندلی ۱ ماه، ۶ ماه و ۱ سال'),
];

/** What the market page gives, shown to users without it (FeatureOffer) */
const MARKET_BENEFITS = [
  t('قیمت لحظه‌ای طلا، سکه، ارز، رمزارز، نمادهای بورس و صندوق‌ها، با ارزش ذاتی و حباب'),
  t('نمودار شمعی و تاریخچه‌ی قیمت هر دارایی'),
  t('صفحه‌ی اول شخصی: بخش‌ها و کارت‌های دلخواه، با قالب‌های آماده'),
];

/** Shown in place of a section the user's groups don't open (config/features.js) */
function SectionOffer({ feature, name }) {
  return <FeatureOffer feature={feature} name={name} />;
}

function TabLoader() {
  return (
    <div className="tab-lazy-loader" role="status" aria-label={t('در حال بارگذاری')}>
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
  const isPro = useIsPro();
  const hasReports = useFeature('reports');
  // Bank messages are counted on the phone against the limits the server gave this user
  const { smsLimits } = usePlan();
  useEffect(() => setSmsLimits(smsLimits), [smsLimits.daily, smsLimits.monthly]); // eslint-disable-line react-hooks/exhaustive-deps
  const vault = useVault();
  // Expenses are in beta: only users of the `expenses` feature (admins) see the section
  const hasExpenses = useFeature('expenses');
  const hasAccounts = useFeature('bank_accounts');
  // The market page (prices, their charts, the customizable home) is open to some groups only
  // (feature `market`, "pro" by default); the others see what it offers and can ask to join
  const hasMarket = useFeature('market');
  // Every other section is a feature too (config/features.js): the admin opens each to some groups
  const hasHome = useFeature('home');
  const hasPortfolio = useFeature('portfolio');
  const hasExplore = useFeature('explore');
  const hasIncomes = useFeature('incomes');
  const hasLoans = useFeature('loans');
  const hasCheques = useFeature('cheques');
  const hasSubscriptions = useFeature('subscriptions');
  const hasGoals = useFeature('goals');
  const hasNewsFeature = useFeature('news');
  // A closed section is listed only when the user can ask for it (a group that accepts requests
  // opens it: GET /api/auth/me `offeredFeatures`); otherwise it is not shown at all
  const offered = user?.offeredFeatures || [];
  const listed = (key, has) => has || offered.includes(key);
  // The app's frame (the Android app, or the website on a phone): home is the user's dashboard and
  // the market is its own page; what only the Android app can do still asks isNativeApp()
  const appLayout = useAppLayout();

  // Android app: read new bank SMS on opening, on every return to the app and as they arrive; a
  // bank SMS notification opens the SMS page, where the messages wait to be recorded
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => startSmsAutoRead({ onOpenInbox: () => navigateRef.current(appPath('/sms')) }), []);
  // A tap on a home-screen widget opens its page (the news, the home, the widgets' settings)
  useEffect(() => {
    refreshWidgets();
    return startWidgetLinks((path) => navigateRef.current(appPath(path)));
  }, []);
  useEffect(() => initDueNotificationClicks((path) => navigateRef.current(appPath(path))), []);
  // Android app: a notification for important news while the app runs (when turned on)
  // The news and the daily analysis are Persian-only (their sources are), so other languages leave them out
  const hasNews = useFeature('news') && localeHasNews();
  useEffect(() => (hasNews ? startNewsAlerts() : undefined), [hasNews]);
  // Small withdrawals recorded by themselves, when turned on in the app settings
  useSmsAutoRecord(smsEnabled() && hasExpenses && !isDemo);

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
    smsEnabled() && !isSettings && !isAppSettings && (
      subPath.startsWith('/sms') ||
      searchParams.get('tab') === 'sms'
    );

  const isIncomes =
    !isSettings && (
      subPath.startsWith('/incomes') ||
      searchParams.get('tab') === 'incomes'
    );


  const isCheques =
    !isSettings && !isIncomes && (
      subPath.startsWith('/cheques') ||
      searchParams.get('tab') === 'cheques'
    );

  // Subscriptions: what renews, when, and what they cost a month
  const isSubscriptions =
    Boolean(user) && !isSettings && (
      subPath.startsWith('/subscriptions') ||
      searchParams.get('tab') === 'subscriptions'
    );

  // Goals: what the user saves for and how far each is
  const isGoals =
    Boolean(user) && !isSettings && (
      subPath.startsWith('/goals') ||
      searchParams.get('tab') === 'goals'
    );

  // Projects have their own part (/projects); old /expenses/projects and /expenses/:id links are
  // sent there below
  const oldProjectSegment = subPath.match(/^\/expenses\/([^/]+)/)?.[1] || null;
  const isProjects =
    hasExpenses && !isSettings && !isIncomes && !isCheques && (
      subPath.startsWith('/projects') ||
      Boolean(oldProjectSegment) ||
      searchParams.get('tab') === 'projects'
    );

  const isExpenses =
    hasExpenses && !isSettings && !isIncomes && !isCheques && !isProjects && (
      subPath.startsWith('/expenses') ||
      searchParams.get('tab') === 'expenses'
    );

  const isAccounts =
    hasAccounts && !isSettings && !isIncomes && !isCheques && !isExpenses && (
      subPath.startsWith('/accounts') ||
      searchParams.get('tab') === 'accounts'
    );

  const isPortfolio =
    !isSettings && !isIncomes && !isCheques && !isExpenses && !isAccounts && (
      subPath.startsWith('/portfolio') ||
      searchParams.get('tab') === 'portfolio' ||
      // The transactions screen is now each asset's ledger in the portfolio: old links land there
      subPath.startsWith('/transactions') ||
      searchParams.get('tab') === 'transactions'
    );

  // Market news (open to every user)
  const isNews =
    !isSettings && (
      subPath.startsWith('/news') ||
      searchParams.get('tab') === 'news'
    );

  // Reports across incomes, expenses and the portfolios (the user's own amounts)
  const isReports =
    Boolean(user) && !isSettings && (
      subPath.startsWith('/reports') ||
      searchParams.get('tab') === 'reports'
    );

  // The market explorer: search any asset, see its price, info and chart (nothing is saved)
  const isExplore = !isSettings && subPath.startsWith('/explore');

  // Free and Pro side by side: the «Pro» button and every free-plan limit lead here
  const isProPage = Boolean(user) && subPath.startsWith(PRO_PATH);

  // The market has its own page; the home is the user's own widget dashboard
  const isRates = subPath.startsWith('/rates');

  const isLoans =
    !isSettings && !isIncomes && !isCheques && !isExpenses && !isAccounts && !isPortfolio && (
      subPath.startsWith('/loans') ||
      searchParams.get('tab') === 'loans'
    );

  // First matching section wins; the market home is the fallback
  const activeTab = [
    ['settings', isSettings],
    ['app-settings', isAppSettings],
    ['sms', isSms],
    ['incomes', isIncomes],
    ['cheques', isCheques],
    ['subscriptions', isSubscriptions],
    ['goals', isGoals],
    ['projects', isProjects],
    ['expenses', isExpenses],
    ['accounts', isAccounts],
    ['portfolio', isPortfolio],
    ['loans', isLoans],
    ['rates', isRates],
    ['news', isNews],
    ['reports', isReports],
    ['explore', isExplore],
    ['pro', isProPage],
  ].find(([, matches]) => matches)?.[0] || 'market';

  // The header's refresh button, the window getting focus again and opening the tab again read
  // only what this tab shows (shared/refresh): never the prices on the news tab, never on a timer
  usePageScopes(refreshScopesOf(activeTab, { hasMarket }), activeTab);
  useEffect(() => startFocusRefresh(), []);

  const tabTitle = useMemo(() => {
    switch (activeTab) {
      case 'portfolio':
        return t('پورتفو | RealRate');
      case 'loans':
        return t('وام‌ها و اقساط | RealRate');
      case 'incomes':
        return t('درآمدها | RealRate');
      case 'cheques':
        return t('مدیریت چک‌ها | RealRate');
      case 'subscriptions':
        return t('اشتراک‌ها | RealRate');
      case 'goals':
        return t('اهداف | RealRate');
      case 'expenses':
        return t('هزینه‌ها | RealRate');
      case 'projects':
        return t('پروژه‌ها | RealRate');
      case 'accounts':
        return t('حساب‌ها | RealRate');
      case 'settings':
        return t('تنظیمات حساب | RealRate');
      case 'app-settings':
        return t('تنظیمات اپ | RealRate');
      case 'sms':
        return t('پیامک‌های بانکی | RealRate');
      case 'rates':
        return t('نرخ و حباب | RealRate');
      case 'news':
        return t('اخبار | RealRate');
      case 'reports':
        return t('گزارش‌ها | RealRate');
      case 'explore':
        return t('کاوش بازار | RealRate');
      case 'pro':
        return t('پلن رایگان و Pro | RealRate');
      default:
        return t('خانه | RealRate');
    }
  }, [activeTab]);

  useDocumentTitle(tabTitle);

  const goToTab = useTabNavigation(activeTab === 'market', appPath('/'));

  // Old links to projects under /expenses (/expenses/projects, /expenses/:id) move to /projects
  useEffect(() => {
    if (!oldProjectSegment) return;
    navigate(appPath(oldProjectSegment === 'projects' ? '/projects' : `/projects/${oldProjectSegment}`), { replace: true });
    // Only when such a link is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldProjectSegment]);

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
    subscriptions: '/subscriptions',
    goals: '/goals',
    expenses: '/expenses',
    projects: '/projects',
    accounts: '/accounts',
    loans: '/loans',
    settings: '/settings',
    'app-settings': '/app-settings',
    sms: '/sms',
    rates: '/rates',
    news: '/news',
    reports: '/reports',
    explore: '/explore',
    pro: PRO_PATH,
  };

  const handleTabChange = (nextTab) => {
    // An old /transactions link is the portfolio too: «پورتفو» moves it to /portfolio
    if (nextTab === activeTab && !subPath.startsWith('/transactions')) return;
    // The admin area is its own page (pages/AdminApp.jsx): back returns here
    if (nextTab === 'admin') {
      navigate('/admin');
      return;
    }
    if (nextTab === 'portfolio') {
      if (!subPath.startsWith('/portfolio')) goToTab(lastPortfolioPath('/portfolio'));
    } else if (TAB_PATHS[nextTab]) {
      goToTab(appPath(TAB_PATHS[nextTab]));
    } else if (subPath !== '/') {
      goToTab(appPath('/'));
    }
  };


  const tabOptions = useMemo(() => {
    const options = [
      // «خانه» is the widget dashboard; the market (prices and bubbles) is one of the other sections
      ...(listed('home', hasHome) ? [{ value: 'market', label: t('خانه'), icon: <Home size={16} strokeWidth={2} /> }] : []),
      ...(listed('market', hasMarket) ? [{ value: 'rates', label: t('نرخ و حباب'), icon: <TrendingUp size={16} strokeWidth={2} /> }] : []),
      ...(localeHasNews() && listed('news', hasNewsFeature) ? [{ value: 'news', label: t('اخبار'), icon: <Newspaper size={16} strokeWidth={2} /> }] : []),
      ...(listed('explore', hasExplore) ? [{ value: 'explore', label: t('کاوش بازار'), icon: <Compass size={16} strokeWidth={2} /> }] : []),
      ...(listed('incomes', hasIncomes) ? [{ value: 'incomes', label: t('درآمدها'), icon: <Wallet size={16} strokeWidth={2} /> }] : []),
      // Beta (admins): expenses right after incomes, then the accounts they are paid from
      ...(hasExpenses ? [{ value: 'expenses', label: t('هزینه‌ها'), icon: <HandCoins size={16} strokeWidth={2} /> }] : []),
      ...(hasExpenses ? [{ value: 'projects', label: t('پروژه‌ها'), icon: <FolderKanban size={16} strokeWidth={2} /> }] : []),
      ...(hasAccounts ? [{ value: 'accounts', label: t('حساب‌ها'), icon: <WalletCards size={16} strokeWidth={2} /> }] : []),
      // Android app: the bank messages it read, next to the expenses and incomes they become
      ...(smsEnabled() && hasExpenses ? [{ value: 'sms', label: t('پیامک‌ها'), icon: <MessageSquareText size={16} strokeWidth={2} /> }] : []),
      ...(listed('portfolio', hasPortfolio) ? [{ value: 'portfolio', label: t('پورتفو'), icon: <Briefcase size={16} strokeWidth={2} /> }] : []),
      ...(listed('loans', hasLoans) ? [{ value: 'loans', label: t('وام و اقساط'), icon: <Landmark size={16} strokeWidth={2} /> }] : []),
      ...(listed('cheques', hasCheques) ? [{ value: 'cheques', label: t('چک‌ها'), icon: <ReceiptText size={16} strokeWidth={2} /> }] : []),
      ...(user && listed('subscriptions', hasSubscriptions) ? [{ value: 'subscriptions', label: t('اشتراک‌ها'), icon: <CalendarSync size={16} strokeWidth={2} /> }] : []),
      ...(user && listed('goals', hasGoals) ? [{ value: 'goals', label: t('اهداف'), icon: <Target size={16} strokeWidth={2} /> }] : []),
      ...(user && listed('reports', hasReports) ? [{ value: 'reports', label: t('گزارش‌ها'), icon: <ChartColumn size={16} strokeWidth={2} /> }] : []),
      // Free users: the page comparing the plans, with the button to ask for Pro
      ...(user && !isDemo && !isPro ? [{ value: 'pro', label: 'Pro', icon: <Crown size={16} strokeWidth={2} /> }] : []),
    ];
    if (user && !isDemo) {
      options.push(
        { value: 'settings', label: t('تنظیمات'), icon: <Settings size={16} strokeWidth={2} /> }
      );
      if (isNativeApp()) {
        options.push({ value: 'app-settings', label: t('تنظیمات اپ'), icon: <Smartphone size={16} strokeWidth={2} /> });
      }
    }
    if (user?.role === 'admin') {
      options.push(
        { value: 'admin', label: t('پنل مدیریت'), icon: <ShieldCheck size={16} strokeWidth={2} /> }
      );
    }
    return options;
  }, [user, isDemo, isPro, hasExpenses, hasAccounts, hasMarket, hasNewsFeature, hasExplore, hasReports, offered.join(), hasHome, hasPortfolio, hasIncomes, hasLoans, hasCheques, hasSubscriptions, hasGoals]);


  // The sections gathered into groups (shared/app/navGroups.js): the website's tabs, each group
  // with several sections a dropdown of them (the account group is the avatar's menu)
  const tabGroups = useMemo(() => buildNavGroups(tabOptions).filter((g) => !g.menu), [tabOptions]);

  const {
    calcData,
    globalSettings,
    loading: marketLoading,
    usdToman,
  } = useMarketData();

  const announcement = globalSettings?.announcement;
  const analysis = calcData?.analysis;
  const recommendation = calcData?.recommendation;
  const currencies = calcData?.currencies;

  const usdNum = parseFloat(toEnglishDigits(String(usdToman)).replace(/,/g, '')) || 0;
  // The book's price; its intrinsic value (at the calculator's rates) only when no source prices it
  const gold18kItem = calcData?.analysis?.find((i) => i.id === 'gold_18k');
  const gold18kPrice = gold18kItem?.market || gold18kItem?.intrinsic || null;


  // The app's home dashboard: its cards open a section, the market, or a form
  const openFromHome = (target) => {
    if (target === 'add-expense') navigate(appPath('/expenses?add=expense'));
    else handleTabChange(target);
  };
  // Every section waits for the encryption passphrase (the admin area is its own page)
  const needsVaultSetup =
    Boolean(user) && !isDemo && vault.status === 'off';


  return (
    <AppLayout
      usdToman={usdToman}
      gold18kPrice={gold18kPrice}
      activeTab={activeTab}
      setActiveTab={handleTabChange}
      navItems={tabOptions}
    >
      {/* A tab just opened and still waiting on the server: nothing else can be opened meanwhile */}
      <TabLoadingGate tab={activeTab} />
      {!isDemo && <PlanLimitPrompt />}
      {/* Maintenance mode is on: only admins reach this page, remind them to switch it off */}
      {maintenance?.enabled && user?.role === 'admin' && (
        <AlertBanner
          type="warning"
          icon={<Wrench size={16} />}
          message={t('حالت توسعه فعال است: فقط مدیران به سایت دسترسی دارند و بقیه صفحه «در حال به‌روزرسانی» را می‌بینند.')}
          action={
            <Button size="sm" variant="secondary" onClick={() => handleTabChange('admin')}>
              {t('پنل مدیریت')}
            </Button>
          }
          style={{ marginBottom: '20px' }}
        />
      )}

      {/* Every alert goes through one store (shared/alerts): published here, shown by the
          header's bell and by the banners on the page each one concerns */}
      <AppAlertSources announcement={isDemo ? '' : announcement} />
      <AlertStack sources={['system']} className="main-system-alerts" />

      {/* The site's group tabs (in the app frame — the Android app and phones — the bottom bar's
          groups ask for the section in a sheet) */}
      {!appLayout && (
      <div className="main-nav-container">
        <div className="main-nav-tabs-bar">
          <GroupTabs groups={tabGroups} activeTab={activeTab} onSelect={handleTabChange} />
        </div>
      </div>
      )}

      {/* Only where prices are shown */}
      {['rates', 'portfolio', 'explore'].includes(activeTab) && (hasMarket || activeTab === 'portfolio') && <PriceRefreshStatus />}

      {/* Tab Views */}
      <section className="tab-view-container">
        {/* Encryption is mandatory: a new account (no data yet) chooses its passphrase first */}
        {needsVaultSetup ? (
          <VaultSetupScreen />
        ) : (
        <>
        {/* The free plan's limit on the open section */}
        {!isDemo && <PlanNote section={activeTab} />}


        {/* Due-date alerts: on the home page they are a widget («یادآورها»), and each on its own
            page — not repeated on every other page (the bell lists them all) */}
        {activeTab === 'loans' && <AlertStack sources={['loan']} />}
        {activeTab === 'cheques' && <AlertStack sources={['cheque']} />}
        {activeTab === 'subscriptions' && <AlertStack sources={['subscription']} />}

        {/* The home: the user's widget dashboard (the website's and the app's each arranged on their own) */}
        {activeTab === 'market' && !hasHome && <SectionOffer feature="home" name={t('خانه')} />}
        {activeTab === 'market' && hasHome && (
          <Suspense fallback={<TabLoader />}>
            <Dashboard
              usdToman={usdNum}
              analysis={analysis}
              currencies={currencies}
              recommendation={recommendation}
              marketLoading={marketLoading}
              onOpen={openFromHome}
            />
          </Suspense>
        )}

        {activeTab === 'rates' && (
          <div className="market-tab-content">
            {hasMarket ? (
              /* The user's own home page: sections of any assets, customizable per user */
              <HomeDashboard
                analysis={analysis}
                currencies={currencies}
                recommendation={recommendation}
                loading={marketLoading}
              />
            ) : (
              <FeatureOffer
                feature="market"
                name={t('صفحه‌ی نرخ و حباب')}
                subtitle={t('بازار امروز را یک‌جا ببینید و صفحه‌ی اول را برای خودتان بچینید.')}
                benefits={MARKET_BENEFITS}
              />
            )}
          </div>
        )}

        {/* A section that fails to render shows a message; the navigation stays (another tab tries again) */}
        <ErrorBoundary resetKey={activeTab}>
        <Suspense fallback={<TabLoader />}>
        {activeTab === 'portfolio' && !hasPortfolio && <SectionOffer feature="portfolio" name={t('پورتفو')} />}
        {activeTab === 'portfolio' && hasPortfolio && (
          <PortfolioTracker
            initialPortfolioId={params.portfolioId || searchParams.get('p') || searchParams.get('id') || null}
          />
        )}

        {activeTab === 'loans' && (hasLoans
          ? <LoansPage initialLoanId={params.loanId || searchParams.get('id') || null} />
          : <SectionOffer feature="loans" name={t('وام و اقساط')} />)}

        {activeTab === 'incomes' && (hasIncomes ? <IncomesPage /> : <SectionOffer feature="incomes" name={t('درآمدها')} />)}

        {activeTab === 'cheques' && (hasCheques ? <ChequesPage /> : <SectionOffer feature="cheques" name={t('چک‌ها')} />)}

        {activeTab === 'subscriptions' && (hasSubscriptions ? <SubscriptionsPage /> : <SectionOffer feature="subscriptions" name={t('اشتراک‌ها')} />)}
        {activeTab === 'goals' && (hasGoals ? <GoalsPage /> : <SectionOffer feature="goals" name={t('اهداف')} />)}

        {activeTab === 'accounts' && <AccountsPage />}

        {activeTab === 'expenses' && <ExpensesPage />}

        {activeTab === 'projects' && (
          <ProjectsPage
            groupId={subPath.match(/^\/projects\/([^/]+)/)?.[1] || null}
            onSelectGroup={(id) => navigate(appPath(id ? `/projects/${id}` : '/projects'), { replace: true })}
          />
        )}

        {activeTab === 'settings' && (
          <AccountSettingsView />
        )}

        {activeTab === 'app-settings' && (
          <AppSettingsView onOpenSms={hasExpenses ? () => handleTabChange('sms') : null} />
        )}

        {activeTab === 'sms' && <SmsInboxPage />}

        {activeTab === 'news' && (hasNews ? <NewsPage /> : (
          <FeatureOffer
            feature="news"
            name={t('اخبار بازار')}
            subtitle={t('مهم‌ترین خبرهای ارز، طلا و اقتصاد را با تحلیل روز یک‌جا بخوانید.')}
            benefits={NEWS_BENEFITS}
          />
        ))}

        {activeTab === 'reports' && (hasReports ? <ReportsPage /> : (
          <FeatureOffer
            feature="reports"
            name={t('گزارش‌های سالانه')}
            subtitle={t('درآمد، هزینه و سرمایه‌گذاری یک سال را یک‌جا ببینید.')}
            benefits={REPORTS_BENEFITS}
          />
        ))}

        {activeTab === 'explore' && (hasExplore ? <ExplorePage /> : (
          <FeatureOffer
            feature="explore"
            name={t('کاوش بازار')}
            subtitle={t('هر دارایی بازار را جست‌وجو کنید و قیمت، اطلاعات و نمودارش را ببینید.')}
            benefits={EXPLORE_BENEFITS}
          />
        ))}

        {activeTab === 'pro' && <ProPage />}

        </Suspense>
        </ErrorBoundary>
        </>
        )}
      </section>
    </AppLayout>
  );
}

