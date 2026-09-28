import React, { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import VaultLockCard from '../../features/portfolio/components/VaultLockCard.jsx';
import { unlockVault } from './vaultStore.js';
import { isBiometricEnabled, unlockWithBiometric } from '../native/biometricUnlock.js';
import { useFeedback } from '../ui/FeedbackProvider.jsx';

// The fingerprint prompt opens by itself once per app session (not on every locked screen)
let promptedThisSession = false;

/**
 * Unlock prompt for the account-wide vault (loans, incomes, account-protected portfolios).
 * One passphrase opens everything for this tab. In the Android app with fingerprint unlock set
 * up (app settings), a fingerprint button opens it too.
 */
export default function VaultUnlockCard({ title = 'اطلاعات رمزنگاری شده است', description, className = '' }) {
  const { toast } = useFeedback();
  const [biometric, setBiometric] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleUnlock = async (passphrase) => {
    const ok = await unlockVault(passphrase);
    if (!ok) throw new Error('رمز عبور رمزنگاری حساب اشتباه است.');
    return true;
  };

  const handleBiometric = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await unlockWithBiometric();
    } catch (err) {
      setBiometric(false);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    isBiometricEnabled().then((enabled) => {
      if (cancelled || !enabled) return;
      setBiometric(true);
      if (!promptedThisSession) {
        promptedThisSession = true;
        handleBiometric();
      }
    });
    return () => {
      cancelled = true;
    };
    // Checked once when the card appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <VaultLockCard
      title={title}
      description={
        description ||
        'رمزنگاری سرتاسری حساب شما فعال است. برای دیدن اطلاعات، رمز عبور رمزنگاری حساب را وارد کنید — با یک بار باز کردن، همه بخش‌ها باز می‌شوند.'
      }
      onUnlock={handleUnlock}
      className={className}
      extraAction={biometric && (
        <button type="button" className="btn-vault-biometric" onClick={handleBiometric} disabled={busy}>
          <Fingerprint size={16} />
          اثر انگشت
        </button>
      )}
    />
  );
}
