/**
 * VaultLockGate.jsx — The one lock screen of the app: while the account vault is locked, nothing
 * else is shown (no widgets, sections or navigation), so no section asks for the passphrase
 * separately. Sign-out and the forgotten-passphrase reset stay reachable from here.
 */

import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { useAuth } from '../../features/auth/index.js';
import VaultUnlockCard from './VaultUnlockCard.jsx';
import VaultResetSection from './VaultResetSection.jsx';
import { t } from '../../utils/i18n.js';

export default function VaultLockGate() {
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
