/**
 * VaultLockGate.jsx — The one lock screen of the app: while the account vault is locked, nothing
 * else is shown or loaded (no widgets, sections or navigation), so no section asks for the passphrase
 * separately. Sign-out and the forgotten-passphrase reset stay reachable from here.
 */

import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { useAuth } from '../../features/auth/index.js';
import { useDemo } from '../../features/demo/index.js';
import { useVault } from './useVault.js';
import VaultUnlockCard from './VaultUnlockCard.jsx';
import VaultResetSection from './VaultResetSection.jsx';
import { t } from '../../utils/i18n.js';

/**
 * Wraps the signed-in app: nothing below it is mounted (so nothing below sends a request) until
 * the vault state is known, and not while it is locked.
 */
export default function VaultLockGate({ children }) {
  const { user } = useAuth();
  const { isDemo } = useDemo();
  const vault = useVault();
  if (!user || isDemo) return children;
  if (vault.status === 'idle' || vault.status === 'loading') {
    return (
      <div className="vault-lock-gate" role="status" aria-label={t('در حال بارگذاری')}>
        <div className="spinner-glow" />
      </div>
    );
  }
  if (vault.status === 'locked') return <VaultLockScreen />;
  return children;
}

function VaultLockScreen() {
  const { user, logout } = useAuth();
  const [forgot, setForgot] = useState(false);

  return (
    <main className="vault-lock-gate">
      <div className="vault-lock-gate-inner">
        <VaultUnlockCard
          title={t('برای دیدن اطلاعات، گاوصندوق را باز کنید')}
          description={t('اطلاعات مالی شما رمزنگاری شده است. با وارد کردن رمز رمزنگاری حساب، همه بخش‌های برنامه باز می‌شوند.')}
          onForgot={() => setForgot((v) => !v)}
        />
        {forgot && <VaultResetSection />}
        <div className="vault-setup-footer">
          <span dir="ltr">{user?.email}</span>
          <Button variant="ghost" size="sm" icon={<LogOut size={14} />} onClick={logout}>
            {t('خروج از حساب')}
          </Button>
        </div>
      </div>
    </main>
  );
}
