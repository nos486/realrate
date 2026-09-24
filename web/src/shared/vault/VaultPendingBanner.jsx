import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import AlertBanner from '../ui/AlertBanner.jsx';
import Button from '../ui/Button.jsx';
import { useVault } from './useVault.js';
import { findPendingPlaintext } from './vaultMigration.js';

/**
 * With the account vault on, points out anything still stored in plaintext (e.g. saved from
 * another device running an older version) or portfolios still behind their own old passphrase.
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

  if (vault.status !== 'unlocked' || !pending || dismissedEpoch === vault.epoch) return null;
  const plainCount = pending.plainPortfolios.length + pending.plainLoans + pending.plainIncomes;
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
