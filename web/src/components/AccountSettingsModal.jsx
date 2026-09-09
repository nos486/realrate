import React, { useState, useEffect } from 'react';
import { User, Moon, Sun } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import AlertBanner from './ui/AlertBanner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { apiGetUserSettings, apiUpdateUserSettings } from '../api/client.js';

export default function AccountSettingsModal({ isOpen, onClose }) {
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
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
          if (res?.success && res.settings) {
            setCustomName(res.settings.customName || user?.customName || '');
          }
        })
        .catch((err) => {
          setMsg({ text: 'خطا در دریافت اطلاعات: ' + err.message, type: 'error' });
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, user]);

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
        setMsg({ text: 'تنظیمات با موفقیت ذخیره شد.', type: 'success' });
        setTimeout(() => {
          onClose();
        }, 800);
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="تنظیمات حساب کاربری"
      icon={<User size={18} />}
      maxWidth="460px"
      onSubmit={handleSave}
      footer={
        !loading ? (
          <div className="modal-actions-flex-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              انصراف
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving}
            >
              {saving ? 'در حال ذخیره...' : 'ذخیره'}
            </button>
          </div>
        ) : null
      }
    >
      {loading ? (
        <div className="settings-loading">
          <div className="spinner-glow"></div>
          <span>در حال دریافت اطلاعات...</span>
        </div>
      ) : (
        <>
          {msg.text && (
            <AlertBanner
              type={msg.type}
              message={msg.text}
              onClose={() => setMsg({ text: '', type: '' })}
            />
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
          <div className="form-group">
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
        </>
      )}
    </Modal>
  );
}
