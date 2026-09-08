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
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 14px',
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              marginBottom: '16px',
            }}>
              {user?.picture && (
                <img
                  src={user.picture}
                  alt={user.name}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                <strong style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.name || 'کاربر'}
                </strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: theme === 'dark' ? '1.5px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.08)',
                    background: theme === 'dark' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    color: theme === 'dark' ? '#fbbf24' : 'var(--text-muted)',
                    fontSize: '12.5px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                  }}
                  onClick={() => setTheme('dark')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                  <span>حالت تاریک</span>
                </button>

                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '9px 12px',
                    borderRadius: '10px',
                    border: theme === 'light' ? '1.5px solid #d97706' : '1px solid rgba(0, 0, 0, 0.08)',
                    background: theme === 'light' ? 'rgba(217, 119, 6, 0.12)' : 'rgba(0, 0, 0, 0.03)',
                    color: theme === 'light' ? '#d97706' : 'var(--text-muted)',
                    fontSize: '12.5px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                  }}
                  onClick={() => setTheme('light')}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
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
