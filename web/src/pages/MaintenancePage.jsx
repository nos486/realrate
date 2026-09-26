/**
 * MaintenancePage.jsx — Shown instead of the site while maintenance ("under development")
 * mode is on, to everyone but admins
 *
 * Guests get a discreet link to the sign-in page (only an admin can sign in right now); a
 * signed-in user can sign out. Uses the sign-in pages' shell so it matches their look.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Wrench, LogIn, LogOut } from 'lucide-react';
import { useAuth } from '../features/auth/context/AuthContext.jsx';
import { AUTH_PATHS } from '../shared/routes.js';

export default function MaintenancePage() {
  const { user, maintenance, logout } = useAuth();

  return (
    <div className="auth-page" dir="rtl">
      <main className="auth-main">
        <div className="auth-card maintenance-card" role="status">
          <div className="auth-card-head">
            <span className="auth-card-icon maintenance-icon" aria-hidden="true">
              <Wrench size={22} />
            </span>
            <div>
              <h1>در حال به‌روزرسانی</h1>
              <p>RealRate موقتاً در دسترس نیست</p>
            </div>
          </div>
          <p className="maintenance-message">{maintenance?.message}</p>
          <p className="maintenance-note">اطلاعات شما محفوظ است. لطفاً کمی بعد دوباره سر بزنید.</p>
          <div className="maintenance-actions">
            {user ? (
              <button type="button" className="auth-link-btn" onClick={logout}>
                <LogOut size={14} />
                خروج از حساب
              </button>
            ) : (
              <Link to={AUTH_PATHS.login} className="auth-link-btn">
                <LogIn size={14} />
                ورود مدیر
              </Link>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
