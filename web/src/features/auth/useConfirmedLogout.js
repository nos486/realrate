/**
 * useConfirmedLogout.js — Sign out only after the user confirms it
 *
 * Every sign-out button goes through this, so a stray tap never ends the session (on the next
 * visit the user would have to sign in and unlock the vault again).
 */

import { useCallback } from 'react';
import { t } from '../../utils/i18n.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useAuth } from './index.js';

/**
 * @returns {() => Promise<boolean>} asks first; resolves true when the user signed out
 */
export function useConfirmedLogout() {
  const { logout } = useAuth();
  const { confirm } = useFeedback();
  return useCallback(async () => {
    const ok = await confirm({
      title: t('خروج از حساب'),
      message: t('از حساب کاربری خارج می‌شوید؟ برای استفاده‌ی دوباره باید دوباره وارد شوید.'),
      confirmLabel: t('خروج'),
      cancelLabel: t('انصراف'),
      danger: true,
    });
    if (!ok) return false;
    await logout();
    return true;
  }, [confirm, logout]);
}
