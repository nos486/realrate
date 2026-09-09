import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from './Card.jsx';

/**
 * Reusable Admin Profile Bar
 * Shows current admin profile info and optional custom action buttons.
 */
export default function AdminNav({
  actions = null,
  className = '',
}) {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <Card className={`admin-profile-bar admin-nav-header-bar ${className}`} padding="sm">
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

      {actions && (
        <div className="admin-actions">
          {actions}
        </div>
      )}
    </Card>
  );
}

