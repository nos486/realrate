import React from 'react';
import { Lock } from 'lucide-react';

/**
 * AuthGate.jsx — Shared "login required" screen for authenticated feature pages
 *
 * Loans, Transactions, and Portfolio each guard their content behind an identical
 * loading-spinner + login-card structure, differing only in title/description/features/
 * privacy note. Consolidated here instead of duplicating ~75 lines of JSX per page.
 */
export default function AuthGate({
  loading = false,
  title,
  description,
  features = [],
  privacyNote,
  onLogin,
}) {
  if (loading) {
    return (
      <div className="portfolio-loading-state">
        <div className="spinner-glow"></div>
        <p>در حال بارگذاری اطلاعات کاربری...</p>
      </div>
    );
  }

  return (
    <div className="portfolio-auth-gate">
      <div className="auth-gate-card">
        <div className="auth-gate-badge">
          <span className="lock-icon">
            <Lock size={15} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          </span>
          <span className="badge-text">نیازمند ورود به حساب کاربری</span>
        </div>

        <h3 className="auth-gate-title">{title}</h3>
        <p className="auth-gate-desc">{description}</p>

        <div className="auth-gate-features">
          {features.map((f, i) => (
            <div className="gate-feature-item" key={i}>
              <span className="feature-icon">{f.icon}</span>
              <div className="feature-info">
                <strong>{f.title}</strong>
                <span>{f.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="auth-gate-actions">
          <button className="btn-google-gate-login" onClick={onLogin}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>ورود با گوگل</span>
          </button>
          <span className="gate-privacy-note">
            <Lock size={12} style={{ verticalAlign: 'middle', marginLeft: '4px', display: 'inline' }} />
            {privacyNote}
          </span>
        </div>
      </div>
    </div>
  );
}
