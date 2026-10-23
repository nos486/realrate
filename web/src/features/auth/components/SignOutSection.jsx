/**
 * SignOutSection.jsx — Sign out of this device (account settings)
 *
 * Sign-out lives here rather than in the header, so it is out of the way of everyday taps; the
 * button still asks before signing out.
 */

import { t } from '../../../utils/i18n.js';
import React from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useConfirmedLogout } from '../useConfirmedLogout.js';

export default function SignOutSection() {
  const { user } = useAuth();
  const signOut = useConfirmedLogout();
  if (!user) return null;

  return (
    <section className="vault-settings" id="sign-out" aria-labelledby="sign-out-title">
      <div className="section-title">
        <span id="sign-out-title">
          <LogOut size={18} className="vault-settings-title-icon" />
          {t('خروج از حساب')}
        </span>
      </div>
      <p className="vault-settings-text">
        {t('با خروج، حساب روی این دستگاه بسته می‌شود؛ اطلاعات شما روی سرور می‌ماند.')}
      </p>
      <div className="vault-settings-actions">
        <Button variant="secondary" size="sm" icon={<LogOut size={14} />} onClick={signOut}>
          {t('خروج از حساب')}
        </Button>
      </div>
    </section>
  );
}
