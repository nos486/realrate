import React, { useState, useEffect } from 'react';
import { apiGetUserSettings, apiUpdateUserSettings, apiUpdatePortfolio } from '../api/client.js';
import {
  generateE2eeSalt,
  deriveE2eeKey,
  createE2eeVerifier,
  verifyE2eeKey,
  saveVaultPassphraseToSession,
  getVaultPassphraseFromSession,
  clearVaultPassphraseFromSession,
} from '../lib/e2ee.js';

export function generateRandomSlug(len = 8) {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let slug = '';
  for (let i = 0; i < len; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

export default function UserSettingsModal({ isOpen, portfolio, onClose, onSaved, canDelete, onDelete }) {
  const [portfolioName, setPortfolioName] = useState('');
  const [customName, setCustomName] = useState('');
  const [shareSlug, setShareSlug] = useState('');
  const [shareEnabled, setShareEnabled] = useState(false);
  const [sharePassword, setSharePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  // E2EE Vault States
  const [isE2ee, setIsE2ee] = useState(false);
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultPasswordConfirm, setVaultPasswordConfirm] = useState('');
  const [showVaultPassword, setShowVaultPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setMsg({ text: '', type: '' });
      setCopied(false);

      if (portfolio) {
        setPortfolioName(portfolio.name || '');
        setShareSlug(portfolio.shareSlug || generateRandomSlug(8));
        setShareEnabled(!!portfolio.shareEnabled);
        setSharePassword(portfolio.sharePassword || '');
        setIsDefault(!!portfolio.isDefault);
        setIsE2ee(!!portfolio.isE2ee);

        const cachedVaultPass = getVaultPassphraseFromSession(portfolio.id);
        if (cachedVaultPass) {
          setVaultPassword(cachedVaultPass);
          setVaultPasswordConfirm(cachedVaultPass);
        } else {
          setVaultPassword('');
          setVaultPasswordConfirm('');
        }
      }

      apiGetUserSettings()
        .then((res) => {
          if (res.success && res.settings) {
            const s = res.settings;
            setCustomName(s.customName || '');
            if (!portfolio) {
              setShareSlug(s.shareSlug || generateRandomSlug(8));
              setShareEnabled(!!s.shareEnabled);
              setSharePassword(s.sharePassword || '');
            }
          }
        })
        .catch((err) => {
          setMsg({ text: 'خطا در دریافت تنظیمات: ' + err.message, type: 'error' });
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, portfolio]);

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
    try {
      let e2eeSalt = portfolio?.e2eeSalt || '';
      let e2eeVerifier = portfolio?.e2eeVerifier || '';

      if (isE2ee) {
        const cleanPass = vaultPassword.trim();
        if (!cleanPass || cleanPass.length < 4) {
          setMsg({ text: 'رمز عبور گاوصندوق E2EE باید حداقل ۴ کاراکتر باشد.', type: 'error' });
          setSaving(false);
          return;
        }
        if (cleanPass !== vaultPasswordConfirm.trim()) {
          setMsg({ text: 'تکرار رمز عبور گاوصندوق با رمز وارد شده همخوانی ندارد.', type: 'error' });
          setSaving(false);
          return;
        }

        // Generate or update salt & verifier
        if (!e2eeSalt || !e2eeVerifier || (portfolio && !portfolio.isE2ee)) {
          e2eeSalt = generateE2eeSalt();
          const key = await deriveE2eeKey(cleanPass, e2eeSalt);
          e2eeVerifier = await createE2eeVerifier(key);
        } else {
          // Check if password matches existing verifier or needs new salt
          const key = await deriveE2eeKey(cleanPass, e2eeSalt);
          const valid = await verifyE2eeKey(key, e2eeVerifier);
          if (!valid) {
            e2eeSalt = generateE2eeSalt();
            const newKey = await deriveE2eeKey(cleanPass, e2eeSalt);
            e2eeVerifier = await createE2eeVerifier(newKey);
          }
        }
        if (portfolio && portfolio.id) {
          saveVaultPassphraseToSession(portfolio.id, cleanPass);
        }
      } else {
        e2eeSalt = '';
        e2eeVerifier = '';
        if (portfolio && portfolio.id) {
          clearVaultPassphraseFromSession(portfolio.id);
        }
      }

      if (portfolio && portfolio.id) {
        await apiUpdatePortfolio({
          id: portfolio.id,
          name: portfolioName.trim() || portfolio.name,
          shareSlug,
          sharePassword: sharePassword ? sharePassword.trim() : '',
          shareEnabled,
          isDefault,
          isE2ee,
          e2eeSalt,
          e2eeVerifier,
        });
      }

      const res = await apiUpdateUserSettings({
        customName,
        shareSlug,
        sharePassword: sharePassword ? sharePassword.trim() : '',
        shareEnabled,
      });

      if (res.success) {
        setMsg({ text: 'تنظیمات با موفقیت ذخیره شد.', type: 'success' });
        if (onSaved) {
          onSaved({
            ...res.settings,
            portfolioName,
            portfolioId: portfolio?.id,
            isE2ee,
            e2eeSalt,
            e2eeVerifier,
          });
        }
        setTimeout(() => {
          onClose();
        }, 1100);
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
              <h3>تنظیمات «{portfolioName || 'پورتفو'}»</h3>
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

            {/* Portfolio Name */}
            <div className="form-group">
              <label htmlFor="settingsPortfolioName">نام پورتفو</label>
              <input
                type="text"
                id="settingsPortfolioName"
                placeholder="نام پورتفو..."
                value={portfolioName}
                onChange={(e) => setPortfolioName(e.target.value)}
                required
              />
            </div>

            {/* Owner Display Name */}
            <div className="form-group">
              <label htmlFor="settingsCustomName">نام نمایشی مالک</label>
              <input
                type="text"
                id="settingsCustomName"
                placeholder="نام نمایشی..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </div>

            {/* Default Portfolio Toggle */}
            <div className="share-toggle-card default-portfolio-toggle">
              <div className="toggle-info">
                <div className="toggle-title-row">
                  <span className="share-status-indicator" style={{ backgroundColor: isDefault ? '#f59e0b' : '#64748b' }}></span>
                  <strong>پورتفوی پیش‌فرض (اصلی) ⭐</strong>
                </div>
              </div>
              <label className="switch-wrapper">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                />
                <span className="switch-slider"></span>
              </label>
            </div>

            {/* Share Enabled Toggle */}
            <div className={`share-toggle-card ${shareEnabled ? 'active' : ''}`}>
              <div className="toggle-info">
                <div className="toggle-title-row">
                  <span className="share-status-indicator" style={{ backgroundColor: shareEnabled ? '#10b981' : '#64748b' }}></span>
                  <strong>اشتراک‌گذاری عمومی</strong>
                </div>
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

            {/* Custom URL Slug */}
            <div className="form-group">
              <label htmlFor="settingsShareSlug">آدرس اختصاصی (URL)</label>
              <div className="slug-input-wrapper">
                <span className="slug-prefix">/p/</span>
                <input
                  type="text"
                  id="settingsShareSlug"
                  placeholder="مثال: my-gold-portfolio"
                  value={shareSlug}
                  onChange={(e) => setShareSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                  pattern="[a-zA-Z0-9_-]{2,40}"
                  title="فقط حروف انگلیسی، اعداد، خط فاصله (-) و زیرخط (_)"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Share Link Preview (Only when sharing is enabled) */}
            {shareEnabled && shareSlug && (
              <div className="share-url-preview-card">
                <div className="preview-link-text" dir="ltr">{fullShareUrl}</div>
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
              <label htmlFor="settingsSharePassword">رمز عبور مشاهده (اختیاری)</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="settingsSharePassword"
                  placeholder="رمز عبور دلخواه..."
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
            </div>

            {/* E2EE Vault Toggle Card */}
            <div className={`vault-toggle-card ${isE2ee ? 'active' : ''}`}>
              <div className="vault-toggle-header">
                <div className="toggle-info">
                  <div className="toggle-title-row">
                    <span className="share-status-indicator" style={{ backgroundColor: isE2ee ? '#10b981' : '#64748b' }}></span>
                    <strong>گاوصندوق فوق امنیتی (رمزنگاری E2EE) 🔐</strong>
                  </div>
                  <span className="vault-subtitle">
                    رمزنگاری سرتاسری کلاینت (Zero-Knowledge) با رمز شخصی
                  </span>
                </div>
                <label className="switch-wrapper">
                  <input
                    type="checkbox"
                    checked={isE2ee}
                    onChange={(e) => setIsE2ee(e.target.checked)}
                  />
                  <span className="switch-slider"></span>
                </label>
              </div>

              {isE2ee && (
                <div className="vault-form-section">
                  <div className="vault-warning-box">
                    <span className="warning-icon">⚠️</span>
                    <p>
                      <strong>هشدار فوق امنیتی:</strong> این رمز فقط در ذهن شما نگهداری می‌شود و حتی سرور یا مدیر سایت به آن دسترسی ندارد. در صورت فراموشی، دارایی‌های این پورتفو برای همیشه قفل و غیرقابل بازیابی خواهند بود.
                    </p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="settingsVaultPassword">رمز عبور / PIN گاوصندوق</label>
                    <div className="password-input-wrapper">
                      <input
                        type={showVaultPassword ? 'text' : 'password'}
                        id="settingsVaultPassword"
                        placeholder="حداقل ۴ کاراکتر یا عدد..."
                        value={vaultPassword}
                        onChange={(e) => setVaultPassword(e.target.value)}
                        required={isE2ee}
                      />
                      <button
                        type="button"
                        className="btn-toggle-pwd"
                        onClick={() => setShowVaultPassword(!showVaultPassword)}
                        title={showVaultPassword ? 'مخفی کردن' : 'نمایش رمز'}
                      >
                        {showVaultPassword ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="settingsVaultPasswordConfirm">تکرار رمز عبور گاوصندوق</label>
                    <input
                      type={showVaultPassword ? 'text' : 'password'}
                      id="settingsVaultPasswordConfirm"
                      placeholder="تکرار رمز..."
                      value={vaultPasswordConfirm}
                      onChange={(e) => setVaultPasswordConfirm(e.target.value)}
                      required={isE2ee}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="modal-actions-split">
              {canDelete ? (
                <button
                  type="button"
                  className="btn-modal-delete"
                  onClick={onDelete}
                  disabled={saving}
                  title={`حذف پورتفوی «${portfolio?.name || ''}»`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  <span>حذف پورتفو</span>
                </button>
              ) : (
                <div />
              )}

              <div className="modal-actions-right">
                <button type="button" className="btn-modal-cancel" onClick={onClose} disabled={saving}>
                  انصراف
                </button>
                <button type="submit" className="btn-modal-submit" disabled={saving}>
                  {saving ? 'در حال ذخیره...' : '💾 ذخیره تغییرات'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
