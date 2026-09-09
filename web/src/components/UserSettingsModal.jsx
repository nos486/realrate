import React, { useState, useEffect } from 'react';
import {
  Settings,
  Check,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  Trash2,
} from 'lucide-react';
import Modal from './ui/Modal.jsx';
import AlertBanner from './ui/AlertBanner.jsx';
import { apiUpdatePortfolio } from '../api/client.js';
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
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [isOpen]);

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
      setLoading(false);
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

      setMsg({ text: 'تنظیمات با موفقیت ذخیره شد.', type: 'success' });
      if (onSaved) {
        onSaved({
          portfolioName,
          portfolioId: portfolio?.id,
          isE2ee,
          e2eeSalt,
          e2eeVerifier,
        });
      }
      setTimeout(() => {
        onClose();
      }, 900);
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
      title={`تنظیمات «${portfolioName || 'پورتفو'}»`}
      icon={<Settings size={18} />}
      maxWidth="540px"
      onSubmit={!loading ? handleSave : null}
      footer={
        !loading ? (
          <div className="modal-actions-split">
            {canDelete ? (
              <button
                type="button"
                className="btn-danger"
                onClick={onDelete}
                disabled={saving}
                title={`حذف «${portfolio?.name || ''}»`}
              >
                <Trash2 size={14} />
                <span>حذف</span>
              </button>
            ) : (
              <div />
            )}

            <div className="modal-actions-right">
              <button
                type="button"
                className="btn-cancel"
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
          </div>
        ) : null
      }
    >
      {loading ? (
        <div className="settings-loading">
          <div className="spinner-glow"></div>
          <span>در حال بارگذاری تنظیمات...</span>
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

            {/* Default Portfolio Toggle */}
            <div className="share-toggle-card default-portfolio-toggle">
              <div className="toggle-info">
                <div className="toggle-title-row">
                  <span className="share-status-indicator" style={{ backgroundColor: isDefault ? '#f59e0b' : '#64748b' }}></span>
                  <strong>پورتفوی پیش‌فرض</strong>
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
                  <strong>اشتراک‌گذاری</strong>
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
              <label htmlFor="settingsShareSlug">لینک اختصاصی</label>
              <div className="slug-input-wrapper">
                <span className="slug-prefix">/p/</span>
                <input
                  type="text"
                  id="settingsShareSlug"
                  placeholder="مثال: my-portfolio"
                  value={shareSlug}
                  onChange={(e) => setShareSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                  pattern="[a-zA-Z0-9_-]{2,40}"
                  title="حروف انگلیسی، اعداد، خط فاصله (-) و زیرخط (_)"
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
                  {copied ? 'کپی شد' : 'کپی لینک'}
                </button>
              </div>
            )}

            {/* Share Password Protection */}
            <div className="form-group">
              <label htmlFor="settingsSharePassword">رمز عبور لینک (اختیاری)</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="settingsSharePassword"
                  placeholder="رمز دلخواه..."
                  value={sharePassword}
                  onChange={(e) => setSharePassword(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-toggle-pwd"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'مخفی کردن' : 'نمایش رمز'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* E2EE Vault Toggle Card */}
            <div className={`vault-toggle-card ${isE2ee ? 'active' : ''}`}>
              <div className="vault-toggle-header">
                <div className="toggle-info">
                  <div className="toggle-title-row">
                    <span className="share-status-indicator" style={{ backgroundColor: isE2ee ? '#10b981' : '#64748b' }}></span>
                    <strong>رمزنگاری سرتاسری (E2EE)</strong>
                  </div>
                  <span className="vault-subtitle">
                    قفل دارایی‌ها با رمز عبور شخصی
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
                  <AlertBanner
                    type="warning"
                    message="این رمز در سرور ذخیره نمی‌شود. در صورت فراموشی، اطلاعات غیرقابل بازیابی خواهد بود."
                    style={{ marginBottom: '14px' }}
                  />

                  <div className="form-group">
                    <label htmlFor="settingsVaultPassword">رمز عبور</label>
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
                        {showVaultPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="settingsVaultPasswordConfirm">تکرار رمز عبور</label>
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
          </>
        )}
    </Modal>
  );
}
