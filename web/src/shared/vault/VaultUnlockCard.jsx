import React from 'react';
import VaultLockCard from '../../features/portfolio/components/VaultLockCard.jsx';
import { unlockVault } from './vaultStore.js';

/**
 * Unlock prompt for the account-wide vault (loans, incomes, account-protected portfolios).
 * One passphrase opens everything for this tab.
 */
export default function VaultUnlockCard({ title = 'اطلاعات رمزنگاری شده است', description, className = '' }) {
  const handleUnlock = async (passphrase) => {
    const ok = await unlockVault(passphrase);
    if (!ok) throw new Error('رمز عبور رمزنگاری حساب اشتباه است.');
    return true;
  };

  return (
    <VaultLockCard
      title={title}
      description={
        description ||
        'رمزنگاری سرتاسری حساب شما فعال است. برای دیدن اطلاعات، رمز عبور رمزنگاری حساب را وارد کنید — با یک بار باز کردن، همه بخش‌ها باز می‌شوند.'
      }
      onUnlock={handleUnlock}
      className={className}
    />
  );
}
