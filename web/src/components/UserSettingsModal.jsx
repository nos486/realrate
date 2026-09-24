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
  encryptHoldingForApi,
  decryptHoldingFromApi,
  isHoldingE2eeEncrypted,
  e2eeEncrypt,
  e2eeDecrypt,
} from '../lib/e2ee.js';
import { getPortfolio, updatePortfolioHolding } from '../features/portfolio/api/portfolioApi.js';
import { getTransactions, updateTransaction } from '../features/transactions/api/transactionApi.js';

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
  // The server never returns the share password (it is stored hashed), so this field only
  // ever holds a NEW password; leaving it empty keeps the current one.
  const [sharePassword, setSharePassword] = useState('');
  const [hasExistingPassword, setHasExistingPassword] = useState(false);
  const [removePassword, setRemovePassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  // E2EE Vault States
  const [isE2ee, setIsE2ee] = useState(false);
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultPasswordConfirm, setVaultPasswordConfirm] = useState('');
  const [showVaultPassword, setShowVaultPassword] = useState(false);
  const [disableVaultPassword, setDisableVaultPassword] = useState('');
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [savingMsg, setSavingMsg] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [copied, setCopied] = useState(false);

  const isDisablingE2ee = Boolean(portfolio?.isE2ee && !isE2ee);

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
        setIsE2ee(!!portfolio.isE2ee);

        const cachedVaultPass = getVaultPassphraseFromSession(portfolio.id);
        if (cachedVaultPass) {
          setVaultPassword(cachedVaultPass);
          setVaultPasswordConfirm(cachedVaultPass);
          setDisableVaultPassword(cachedVaultPass);
        } else {
          setVaultPassword('');
          setVaultPasswordConfirm('');
          setDisableVaultPassword('');
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
    setSavingMsg('در حال اعتبارسنجی و ذخیره...');
    setMsg({ text: '', type: '' });
    try {
      let e2eeSalt = portfolio?.e2eeSalt || '';
      let e2eeVerifier = portfolio?.e2eeVerifier || '';

      if (isDisablingE2ee) {
        const passToVerify = disableVaultPassword.trim();
        if (!passToVerify) {
          setMsg({
            text: 'برای غیرفعال‌سازی رمزنگاری سرتاسری و بازگرداندن داده‌ها به حالت عادی، وارد کردن رمز عبور گاوصندوق الزامی است.',
            type: 'error',
          });
          setSaving(false);
          return;
        }

        const derivedKey = await deriveE2eeKey(passToVerify, portfolio.e2eeSalt);
        const isValid = await verifyE2eeKey(derivedKey, portfolio.e2eeVerifier);
        if (!isValid) {
          setMsg({
            text: 'رمز عبور گاوصندوق وارد شده نادرست است. بدون رمز صحیح امکان خاموش کردن وجود ندارد.',
            type: 'error',
          });
          setSaving(false);
          return;
        }

        setSavingMsg('در حال رمزگشایی و بازگردانی داده‌های موجود به حالت عادی...');

        // Disabling E2EE must be all-or-nothing: once we wipe e2eeSalt/e2eeVerifier below, any
        // item that failed to decrypt becomes permanently unrecoverable (its ciphertext can never
        // be re-derived without the salt). So every item must be CONFIRMED decrypted — not just
        // "no exception was thrown" — before we're allowed to proceed. e2eeDecrypt/decryptHoldingFromApi
        // both fail "gracefully" (return null / the original still-encrypted object) on a bad key
        // or corrupted data, with no exception to catch — so each item's outcome is checked
        // explicitly here rather than relying on a try/catch around the whole loop.
        const failedItems = [];

        // 1. Decrypt and revert holdings in DB
        try {
          const hRes = await getPortfolio(portfolio.id);
          if (hRes && Array.isArray(hRes.holdings)) {
            for (const h of hRes.holdings) {
              if (isHoldingE2eeEncrypted(h)) {
                try {
                  const dec = await decryptHoldingFromApi(derivedKey, h);
                  if (!dec || dec.isE2eeEncrypted !== true) {
                    throw new Error('رمزگشایی ناموفق بود');
                  }
                  const plainPayload = {
                    ...dec,
                    portfolioId: portfolio.id,
                    notes: (typeof dec.notes === 'string' && dec.notes.startsWith('enc:e2ee:v1:')) ? '' : (dec.notes || ''),
                  };
                  delete plainPayload.isE2eeEncrypted;
                  await updatePortfolioHolding(plainPayload);
                } catch (itemErr) {
                  failedItems.push(`دارایی «${h.assetName || h.assetId || h.id}»`);
                }
              }
            }
          }
        } catch (hErr) {
          failedItems.push('خطا در دریافت فهرست دارایی‌ها از سرور');
        }

        // 2. Decrypt and revert transactions in DB
        try {
          const txRes = await getTransactions(portfolio.id);
          if (txRes && Array.isArray(txRes.transactions)) {
            for (const tx of txRes.transactions) {
              const rawCipher = tx.encryptedPayload || tx.encrypted_payload || '';
              if (typeof rawCipher === 'string' && rawCipher.startsWith('enc:e2ee:v1:')) {
                try {
                  const decTx = await e2eeDecrypt(derivedKey, rawCipher);
                  if (!decTx || typeof decTx !== 'object') {
                    throw new Error('رمزگشایی ناموفق بود');
                  }
                  const plainJson = JSON.stringify(decTx);
                  await updateTransaction(portfolio.id, tx.id, { encryptedPayload: plainJson });
                } catch (itemErr) {
                  failedItems.push(`تراکنش ${tx.transactionDate ? 'مورخ ' + tx.transactionDate : tx.id}`);
                }
              }
            }
          }
        } catch (txErr) {
          failedItems.push('خطا در دریافت فهرست تراکنش‌ها از سرور');
        }

        if (failedItems.length > 0) {
          setMsg({
            text: `غیرفعال‌سازی رمزنگاری متوقف شد: ${failedItems.length} مورد قابل رمزگشایی نبود (${failedItems.slice(0, 3).join('، ')}${failedItems.length > 3 ? ' و مورد دیگر' : ''}). برای جلوگیری از از‌دست‌رفتن داده، رمزنگاری سرتاسری همچنان فعال باقی ماند و هیچ تغییری اعمال نشد — رمز عبور گاوصندوق را بررسی و دوباره تلاش کنید.`,
            type: 'error',
          });
          setSaving(false);
          return;
        }

        e2eeSalt = '';
        e2eeVerifier = '';
        clearVaultPassphraseFromSession(portfolio.id);
      } else if (isE2ee) {
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

        let derivedKey;
        if (!e2eeSalt || !e2eeVerifier || (portfolio && !portfolio.isE2ee)) {
          e2eeSalt = generateE2eeSalt();
          derivedKey = await deriveE2eeKey(cleanPass, e2eeSalt);
          e2eeVerifier = await createE2eeVerifier(derivedKey);
        } else {
          derivedKey = await deriveE2eeKey(cleanPass, e2eeSalt);
          const valid = await verifyE2eeKey(derivedKey, e2eeVerifier);
          if (!valid) {
            e2eeSalt = generateE2eeSalt();
            derivedKey = await deriveE2eeKey(cleanPass, e2eeSalt);
            e2eeVerifier = await createE2eeVerifier(derivedKey);
          }
        }

        if (portfolio && portfolio.id) {
          saveVaultPassphraseToSession(portfolio.id, cleanPass);
        }

        setSavingMsg('در حال رمزنگاری داده‌های موجود در پورتفو...');

        // Same all-or-nothing principle as disabling: if some items fail to encrypt here, finalizing
        // anyway would leave the portfolio flagged as E2EE while some items are still plaintext —
        // an inconsistent state. Collect failures and abort before saving isE2ee/salt/verifier.
        const enableFailedItems = [];

        // 1. Encrypt existing plain holdings in DB
        try {
          const hRes = await getPortfolio(portfolio.id);
          if (hRes && Array.isArray(hRes.holdings)) {
            for (const h of hRes.holdings) {
              if (!isHoldingE2eeEncrypted(h)) {
                try {
                  const encHolding = await encryptHoldingForApi(derivedKey, {
                    ...h,
                    portfolioId: portfolio.id,
                  });
                  await updatePortfolioHolding(encHolding);
                } catch (itemErr) {
                  enableFailedItems.push(`دارایی «${h.assetName || h.assetId || h.id}»`);
                }
              }
            }
          }
        } catch (hErr) {
          enableFailedItems.push('خطا در دریافت فهرست دارایی‌ها از سرور');
        }

        // 2. Encrypt existing plain transactions in DB
        try {
          const txRes = await getTransactions(portfolio.id);
          if (txRes && Array.isArray(txRes.transactions)) {
            for (const tx of txRes.transactions) {
              const rawCipher = tx.encryptedPayload || tx.encrypted_payload || '';
              if (typeof rawCipher !== 'string' || !rawCipher.startsWith('enc:e2ee:v1:')) {
                try {
                  let payloadObj = {};
                  if (typeof rawCipher === 'string') {
                    try { payloadObj = JSON.parse(rawCipher); } catch { payloadObj = { notes: rawCipher }; }
                  } else if (typeof rawCipher === 'object' && rawCipher !== null) {
                    payloadObj = rawCipher;
                  }
                  const encCipher = await e2eeEncrypt(derivedKey, payloadObj);
                  await updateTransaction(portfolio.id, tx.id, { encryptedPayload: encCipher });
                } catch (itemErr) {
                  enableFailedItems.push(`تراکنش ${tx.transactionDate ? 'مورخ ' + tx.transactionDate : tx.id}`);
                }
              }
            }
          }
        } catch (txErr) {
          enableFailedItems.push('خطا در دریافت فهرست تراکنش‌ها از سرور');
        }

        if (enableFailedItems.length > 0) {
          setMsg({
            text: `فعال‌سازی رمزنگاری متوقف شد: ${enableFailedItems.length} مورد رمزنگاری نشد (${enableFailedItems.slice(0, 3).join('، ')}${enableFailedItems.length > 3 ? ' و مورد دیگر' : ''}). دوباره تلاش کنید.`,
            type: 'error',
          });
          setSaving(false);
          return;
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
          // undefined → unchanged, '' → removed, otherwise the new password
          sharePassword: removePassword ? '' : (sharePassword.trim() || undefined),
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
                {saving ? (savingMsg || 'در حال ذخیره...') : 'ذخیره'}
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
                    message="این رمز در سرور ذخیره نمی‌شود. با فعال‌سازی، کلیه دارایی‌ها و تراکنش‌های این پورتفو در مرورگر شما رمزنگاری خواهند شد."
                    style={{ marginBottom: '14px' }}
                  />

                  <div className="form-group">
                    <label htmlFor="settingsVaultPassword">رمز عبور گاوصندوق</label>
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

              {isDisablingE2ee && (
                <div className="vault-form-section" style={{ marginTop: '14px', borderTop: '1px solid rgba(239, 68, 68, 0.25)', paddingTop: '14px' }}>
                  <AlertBanner
                    type="warning"
                    message="جهت خاموش کردن رمزنگاری سرتاسری و رمزگشایی و بازگرداندن داده‌ها به حالت عادی (Plaintext)، وارد کردن رمز عبور فعلی گاوصندوق الزامی است."
                    style={{ marginBottom: '14px' }}
                  />

                  <div className="form-group">
                    <label htmlFor="settingsDisableVaultPassword">رمز عبور فعلی گاوصندوق جهت رمزگشایی</label>
                    <div className="password-input-wrapper">
                      <input
                        type={showDisablePassword ? 'text' : 'password'}
                        id="settingsDisableVaultPassword"
                        placeholder="رمز عبور فعلی گاوصندوق..."
                        value={disableVaultPassword}
                        onChange={(e) => setDisableVaultPassword(e.target.value)}
                        required
                        autoFocus
                      />
                      <button
                        type="button"
                        className="btn-toggle-pwd"
                        onClick={() => setShowDisablePassword(!showDisablePassword)}
                        title={showDisablePassword ? 'مخفی کردن' : 'نمایش رمز'}
                      >
                        {showDisablePassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
    </Modal>
  );
}
