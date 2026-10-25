/**
 * AdminApp.jsx — The admin area, at /admin: its own page with its own navigation, apart from the
 * app's sections. A top bar (back to the app) and a sidebar of the sections in their groups
 * (features/admin/adminSections.js); on a phone the sidebar is a sideways-scrolling strip.
 *
 *   نمای کلی        /admin           headline numbers, the 30-day chart, the app's versions
 *   کاربران         /admin/users     the users list and each user's detail
 *                   /admin/groups    groups, join requests, feature access and quotas
 *   بازار و قیمت    /admin/sources   price sources
 *                   /admin/history   the price history and its tgju backfill
 *   محتوا و ربات‌ها /admin/news      the news section's channels and feeds
 *                   /admin/bot       the Telegram bot
 *                   /admin/rubika    the Rubika bot
 *   سیستم           /admin/settings  maintenance mode, the site's announcement, the demo account
 *
 * Only admins get in; anyone else sees a short notice with a way back to the app.
 */

import React, { Suspense, lazy, useEffect, useRef } from 'react';
import { NavLink, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from '../shared/ui/ErrorBoundary.jsx';
import { ShieldCheck, ArrowRight, Ban } from 'lucide-react';
import { useAuth } from '../features/auth/index.js';
import { EmptyState } from '../shared/ui/index.js';
import { APP_BASE } from '../shared/routes.js';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle.js';
import { ADMIN_GROUPS } from '../features/admin/adminSections.js';

const AdminDashboardPage = lazy(() => import('../features/admin/components/AdminDashboardPage.jsx'));
const AdminUsersPage = lazy(() => import('../features/admin/components/AdminUsersPage.jsx'));
const AdminSettingsPage = lazy(() => import('../features/admin/components/AdminSettingsPage.jsx'));
const AdminPriceSourcesPage = lazy(() => import('../features/admin/components/AdminPriceSourcesPage.jsx'));
const PriceHistoryAdmin = lazy(() => import('../features/admin/components/PriceHistoryAdmin.jsx'));
const AdminGroupsPage = lazy(() => import('../features/admin/components/AdminGroupsPage.jsx'));
const AdminBotPage = lazy(() => import('../features/admin/components/AdminBotPage.jsx'));
const AdminRubikaPage = lazy(() => import('../features/admin/components/AdminRubikaPage.jsx'));
const AdminNewsPage = lazy(() => import('../features/admin/components/AdminNewsPage.jsx'));

function SectionLoader() {
  return (
    <div className="require-auth-loading" role="status" aria-label="در حال بارگذاری">
      <div className="spinner-glow" />
    </div>
  );
}

/** The sections in their groups: a sidebar on a wide screen, a strip on a phone */
function AdminNav() {
  const { pathname } = useLocation();
  // The strip scrolls sideways on a phone: keep the open section in view
  const navRef = useRef(null);
  useEffect(() => {
    navRef.current?.querySelector('.is-active')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <nav ref={navRef} className="admin-sidebar" aria-label="بخش‌های مدیریت">
      {ADMIN_GROUPS.map((group) => (
        <div key={group.key} className="admin-nav-group" role="group" aria-labelledby={`admin-nav-${group.key}`}>
          <span id={`admin-nav-${group.key}`} className="admin-nav-group-title">{group.label}</span>
          {group.sections.map(({ key, path, label, icon: Icon, end }) => (
            <NavLink key={key} to={path} end={end} className={({ isActive }) => `admin-nav-item ${isActive ? 'is-active' : ''}`}>
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export default function AdminApp() {
  const { pathname } = useLocation();
  const { user, loading } = useAuth();
  useDocumentTitle('مدیریت | RealRate');
  const isAdmin = user?.role === 'admin';

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-topbar-row">
          <Link to="/admin" className="admin-brand">
            <ShieldCheck size={20} />
            <span>مدیریت RealRate</span>
          </Link>
          <span className="admin-user" dir="ltr">{user?.email}</span>
          <Link to={APP_BASE} className="admin-back">
            <ArrowRight size={16} />
            <span>بازگشت به اپ</span>
          </Link>
        </div>
      </header>

      {loading && !user ? (
        <SectionLoader />
      ) : !isAdmin ? (
        <main className="admin-main">
          <EmptyState
            icon={<Ban size={44} strokeWidth={1.5} />}
            title="دسترسی مدیریت ندارید"
            description={`حساب ${user?.email || ''} به عنوان مدیر سیستم ثبت نشده است.`}
          />
        </main>
      ) : (
        <div className="admin-body">
          <AdminNav />
          <main className="admin-main">
            <ErrorBoundary resetKey={pathname}>
              <Suspense fallback={<SectionLoader />}>
                <Routes>
                  <Route index element={<AdminDashboardPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                  <Route path="groups" element={<AdminGroupsPage />} />
                  <Route path="sources" element={<AdminPriceSourcesPage />} />
                  <Route path="derived" element={<Navigate to="/admin/sources" replace />} />
                  <Route path="history" element={<PriceHistoryAdmin />} />
                  <Route path="news" element={<AdminNewsPage />} />
                  <Route path="bot" element={<AdminBotPage />} />
                  <Route path="rubika" element={<AdminRubikaPage />} />
                  <Route path="settings" element={<AdminSettingsPage />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      )}
    </div>
  );
}
