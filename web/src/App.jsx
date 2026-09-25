import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import FullscreenLoader from './shared/ui/FullscreenLoader.jsx';
import RequireAuth from './shared/ui/RequireAuth.jsx';
import { APP_BASE, LANDING_PATH, AUTH_PATHS } from './shared/routes.js';
// Direct file imports (not the feature barrels) so the pages below stay in their lazy chunks
import { PricingProvider } from './features/market/context/PricingContext.jsx';
import { LoansProvider } from './features/loans/context/LoansContext.jsx';
import { ChequesProvider } from './features/cheques/context/ChequesContext.jsx';

// Route-level code splitting: a visitor only downloads the page they open
const MainPage = lazy(() => import('./pages/MainPage.jsx'));
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));
const AuthPage = lazy(() => import('./features/auth/components/AuthPage.jsx'));
const SharedPortfolioPage = lazy(() => import('./pages/SharedPortfolioPage.jsx'));

function RouteLoader() {
  return (
    <div className="require-auth-loading" role="status" aria-label="در حال بارگذاری">
      <div className="spinner-glow" />
    </div>
  );
}

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

/** Data with due dates (loan installments, cheques), shared by its page and the home reminders */
function DueDataScope() {
  return (
    <LoansProvider>
      <ChequesProvider>
        <Outlet />
      </ChequesProvider>
    </LoansProvider>
  );
}

export default function App() {
  return (
    <>
      <Suspense fallback={<RouteLoader />}>
      <Routes>
        {/* Public, no pricing data */}
        <Route path={LANDING_PATH} element={<LandingPage />} />
        {/* Sign in / sign up / email links (public, no pricing data) */}
        {Object.values(AUTH_PATHS).map((path) => (
          <Route key={path} path={path} element={<AuthPage />} />
        ))}

        <Route element={<PricingScope />}>
          <Route path="/p/:slug" element={<SharedPortfolioPage />} />

          {/* Authenticated application — home at /app, every section on its own route */}
          <Route element={<RequireAuth />}>
            <Route element={<DueDataScope />}>
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
              <Route path="/cheques" element={<MainPage />} />
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
      </Suspense>
      <FullscreenLoader />
    </>
  );
}
