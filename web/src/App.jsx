import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import MainPage from './pages/MainPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import SharedPortfolioPage from './pages/SharedPortfolioPage.jsx';
import FullscreenLoader from './shared/ui/FullscreenLoader.jsx';
import RequireAuth from './shared/ui/RequireAuth.jsx';
import { APP_BASE, LANDING_PATH } from './shared/routes.js';
import { PricingProvider } from './features/market/index.js';
import { LoansProvider } from './features/loans/index.js';

/**
 * Links from the short-lived period when every section lived under /app/... — redirect them
 * to the section's own top-level route so old bookmarks keep working.
 */
function LegacyAppRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={`${pathname.slice(APP_BASE.length)}${search}`} replace />;
}

/**
 * Wraps every route that needs live pricing (the authenticated app, plus the public shared-
 * portfolio view) — but never the landing page, which has no real prices on it at all. Scoping
 * the provider here instead of around the whole app means its fetch to /api/prices and
 * /api/market/items only ever fires once one of those routes actually mounts, never for a
 * logged-out visitor sitting on /.
 */
function PricingScope() {
  return (
    <PricingProvider>
      <Outlet />
    </PricingProvider>
  );
}

function LoansScope() {
  return (
    <LoansProvider>
      <Outlet />
    </LoansProvider>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        {/* Public, no pricing data */}
        <Route path={LANDING_PATH} element={<LandingPage />} />

        <Route element={<PricingScope />}>
          <Route path="/p/:slug" element={<SharedPortfolioPage />} />

          {/* Authenticated application — home at /app, every section on its own route */}
          <Route element={<RequireAuth />}>
            <Route element={<LoansScope />}>
              <Route path={APP_BASE} element={<MainPage />} />
              <Route path="/rates" element={<MainPage />} />
              <Route path="/market" element={<Navigate to={APP_BASE} replace />} />
              <Route path="/portfolio" element={<MainPage />} />
              <Route path="/portfolio/:portfolioId" element={<MainPage />} />
              <Route path="/transactions" element={<MainPage />} />
              <Route path="/transactions/:portfolioId" element={<MainPage />} />
              <Route path="/loans" element={<MainPage />} />
              <Route path="/loans/:loanId" element={<MainPage />} />
              <Route path="/incomes" element={<MainPage />} />
              <Route path="/settings" element={<MainPage />} />
              <Route path="/admin" element={<MainPage />} />
              <Route path="/admin/sources" element={<MainPage />} />
              <Route path="/admin/derived" element={<Navigate to="/admin/sources" replace />} />
              <Route path="/derived-assets" element={<Navigate to="/admin/sources" replace />} />
              <Route path="/sources" element={<MainPage />} />
              <Route path={`${APP_BASE}/*`} element={<LegacyAppRedirect />} />
            </Route>
          </Route>
        </Route>

        <Route path="/landing" element={<Navigate to={LANDING_PATH} replace />} />
        <Route path="*" element={<Navigate to={LANDING_PATH} replace />} />
      </Routes>
      <FullscreenLoader />
    </>
  );
}
