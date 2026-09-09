import React, { useState, useEffect } from 'react';
import { User, Moon, Sun, ShieldCheck, Save } from 'lucide-react';
import Card from './ui/Card.jsx';
import AlertBanner from './ui/AlertBanner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { apiGetUserSettings, apiUpdateUserSettings } from '../api/client.js';

/**
 * AccountSettingsView
 * Rendered directly as a tab view inside the unified SPA.
 */
export default function AccountSettingsView() {
  const { user, updateUser, triggerLogin } = useAuth();
  const { theme, setTheme } = useTheme();
  const [customName, setCustomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    if (user) {
      setMsg({ text: '', type: '' });
      setCustomName(user.customName || '');
      setLoading(true);

      apiGetUserSettings()
        .then((res) => {
          if (res?.success && res.settings) {
            setCustomName(res.settings.customName || user.customName || '');
          }
        })
        .catch((err) => {
          setMsg({ text: 'خطا در دریافت اطلاعات: ' + err.message, type: 'error' });
        })
        .finally(() => setLoading(false));
    }
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', type: '' });

    try {
      const res = await apiUpdateUserSettings({
        customName: customName.trim(),
      });

      if (res?.success) {
        updateUser({ customName: customName.trim() });
        setMsg({ text: 'تنظیمات حساب کاربری با موفقیت ذخیره شد.', type: 'success' });
      } else {
        setMsg({ text: res.message || 'خطا در ذخیره تنظیمات', type: 'error' });
      }
    } catch (err) {
      setMsg({ text: err.message || 'خطای سرور', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <Card className="admin-container" padding="lg" style={{ margin: '30px auto', maxWidth: '480px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '14px' }}>
          <User size={44} style={{ color: 'var(--accent-blue, #38bdf8)' }} />
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>
          ورود به حساب کاربری
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.7' }}>
          جهت مشاهده و مدیریت تنظیمات حساب، لطفاً ابتدا وارد حساب گوگل خود شوید.
        </p>
        <button className="google-admin-btn" onClick={triggerLogin} style={{ margin: '0 auto' }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>ورود با حساب گوگل</span>
        </button>
      </Card>
    );
  }

  return (
    <Card className="admin-container" padding="lg" style={{ margin: '20px auto', maxWidth: '580px' }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        <span>
          <User size={18} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline', color: 'var(--accent-blue)' }} />
          تنظیمات حساب کاربری
        </span>
      </div>

      {msg.text && (
        <AlertBanner
          type={msg.type}
          message={msg.text}
          onClose={() => setMsg({ text: '', type: '' })}
          style={{ marginBottom: '18px' }}
        />
      )}

      {/* User Profile Overview */}
      <div className="account-user-card" style={{ marginBottom: '22px' }}>
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="account-user-avatar"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="account-user-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-blue)', color: '#000', fontWeight: 800 }}>
            {user.name?.[0] || 'U'}
          </div>
        )}
        <div className="account-user-meta">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong className="account-user-name" style={{ fontSize: '15px' }}>
              {user.name || 'کاربر'}
            </strong>
            {user.role === 'admin' ? (
              <span className="admin-role-badge" style={{ fontSize: '10.5px' }}>
                <ShieldCheck size={11} style={{ verticalAlign: 'middle', marginLeft: '3px' }} />
                مدیر کل
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px' }}>
                کاربر تأییدشده
              </span>
            )}
          </div>
          <span className="account-user-email" style={{ fontSize: '12px', direction: 'ltr', display: 'inline-block' }}>
            {user.email}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Nickname / Display Name Input */}
        <div className="form-group">
          <label htmlFor="userCustomNickname" style={{ fontWeight: 700, fontSize: '13px' }}>
            نام مستعار نمایشی (Nickname)
          </label>
          <input
            type="text"
            id="userCustomNickname"
            placeholder="مثلاً: آریا، سرمایه‌گذار..."
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            maxLength={40}
            disabled={loading || saving}
          />
          <span className="field-sub-note" style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '5px', display: 'block' }}>
            این نام در هدر، بخش پورتفوی شما و پورتفوهای به اشتراک‌گذاشته‌شده به عنوان نام مالک نمایش داده می‌شود.
          </span>
        </div>

        {/* Theme Selector */}
        <div className="form-group">
          <label style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px', display: 'block' }}>
            حالت نمایش و پوسته سامانه
          </label>
          <div className="theme-switch-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <button
              type="button"
              className={`theme-choice-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Moon size={16} strokeWidth={2.2} />
              <span>حالت تاریک (پیش‌فرض)</span>
            </button>

            <button
              type="button"
              className={`theme-choice-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Sun size={16} strokeWidth={2.2} />
              <span>حالت روشن</span>
            </button>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="submit"
          className="btn"
          disabled={saving || loading}
          style={{ marginTop: '8px' }}
        >
          <Save size={16} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline' }} />
          <span>{saving ? 'در حال ذخیره‌سازی...' : 'ذخیره تنظیمات حساب'}</span>
        </button>
      </form>
    </Card>
  );
}
