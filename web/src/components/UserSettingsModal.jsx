import React, { useState, useEffect } from 'react';
import {
  Settings,
  Eye,
  EyeOff,
  Trash2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import Modal from '../shared/ui/Modal.jsx';
import AlertBanner from '../shared/ui/AlertBanner.jsx';
import { apiUpdatePortfolio } from '../api/client.js';
import { rawKeyToLinkToken } from '../lib/e2ee.js';
import { useVault } from '../shared/vault/useVault.js';
import { getPortfolioRawKey, isAccountVaultPortfolio } from '../shared/vault/vaultStore.js';

export function generateRandomSlug(len = 8) {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let slug = '';
  for (let i = 0; i < len; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

/**
 * Portfolio settings: name, default flag and public sharing. End-to-end encryption is managed
 * for the whole account from account settings; this modal only reports the portfolio's state.
 */
export default function UserSettingsModal({ isOpen, portfolio, onClose, onSaved, canDelete, onDelete }) {
  const [portfolioName, setPortfolioName] = useState('');
  const [shareSlug, setShareSlug] = useState('');
  const [shareEnabled, setShareEnabled] = useState(false);
  // The server never returns the share password (it is stored hashed), so this field only
  // ever holds a NEW password; leaving it empty keeps the current one.
  const [sharePassword, setSharePassword] = useState('');
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [removePassword, setRemovePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [copied, setCopied] = useState(false);

  // A portfolio under the account vault is shared with its own key in the link's #fragment —
  // browsers never send the fragment to the server, so only link holders can decrypt.
  const vault = useVault();
  const accountManaged = isAccountVaultPortfolio(portfolio);
  const isLegacyVault = Boolean(portfolio?.isE2ee && !accountManaged);
  const [linkKey, setLinkKey] = useState({ wrapped: '', token: '' });

  useEffect(() => {
    if (!isOpen || !accountManaged || vault.status !== 'unlocked') return undefined;
    let cancelled = false;
    getPortfolioRawKey(portfolio)
      .then((raw) => {
        if (!cancelled) setLinkKey({ wrapped: portfolio.e2eeWrappedKey, token: raw ? rawKeyToLinkToken(raw) : '' });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, accountManaged, portfolio, vault.status]);

  const shareKeyToken =
    accountManaged && vault.status === 'unlocked' && linkKey.wrapped === portfolio?.e2eeWrappedKey ? linkKey.token : '';

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
        setSharePassword('');
        setHasExistingPassword(!!portfolio.hasPassword);
        setRemovePassword(false);
        setIsDefault(!!portfolio.isDefault);
      }
      setLoading(false);
    }
  }, [isOpen, portfolio]);

  if (!isOpen) return null;

  const baseShareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/p/${shareSlug || ''}`
    : `/p/${shareSlug || ''}`;
  const fullShareUrl = shareKeyToken ? `${baseShareUrl}#k=${shareKeyToken}` : baseShareUrl;
  const shareLinkNeedsUnlock = accountManaged && !shareKeyToken;

  const handleCopyLink = () => {
    if (!shareSlug || shareLinkNeedsUnlock) return;
    navigator.clipboard.writeText(fullShareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg({ text: '', type: '' });
    try {
      if (portfolio && portfolio.id) {
        await apiUpdatePortfolio({
          id: portfolio.id,
          name: portfolioName.trim() || portfolio.name,
          shareSlug,
          // undefined → unchanged, '' → removed, otherwise the new password
          sharePassword: removePassword ? '' : (sharePassword.trim() || undefined),
          shareEnabled,
          isDefault,
        });
      }

      setMsg({ text: 'تنظیمات با موفقیت ذخیره شد.', type: 'success' });
      if (onSaved) {
        onSaved({ portfolioName, portfolioId: portfolio?.id });
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
                  disabled={shareLinkNeedsUnlock}
                >
                  {copied ? 'کپی شد' : 'کپی لینک'}
                </button>
              </div>
            )}
            {shareEnabled && accountManaged && (
              <AlertBanner
                type="info"
                message={
                  shareLinkNeedsUnlock
                    ? 'این پورتفو رمزنگاری سرتاسری دارد؛ برای ساخت لینک اشتراک (که کلید نمایش را در خود دارد) ابتدا رمزنگاری حساب را باز کنید.'
                    : 'این لینک کلید رمزگشایی همین پورتفو را در بخش # خود دارد که هرگز به سرور ارسال نمی‌شود. هر کس لینک کامل را داشته باشد می‌تواند این پورتفو را ببیند — فقط این پورتفو، نه بقیه اطلاعات شما.'
                }
              />
            )}

            {/* Share Password Protection */}
            <div className="form-group">
              <label htmlFor="settingsSharePassword">رمز عبور لینک (اختیاری)</label>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="settingsSharePassword"
                  placeholder={hasExistingPassword && !removePassword ? 'رمز تنظیم شده — برای تغییر، رمز جدید وارد کنید' : 'رمز دلخواه...'}
                  value={sharePassword}
                  disabled={removePassword}
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
              {hasExistingPassword && (
                <label className="share-password-remove">
                  <input
                    type="checkbox"
                    checked={removePassword}
                    onChange={(e) => {
                      setRemovePassword(e.target.checked);
                      if (e.target.checked) setSharePassword('');
                    }}
                  />
                  <span>حذف رمز عبور لینک</span>
                </label>
              )}
            </div>

            {/* End-to-end encryption status (managed account-wide from account settings) */}
            <div className={`vault-toggle-card ${portfolio?.isE2ee ? 'active' : ''}`}>
              <div className="toggle-info">
                <div className="toggle-title-row">
                  {portfolio?.isE2ee ? <ShieldCheck size={15} className="vault-modal-icon on" /> : <Lock size={15} className="vault-modal-icon" />}
                  <strong>رمزنگاری سرتاسری (E2EE)</strong>
                </div>
                <span className="vault-subtitle">
                  {accountManaged
                    ? 'این پورتفو با رمزنگاری سرتاسری حساب محافظت می‌شود.'
                    : isLegacyVault
                    ? 'این پورتفو با رمز جداگانه خودش رمزنگاری شده است. با فعال‌سازی رمزنگاری در «تنظیمات حساب»، به رمزنگاری حساب منتقل می‌شود.'
                    : 'رمزنگاری سرتاسری از «تنظیمات حساب» برای همه پورتفوها، وام‌ها و درآمدها یک‌جا فعال می‌شود.'}
                </span>
              </div>
            </div>
          </>
        )}
    </Modal>
  );
}
