import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';

/**
 * VaultLockCard.jsx — Reusable Zero-Knowledge E2EE Vault Unlock Component
 *
 * Provides a unified, centered glassmorphism card for unlocking E2EE vaults
 * across PortfolioTracker's Holdings/Transactions sub-tabs and SharedPortfolioPage.
 */
export default function VaultLockCard({
  portfolioName = '',
  title = 'پورتفو قفل است',
  description = null,
  onUnlock,
  error = '',
  loading = false,
  className = '',
  style = {},
}) {
  const [passphrase, setPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [internalError, setInternalError] = useState('');
  const [internalLoading, setInternalLoading] = useState(false);

  const displayError = error || internalError;
  const isBusy = loading || internalLoading;

  const defaultDesc = portfolioName
    ? `برای دسترسی به اطلاعات، رمز عبور پورتفوی «${portfolioName}» را وارد کنید.`
    : 'برای دسترسی به اطلاعات، رمز عبور پورتفو را وارد کنید.';

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!passphrase.trim() || isBusy) return;

    setInternalError('');
    setInternalLoading(true);

    try {
      if (typeof onUnlock === 'function') {
        const success = await onUnlock(passphrase.trim());
        if (success) {
          setPassphrase('');
        }
      }
    } catch (err) {
      setInternalError(err?.message || 'خطا در رمزگشایی گاوصندوق.');
    } finally {
      setInternalLoading(false);
    }
  };

  return (
    <div className={`vault-lock-container ${className}`} style={style}>
      <div className="vault-lock-card">
        <div className="vault-lock-badge">
          <Lock size={13} style={{ verticalAlign: 'middle', marginLeft: '4px' }} />
          گاوصندوق E2EE
        </div>

        <h4 className="vault-lock-title">{title}</h4>

        <p className="vault-lock-desc">
          {description || defaultDesc}
        </p>

        <form className="vault-unlock-form" onSubmit={handleSubmit}>
          <div className="vault-pass-input-wrapper">
            <input
              type={showPass ? 'text' : 'password'}
              className="vault-unlock-input"
              placeholder="رمز عبور..."
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                if (internalError) setInternalError('');
              }}
              autoFocus
              dir="ltr"
              disabled={isBusy}
            />
            <button
              type="button"
              className="btn-toggle-vault-eye"
              onClick={() => setShowPass((prev) => !prev)}
              tabIndex={-1}
              title={showPass ? 'مخفی کردن' : 'نمایش رمز'}
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {displayError && (
            <div className="vault-unlock-error">
              <AlertTriangle
                size={14}
                style={{ verticalAlign: 'middle', marginLeft: '4px', display: 'inline' }}
              />
              <span>{displayError}</span>
            </div>
          )}

          <div className="vault-unlock-actions">
            <button
              type="submit"
              className="btn-vault-unlock"
              disabled={isBusy || !passphrase.trim()}
            >
              {isBusy ? 'در حال بررسی...' : 'بازگشایی'}
            </button>
          </div>
        </form>

        <div className="vault-lock-footer-note">
          رمزگشایی در مرورگر انجام می‌شود و رمز در سرور ذخیره نمی‌گردد.
        </div>
      </div>
    </div>
  );
}
