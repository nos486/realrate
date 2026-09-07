/**
 * Header.jsx — Top navigation bar with brand, analytics, and Google auth
 */
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

const Logo = () => (
  <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" fill="url(#hg)" stroke="url(#hs)" strokeWidth="1.8" />
    <circle cx="20" cy="20" r="13.5" stroke="rgba(251,191,36,0.3)" strokeWidth="1" strokeDasharray="2 2" />
    <path d="M12 24L17 19L21 22L28 14" stroke="url(#hgl)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M24 14H28V18" stroke="url(#hgl)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="20" cy="20" r="2.8" fill="url(#hgl)"/>
    <defs>
      <linearGradient id="hg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f59e0b" stopOpacity="0.25"/>
        <stop offset="1" stopColor="#b45309" stopOpacity="0.1"/>
      </linearGradient>
      <linearGradient id="hs" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fbbf24"/><stop offset="1" stopColor="#d97706"/>
      </linearGradient>
      <linearGradient id="hgl" x1="12" y1="14" x2="28" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fef08a"/><stop offset="0.5" stopColor="#f59e0b"/><stop offset="1" stopColor="#d97706"/>
      </linearGradient>
    </defs>
  </svg>
);

function UserDropdown({ user, onClose, onLogout }) {
  return (
    <div className="user-dropdown" onClick={e => e.stopPropagation()}>
      <div className="user-dropdown-header">
        <img
          src={user.picture || ''}
          alt={user.name}
          className="user-avatar-lg"
          onError={e => { e.target.style.display = 'none'; }}
        />
        <div>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#fff' }}>{user.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', direction: 'ltr' }}>{user.email}</div>
        </div>
      </div>
      <div className="divider" />
      {user.role === 'admin' && (
        <a href="/admin" className="dropdown-item" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          پنل مدیریت
        </a>
      )}
      <button className="dropdown-item danger" onClick={() => { onLogout(); onClose(); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        خروج از حساب
      </button>
    </div>
  );
}

export default function Header({ analytics }) {
  const { user, triggerLogin, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  return (
    <>
      <style>{`
        .header {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 18px;
          margin-bottom: 14px;
          gap: 12px;
          flex-wrap: wrap;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          filter: drop-shadow(0 0 12px rgba(245,158,11,0.3));
        }
        .brand-title h1 {
          font-size: 17px;
          font-weight: 800;
          background: linear-gradient(135deg, #fff 0%, #fde047 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          line-height: 1.2;
        }
        .brand-title p {
          font-size: 10px;
          color: var(--text-muted);
          line-height: 1.3;
          max-width: 200px;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .analytics-pill {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          font-size: 11px;
          color: var(--text-muted);
        }
        .analytics-pill.online {
          background: rgba(16,185,129,0.08);
          border-color: rgba(16,185,129,0.25);
          color: var(--green);
        }
        .google-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all var(--transition);
        }
        .google-btn:hover {
          background: rgba(255,255,255,0.11);
          border-color: var(--border-gold);
        }
        .user-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 4px 10px 4px 6px;
          background: rgba(255,255,255,0.06);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all var(--transition);
          position: relative;
        }
        .user-pill:hover, .user-pill.open {
          background: rgba(255,255,255,0.1);
          border-color: var(--border-gold);
        }
        .user-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          object-fit: cover;
          border: 1.5px solid var(--gold-light);
        }
        .role-badge {
          font-size: 9px;
          padding: 1px 6px;
          border-radius: var(--radius-full);
          font-weight: 700;
        }
        .role-badge.admin {
          background: var(--gold-gradient);
          color: #000;
        }
        .role-badge.user {
          background: rgba(255,255,255,0.1);
          color: var(--text-muted);
        }
        .chevron {
          transition: transform var(--transition);
          opacity: 0.6;
        }
        .user-pill.open .chevron { transform: rotate(180deg); }
        .user-dropdown-wrap {
          position: relative;
        }
        .user-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          min-width: 230px;
          background: rgba(12, 16, 28, 0.98);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-float);
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          z-index: 200;
          animation: dropIn 0.15s ease;
        }
        @keyframes dropIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .user-dropdown-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          background: rgba(255,255,255,0.04);
          border-radius: var(--radius-sm);
        }
        .user-avatar-lg {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--gold-light);
          flex-shrink: 0;
        }
        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          font-weight: 600;
          color: var(--text);
          background: none;
          border: none;
          font-family: inherit;
          cursor: pointer;
          width: 100%;
          text-align: right;
          transition: background var(--transition);
          text-decoration: none;
        }
        .dropdown-item:hover { background: rgba(255,255,255,0.07); }
        .dropdown-item.danger { color: var(--red); }
        .dropdown-item.danger:hover { background: var(--red-dim); }
        @media (max-width: 480px) {
          .brand-title p { display: none; }
          .analytics-pill:not(.online) { display: none; }
        }
      `}</style>

      <header className="header glass">
        <a href="/" className="brand">
          <Logo />
          <div className="brand-title">
            <h1>RealRate</h1>
            <p>تحلیل قیمت واقعی طلا، سکه و ارزهای جهان</p>
          </div>
        </a>

        <div className="header-right">
          {/* Analytics */}
          {analytics && (
            <>
              <div className="analytics-pill online">
                <span className="pulse-dot" />
                <strong>{(analytics.onlineUsers || 0).toLocaleString('fa-IR')}</strong>
              </div>
              <div className="analytics-pill">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <strong>{(analytics.pageViews || 0).toLocaleString('fa-IR')}</strong>
              </div>
            </>
          )}

          {/* Auth */}
          {user ? (
            <div className="user-dropdown-wrap" ref={dropdownRef}>
              <button
                className={`user-pill${dropdownOpen ? ' open' : ''}`}
                onClick={() => setDropdownOpen(o => !o)}
              >
                {user.picture ? (
                  <img src={user.picture} alt={user.name} className="user-avatar" onError={e => e.target.style.display='none'} />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#fbbf24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                )}
                <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr' }}>
                  {user.name?.split(' ')[0] || user.email?.split('@')[0]}
                </span>
                <span className={`role-badge ${user.role}`}>{user.role === 'admin' ? 'مدیر' : 'کاربر'}</span>
                <svg className="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              {dropdownOpen && (
                <UserDropdown user={user} onClose={() => setDropdownOpen(false)} onLogout={logout} />
              )}
            </div>
          ) : (
            <button className="google-btn" onClick={triggerLogin}>
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              ورود با گوگل
            </button>
          )}
        </div>
      </header>
    </>
  );
}
