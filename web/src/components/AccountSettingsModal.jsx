import React, { useState, useEffect } from 'react';
import { User, X, Check, AlertTriangle, Moon, Sun } from 'lucide-react';
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
            <span className="modal-icon"><User size={18} /></span>
            <h3>تنظیمات حساب کاربری</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="بستن">
            <X size={18} />
          </button>
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
                {msg.type === 'success' ? <Check size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} /> : <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} />}
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
                  <Moon size={16} strokeWidth={2.2} />
                  <span>حالت تاریک</span>
                </button>

                <button
                  type="button"
                  className={`theme-choice-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                >
                  <Sun size={16} strokeWidth={2.2} />
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
