import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import MainPage from './pages/MainPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import SharedPortfolioPage from './pages/SharedPortfolioPage.jsx';
import FullscreenLoader from './shared/ui/FullscreenLoader.jsx';
import RequireAuth from './shared/ui/RequireAuth.jsx';
import { APP_BASE, LANDING_PATH, appPath } from './shared/routes.js';
import { PricingProvider } from './features/market/index.js';
import { LoansProvider } from './features/loans/index.js';

/**
 * Old top-level app URLs (before the app moved under /app). Kept as redirects so existing
 * bookmarks and installed shortcuts keep working; RequireAuth then decides login vs landing.
 */
const LEGACY_APP_PATHS = [
  '/rates', '/market', '/portfolio/*', '/transactions/*', '/loans/*', '/incomes',
  '/settings', '/admin/*', '/sources', '/derived-assets',
];

function LegacyAppRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={`${appPath(pathname)}${search}`} replace />;
}

export default function App() {
  return (
    <PricingProvider>
      <LoansProvider>
        <Routes>
          {/* Public */}
          <Route path={LANDING_PATH} element={<LandingPage />} />
          <Route path="/p/:slug" element={<SharedPortfolioPage />} />

          {/* Authenticated application */}
          <Route path={APP_BASE} element={<RequireAuth />}>
            <Route index element={<MainPage />} />
            <Route path="rates" element={<MainPage />} />
            <Route path="market" element={<Navigate to={APP_BASE} replace />} />
            <Route path="portfolio" element={<MainPage />} />
            <Route path="portfolio/:portfolioId" element={<MainPage />} />
            <Route path="transactions" element={<MainPage />} />
            <Route path="transactions/:portfolioId" element={<MainPage />} />
            <Route path="loans" element={<MainPage />} />
            <Route path="loans/:loanId" element={<MainPage />} />
            <Route path="incomes" element={<MainPage />} />
            <Route path="settings" element={<MainPage />} />
            <Route path="admin" element={<MainPage />} />
            <Route path="admin/sources" element={<MainPage />} />
            <Route path="admin/derived" element={<Navigate to={appPath('/admin/sources')} replace />} />
            <Route path="derived-assets" element={<Navigate to={appPath('/admin/sources')} replace />} />
            <Route path="sources" element={<MainPage />} />
            <Route path="*" element={<Navigate to={APP_BASE} replace />} />
          </Route>

          {LEGACY_APP_PATHS.map((path) => (
            <Route key={path} path={path} element={<LegacyAppRedirect />} />
          ))}
          <Route path="/landing" element={<Navigate to={LANDING_PATH} replace />} />
          <Route path="*" element={<Navigate to={LANDING_PATH} replace />} />
        </Routes>
        <FullscreenLoader />
      </LoansProvider>
    </PricingProvider>
  );
}
