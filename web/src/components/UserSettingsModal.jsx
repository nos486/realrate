import React, { useState, useEffect } from 'react';
import { apiGetUserSettings, apiUpdateUserSettings } from '../api/client.js';

export default function UserSettingsModal({ isOpen, onClose, onSaved }) {
  const [customName, setCustomName] = useState('');
  const [shareSlug, setShareSlug] = useState('');
  const [shareEnabled, setShareEnabled] = useState(false);
  const [sharePassword, setSharePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setMsg({ text: '', type: '' });
      setCopied(false);
      apiGetUserSettings()
        .then((res) => {
          if (res.success && res.settings) {
            const s = res.settings;
            setCustomName(s.customName || '');
            setShareSlug(s.shareSlug || '');
            setShareEnabled(!!s.shareEnabled);
            setSharePassword(s.sharePassword || '');
          }
        })
        .catch((err) => {
          setMsg({ text: 'خطا در دریافت تنظیمات: ' + err.message, type: 'error' });
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const fullShareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/p/${shareSlug || ''}`
    : `/p/${shareSlug || ''}`;

  const handleCopyLink = () => {
    if (!shareSlug) return;
    navigator.clipboard.writeText(fullShareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', type: '' });

    if (shareEnabled && (!sharePassword || sharePassword.trim().length === 0)) {
      setMsg({ text: 'لطفاً برای اشتراک‌گذاری پورتفو، حتماً یک رمز عبور تعیین فرمایید.', type: 'error' });
      setSaving(false);
      return;
    }

    try {
      const res = await apiUpdateUserSettings({
        customName,
        shareSlug,
        sharePassword,
        shareEnabled,
      });

      if (res.success) {
        setMsg({ text: 'تنظیمات با موفقیت ذخیره شد.', type: 'success' });
        if (onSaved) onSaved(res.settings);
        setTimeout(() => {
          onClose();
        }, 1200);
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
      <div className="modal-content settings-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">⚙️</span>
            <div>
              <h3>تنظیمات حساب و اشتراک‌گذاری پورتفو</h3>
              <p className="modal-subtitle">مدیریت آدرس اختصاصی، لینک عمومی و رمز عبور محافظ پورتفو</p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="بستن">✕</button>
        </div>

        {loading ? (
          <div className="settings-loading">
            <div className="spinner-glow"></div>
            <span>در حال بارگذاری تنظیمات...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="settings-form">
            {msg.text && (
              <div className={`settings-alert-banner ${msg.type}`}>
                {msg.type === 'success' ? '✅ ' : '⚠️ '}
                {msg.text}
              </div>
            )}

            {/* Display Name */}
            <div className="form-group">
              <label htmlFor="settingsCustomName">نام نمایشی پورتفو</label>
              <input
                type="text"
                id="settingsCustomName"
                placeholder="مثلاً: پورتفوی سرمایه‌گذاری سینا"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <span className="input-hint">این نام در بالای صفحه اشتراک‌گذاری شده به بینندگان نمایش داده می‌شود.</span>
            </div>

            {/* Share Enabled Toggle */}
            <div className="share-toggle-card">
              <div className="toggle-info">
                <div className="toggle-title-row">
                  <span className="share-status-indicator" style={{ backgroundColor: shareEnabled ? '#10b981' : '#64748b' }}></span>
                  <strong>قابلیت مشاهده عمومی پورتفو (اشتراک‌گذاری)</strong>
                </div>
                <span>در صورت فعال بودن، هر کس با داشتن لینک اختصاصی و وارد کردن رمز عبور می‌تواند پورتفوی شما را ببیند.</span>
              </div>
              <label className="switch-wrapper">
                <input
                  type="checkbox"
                  checked={shareEnabled}
                  onChange={(e) => setShareEnabled(e.target.checked)}
                />
                <span className="switch-slider"></span>
              </label>
            </div>

            {/* Share Slug / URL */}
            <div className="form-group">
              <label htmlFor="settingsShareSlug">آدرس اختصاصی پورتفو (شناسه URL)</label>
              <div className="slug-input-wrapper">
                <span className="slug-prefix">realrate.geekio.org/p/</span>
                <input
                  type="text"
                  id="settingsShareSlug"
                  placeholder="sina"
                  dir="ltr"
                  value={shareSlug}
                  onChange={(e) => setShareSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                />
              </div>
              <span className="input-hint">فقط از حروف و ارقام انگلیسی، خط تیره (-) یا زیرخط (_) استفاده کنید.</span>
            </div>

            {/* Live Copy Link Box */}
            {shareSlug && (
              <div className="share-link-copy-box">
                <div className="link-text" dir="ltr">{fullShareUrl}</div>
                <button
                  type="button"
                  className={`btn-copy-link ${copied ? 'copied' : ''}`}
                  onClick={handleCopyLink}
                >
                  {copied ? 'کپی شد! ✓' : 'کپی لینک 📋'}
                </button>
              </div>
            )}

            {/* Share Password Protection */}
            <div className="form-group">
              <label htmlFor="settingsSharePassword">
                <span>رمز عبور محافظت از پورتفو</span>
                <span className="required-tag">* الزامی برای اشتراک‌گذاری</span>
              </label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="settingsSharePassword"
                  placeholder="یک رمز عبور امن وارد فرمایید..."
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-toggle-pwd"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'مخفی کردن' : 'نمایش رمز'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              <span className="input-hint">
                🔒 بینندگان پورتفو قبل از باز شدن اقلام، موظف به وارد کردن این رمز عبور خواهند بود.
              </span>
            </div>

            {/* Modal Actions */}
            <div className="modal-actions">
              <button type="button" className="btn-modal-cancel" onClick={onClose} disabled={saving}>
                انصراف
              </button>
              <button type="submit" className="btn-modal-submit" disabled={saving}>
                {saving ? 'در حال ذخیره‌سازی...' : '💾 ذخیره تغییرات'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
