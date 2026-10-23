/**
 * VaultSetupScreen.jsx — First run of a new account: the encryption passphrase is chosen before
 * anything else, so no data of theirs is ever stored unencrypted.
 */

import React from 'react';
import { ShieldCheck, LogOut } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { useFeedback } from '../ui/FeedbackProvider.jsx';
import { useAuth } from '../../features/auth/index.js';
import { useConfirmedLogout } from '../../features/auth/useConfirmedLogout.js';
import VaultEnableForm from './VaultEnableForm.jsx';
import { t } from '../../utils/i18n.js';

export default function VaultSetupScreen() {
  const { user } = useAuth();
  const logout = useConfirmedLogout();
  const { toast } = useFeedback();

  return (
    <section className="vault-setup" aria-labelledby="vault-setup-title">
      <div className="vault-setup-card">
        <div className="vault-setup-icon" aria-hidden="true">
          <ShieldCheck size={28} />
        </div>
        <h2 id="vault-setup-title">{t('یک قدم تا شروع: رمز عبور رمزنگاری')}</h2>
        <p className="vault-settings-text">
          {t('همه اطلاعات مالی شما — پورتفوها، وام‌ها، درآمدها و چک‌ها — پیش از ارسال، در همین مرورگر با این رمز رمزنگاری می‌شوند. سرور فقط داده رمزشده را می‌بیند و بدون این رمز هیچ‌کس (حتی ما) نمی‌تواند آن را بخواند.')}
        </p>
        <p className="vault-settings-text">
          {t('این رمز جدا از رمز ورود به حساب است و فقط هنگام باز کردن اطلاعات در یک مرورگر جدید پرسیده می‌شود.')}
        </p>
        <VaultEnableForm
          submitLabel={t('ساخت رمز و شروع')}
          onDone={() => toast.success(t('رمزنگاری سرتاسری فعال شد؛ از این پس همه اطلاعات شما رمزشده ذخیره می‌شود.'))}
        />
        <div className="vault-setup-footer">
          <span dir="ltr">{user?.email}</span>
          <Button variant="ghost" size="sm" icon={<LogOut size={14} />} onClick={logout}>
            {t('خروج از حساب')}
          </Button>
        </div>
      </div>
    </section>
  );
}
