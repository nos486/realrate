/**
 * AdminApp.jsx — The admin area, at /admin: its own page with its own navigation, apart from the
 * app's sections
 *
 *   /admin          users, stats and site settings (AdminPanel)
 *   /admin/sources  price sources
 *   /admin/history  the price history and its tgju backfill
 *   /admin/groups   groups of users, join requests, and who gets which feature
 *
 * Only admins get in; anyone else sees a short notice with a way back to the app.
 */

import React, { Suspense, lazy } from 'react';
import { NavLink, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldCheck, Users, Radio, History, ArrowRight, Ban, UsersRound, Newspaper } from 'lucide-react';
import { useAuth } from '../features/auth/index.js';
import { EmptyState } from '../shared/ui/index.js';
import { APP_BASE } from '../shared/routes.js';
import { useDocumentTitle } from '../shared/hooks/useDocumentTitle.js';

const AdminPanel = lazy(() => import('../features/admin/components/AdminPanel.jsx'));
const PriceSourcesPage = lazy(() => import('./PriceSourcesPage.jsx'));
const PriceHistoryAdmin = lazy(() => import('../features/admin/components/PriceHistoryAdmin.jsx'));
const AdminGroupsPage = lazy(() => import('../features/admin/components/AdminGroupsPage.jsx'));
const AdminNewsPage = lazy(() => import('../features/admin/components/AdminNewsPage.jsx'));

const SECTIONS = [
  { path: '/admin', label: 'کاربران و تنظیمات', icon: Users, end: true },
  { path: '/admin/groups', label: 'گروه‌ها و دسترسی‌ها', icon: UsersRound },
  { path: '/admin/sources', label: 'سورس‌های قیمت', icon: Radio },
  { path: '/admin/history', label: 'تاریخچه‌ی قیمت', icon: History },
  { path: '/admin/news', label: 'اخبار', icon: Newspaper },
];

function SectionLoader() {
  return (
    <div className="require-auth-loading">
      <div className="spinner-glow" />
    </div>
  );
}

export default function AdminApp() {
  const { user } = useAuth();
  useDocumentTitle('مدیریت | RealRate');

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
        {user?.role === 'admin' && (
          <nav className="admin-nav" aria-label="بخش‌های مدیریت">
            {SECTIONS.map(({ path, label, icon: Icon, end }) => (
              <NavLink key={path} to={path} end={end} className={({ isActive }) => `admin-nav-item ${isActive ? 'is-active' : ''}`}>
                <Icon size={16} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="admin-main">
        {user?.role !== 'admin' ? (
          <EmptyState
            icon={<Ban size={44} strokeWidth={1.5} />}
            title="دسترسی مدیریت ندارید"
            description={`حساب ${user?.email || ''} به عنوان مدیر سیستم ثبت نشده است.`}
          />
        ) : (
          <Suspense fallback={<SectionLoader />}>
            <Routes>
              <Route index element={<AdminPanel />} />
              <Route path="sources" element={<PriceSourcesPage embedded />} />
              <Route path="derived" element={<Navigate to="/admin/sources" replace />} />
              <Route path="history" element={<PriceHistoryAdmin />} />
              <Route path="groups" element={<AdminGroupsPage />} />
              <Route path="news" element={<AdminNewsPage />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </Suspense>
        )}
      </main>
    </div>
  );
}
