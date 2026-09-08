import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { apiGetUserSettings, apiUpdateUserSettings } from '../api/client.js';

export default function AccountSettingsModal({ isOpen, onClose }) {
  const { user, updateUser } = useAuth();
  const { theme, setTheme, themes } = useTheme();
  const [customName, setCustomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    if (isOpen) {
      setMsg({ text: '', type: '' });
      setCustomName(user?.customName || '');
      setLoading(true);

      apiGetUserSettings()
        .then((res) => {
          if (res.success && res.settings) {
            setCustomName(res.settings.customName || user?.customName || '');
          }
        })
        .catch((err) => {
          setMsg({ text: 'خطا در دریافت اطلاعات: ' + err.message, type: 'error' });
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', type: '' });

    try {
      const res = await apiUpdateUserSettings({
        customName: customName.trim(),
      });

      if (res.success) {
        setMsg({ text: 'تنظیمات با موفقیت ذخیره شد.', type: 'success' });
        updateUser({ customName: customName.trim() });
        setTimeout(() => {
          onClose();
        }, 900);
      } else {
        setMsg({ text: res.message || 'خطا در ذخیره تنظیمات', type: 'error' });
      }
    } catch (err) {
      setMsg({ text: err.message || 'خطای سرور', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content settings-modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">👤</span>
            <h3>تنظیمات حساب کاربری</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="بستن">✕</button>
        </div>

        {loading ? (
          <div className="settings-loading">
            <div className="spinner-glow"></div>
            <span>در حال دریافت اطلاعات...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="settings-form">
            {msg.text && (
              <div className={`settings-alert-banner ${msg.type}`}>
                {msg.type === 'success' ? '✓ ' : '⚠️ '}
                {msg.text}
              </div>
            )}

            {/* Read-only User Profile Overview */}
            <div className="account-user-card">
              {user?.picture && (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="account-user-avatar"
                />
              )}
              <div className="account-user-meta">
                <strong className="account-user-name">
                  {user?.name || 'کاربر'}
                </strong>
                <span className="account-user-email">
                  {user?.email}
                </span>
              </div>
            </div>

            {/* Custom Nickname / Owner Name Input */}
            <div className="form-group">
              <label htmlFor="userCustomNickname">نام مستعار (Nickname)</label>
              <input
                type="text"
                id="userCustomNickname"
                placeholder="مثلاً: آریا، سرمایه‌گذار..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                maxLength={40}
                autoFocus
              />
              <span className="field-sub-note">
                این نام در پورتفوهای اشتراک‌گذاشته‌شده به عنوان نام مالک نمایش داده می‌شود.
              </span>
            </div>

            {/* Theme Selector */}
            <div className="form-group" style={{ marginTop: '14px' }}>
              <label>حالت نمایش (پوسته)</label>
              <div className="theme-switch-grid">
                <button
                  type="button"
                  className={`theme-choice-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                  <span>حالت تاریک</span>
                </button>

                <button
                  type="button"
                  className={`theme-choice-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                  </svg>
                  <span>حالت روشن</span>
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="modal-actions" style={{ marginTop: '20px' }}>
              <button type="button" className="btn-modal-cancel" onClick={onClose} disabled={saving}>
                انصراف
              </button>
              <button type="submit" className="btn-modal-submit" disabled={saving}>
                {saving ? 'در حال ذخیره...' : 'ذخیره'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
