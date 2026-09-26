import React, { useEffect, useState } from 'react';
import { ShieldAlert, Lock } from 'lucide-react';
import AlertBanner from '../ui/AlertBanner.jsx';
import Button from '../ui/Button.jsx';
import { useVault } from './useVault.js';
import { findPendingPlaintext } from './vaultMigration.js';

/**
 * Encryption is mandatory:
 * - without the account vault, a banner that cannot be dismissed says it must be turned on —
 *   until then nothing new can be saved (the server refuses every save);
 * - with it on, points out anything still stored in plaintext (e.g. saved from another device
 *   running an older version) or portfolios still behind their own old passphrase.
 */
export default function VaultPendingBanner({ onOpenSettings }) {
  const vault = useVault();
  const [pending, setPending] = useState(null);
  const [dismissedEpoch, setDismissedEpoch] = useState(null);

  useEffect(() => {
    if (vault.status !== 'unlocked') return undefined;
    let cancelled = false;
    findPendingPlaintext()
      .then((res) => {
        if (!cancelled) setPending(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vault.status, vault.epoch]);

  if (vault.status === 'off') {
    return (
      <AlertBanner
        type="error"
        icon={<ShieldAlert size={16} />}
        message="برای امنیت اطلاعات شما، رمزنگاری سرتاسری برای همه حساب‌ها اجباری شده است. تا آن را فعال نکنید، امکان ذخیره یا ویرایش اطلاعات وجود ندارد؛ داده‌های فعلی شما سر جایشان هستند و با فعال‌سازی رمزنگاری می‌شوند."
        style={{ marginBottom: '14px' }}
        action={
          <Button size="sm" variant="primary" icon={<Lock size={14} />} onClick={onOpenSettings}>
            فعال‌سازی رمزنگاری
          </Button>
        }
      />
    );
  }

  if (vault.status !== 'unlocked' || !pending || dismissedEpoch === vault.epoch) return null;
  const plainCount = pending.plainPortfolios.length + pending.plainLoans + pending.plainIncomes + pending.plainCheques + pending.plainRecurringIncomes;
  const legacyCount = pending.legacyPortfolios.length;
  if (plainCount === 0 && legacyCount === 0) return null;

  const parts = [];
  if (plainCount > 0) parts.push(`${plainCount.toLocaleString('fa-IR')} مورد هنوز رمزنگاری نشده است`);
  if (legacyCount > 0) parts.push(`${legacyCount.toLocaleString('fa-IR')} پورتفو هنوز رمز جداگانه دارد`);

  return (
    <AlertBanner
      type="warning"
      icon={<ShieldAlert size={16} />}
      message={`رمزنگاری سرتاسری حساب: ${parts.join(' و ')}.`}
      onClose={() => setDismissedEpoch(vault.epoch)}
      style={{ marginBottom: '14px' }}
      action={
        <Button size="sm" variant="secondary" onClick={onOpenSettings}>
          تکمیل در تنظیمات
        </Button>
      }
    />
  );
}
