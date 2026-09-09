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
  Lock,
  Share2,
} from 'lucide-react';
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

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input, Label } from '@/components/ui/input.jsx';
import { cn } from '@/lib/utils.js';

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Settings size={16} />
            </div>
            <DialogTitle>تنظیمات «{portfolioName || 'پورتفو'}»</DialogTitle>
          </div>
          <DialogDescription>
            نام، نحوه اشتراک‌گذاری و امنیت گاوصندوق این پورتفو را مدیریت کنید.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span>در حال بارگذاری تنظیمات...</span>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <DialogBody className="space-y-4">
              {msg.text && (
                <div
                  className={cn(
                    'p-3 rounded-xl text-xs font-semibold flex items-center gap-2',
                    msg.type === 'success'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  )}
                >
                  {msg.type === 'success' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                  <span>{msg.text}</span>
                </div>
              )}

              {/* Portfolio Name */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="settingsPortfolioName">نام پورتفو:</Label>
                <Input
                  type="text"
                  id="settingsPortfolioName"
                  placeholder="نام پورتفو..."
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  required
                />
              </div>

              {/* Default Portfolio Toggle Card */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.03] border border-white/5 light:bg-slate-50 light:border-slate-200">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full',
                      isDefault ? 'bg-amber-400' : 'bg-slate-500'
                    )}
                  />
                  <strong className="text-xs font-bold text-white light:text-slate-900">
                    پورتفوی پیش‌فرض
                  </strong>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>

              {/* Public Sharing Section */}
              <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/5 light:bg-slate-50 light:border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Share2 size={15} className={shareEnabled ? 'text-emerald-400' : 'text-slate-400'} />
                    <strong className="text-xs font-bold text-white light:text-slate-900">
                      اشتراک‌گذاری عمومی
                    </strong>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shareEnabled}
                      onChange={(e) => setShareEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                {shareEnabled && (
                  <div className="space-y-3 pt-2 border-t border-white/5 light:border-slate-200">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="settingsShareSlug">لینک اختصاصی:</Label>
                      <div className="flex items-center gap-2 dir-ltr">
                        <span className="text-xs font-mono text-slate-400">/p/</span>
                        <Input
                          type="text"
                          id="settingsShareSlug"
                          placeholder="my-portfolio"
                          value={shareSlug}
                          onChange={(e) => setShareSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'))}
                          className="font-mono text-xs dir-ltr text-start flex-1"
                        />
                      </div>
                    </div>

                    {shareSlug && (
                      <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-black/30 border border-white/10 text-xs">
                        <span className="font-mono text-[11px] text-slate-300 truncate dir-ltr">
                          {fullShareUrl}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleCopyLink}
                          className="h-7 px-2 text-xs"
                        >
                          <Copy size={12} className="me-1" />
                          <span>{copied ? 'کپی شد' : 'کپی'}</span>
                        </Button>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="settingsSharePassword">رمز عبور لینک (اختیاری):</Label>
                      <div className="relative">
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          id="settingsSharePassword"
                          placeholder="رمز دلخواه..."
                          value={sharePassword}
                          onChange={(e) => setSharePassword(e.target.value)}
                          className="pe-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* E2EE Encrypted Vault Section */}
              <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/5 light:bg-slate-50 light:border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock size={15} className={isE2ee ? 'text-amber-400' : 'text-slate-400'} />
                    <div className="flex flex-col">
                      <strong className="text-xs font-bold text-white light:text-slate-900">
                        رمزنگاری سرتاسری (E2EE)
                      </strong>
                      <span className="text-[10px] text-slate-400">
                        قفل دارایی‌ها با رمز عبور شخصی روی مرورگر شما
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isE2ee}
                      onChange={(e) => setIsE2ee(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {isE2ee && (
                  <div className="space-y-3 pt-2 border-t border-white/5 light:border-slate-200">
                    <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] leading-relaxed">
                      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                      <span>این رمز در سرور ذخیره نمی‌شود. در صورت فراموشی، اطلاعات غیرقابل بازیابی خواهد بود.</span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="settingsVaultPassword">رمز عبور گاوصندوق:</Label>
                      <div className="relative">
                        <Input
                          type={showVaultPassword ? 'text' : 'password'}
                          id="settingsVaultPassword"
                          placeholder="حداقل ۴ کاراکتر..."
                          value={vaultPassword}
                          onChange={(e) => setVaultPassword(e.target.value)}
                          required={isE2ee}
                          className="pe-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowVaultPassword(!showVaultPassword)}
                          className="absolute inset-y-0 end-0 pe-3 flex items-center text-slate-400 hover:text-white"
                        >
                          {showVaultPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="settingsVaultPasswordConfirm">تکرار رمز عبور:</Label>
                      <Input
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
            </DialogBody>

            <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
              {canDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={onDelete}
                  disabled={saving}
                  title={`حذف «${portfolio?.name || ''}»`}
                >
                  <Trash2 size={14} />
                  <span>حذف</span>
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                  انصراف
                </Button>
                <Button type="submit" variant="primary" disabled={saving} isLoading={saving}>
                  {saving ? 'در حال ذخیره...' : 'ذخیره'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
