import React from 'react';
import { Link } from 'react-router-dom';
import { Users, Radio, ExternalLink, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * Reusable Admin Header & Navigation Bar
 * Unifies the admin header, user profile banner, and navigation tabs across:
 * - /admin (Dashboard & Users)
 * - /admin/sources (Price Sources & Charts)
 */
export default function AdminNav({
  activeTab = 'dashboard',
  actions = null,
  className = '',
}) {
  const { user, logout } = useAuth();

  return (
    <div className={`admin-profile-bar admin-nav-header-bar ${className}`}>
      <div className="admin-nav-brand-group">
        {user && (
          <div className="admin-user-info">
            <img
              className="admin-avatar"
              src={user.picture || ''}
              alt={user.name || 'مدیر'}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong style={{ fontSize: '13px', color: 'var(--text-heading)' }}>
                  {user.name || 'مدیر سیستم'}
                </strong>
                <span className="admin-role-badge">
                  <ShieldCheck size={11} style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                  مدیر کل
                </span>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', direction: 'ltr', display: 'block' }}>
                {user.email}
              </span>
            </div>
          </div>
        )}

        {/* Unified Admin Navigation Tabs */}
        <nav className="admin-nav-tabs" aria-label="ناوبری پنل مدیریت">
          <Link
            to="/admin"
            className={`admin-nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <Users size={14} />
            <span>داشبورد عمومی و کاربران</span>
          </Link>
          <Link
            to="/admin/sources"
            className={`admin-nav-tab ${activeTab === 'sources' ? 'active' : ''}`}
          >
            <Radio size={14} />
            <span>مدیریت سورس‌ها و نمودار قیمت</span>
          </Link>
        </nav>
      </div>

      <div className="admin-actions">
        {actions}
        <Link to="/" className="btn-sm site-link" title="مشاهده سایت">
          <span>مشاهده سایت</span>
          <ExternalLink size={12} style={{ marginRight: '4px' }} />
        </Link>
        {logout && (
          <button type="button" className="btn-sm logout" onClick={logout} title="خروج از حساب">
            <LogOut size={12} style={{ marginLeft: '4px' }} />
            <span>خروج</span>
          </button>
        )}
      </div>
    </div>
  );
}
