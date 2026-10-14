/**
 * StoreBuildNotice.jsx — First sign-in on the store ("nosms") Android build: a sheet says this
 * version is the lighter one (no bank SMS reading, no in-app update) and points to the GitHub
 * build for the full experience. Shown once per user on this phone; the About card in the app
 * settings keeps the same links.
 */

import { t } from '../../utils/i18n.js';
import React, { useCallback, useState } from 'react';
import AppSheet from './AppSheet.jsx';
import { Button } from '../ui/index.js';
import { useAuth } from '../../features/auth/index.js';
import { isNativeApp, smsEnabled } from '../native/nativeApp.js';

const GITHUB_URL = 'https://github.com/nos486/realrate';
const seenKey = (userId) => `realrate_store_notice_seen:${userId}`;

function wasSeen(userId) {
  try {
    return localStorage.getItem(seenKey(userId)) === '1';
  } catch {
    return true;
  }
}

/** Only the store build asks anything: the website and the full app never reach the hooks below */
export default function StoreBuildNotice() {
  return isNativeApp() && !smsEnabled() ? <Notice /> : null;
}

function Notice() {
  const { user } = useAuth();
  const userId = user?.id || user?.userId || '';
  const [open, setOpen] = useState(() => Boolean(userId) && !wasSeen(userId));

  const close = useCallback(() => {
    try {
      localStorage.setItem(seenKey(userId), '1');
    } catch {
      // Storage unavailable: it may show again, nothing worse
    }
    setOpen(false);
  }, [userId]);

  if (!open || !userId || user?.demo || wasSeen(userId)) return null;

  return (
    <AppSheet open onClose={close} title={t('نسخه‌ی Google Play')} className="app-setup-sheet">
      <p className="app-setup-intro">
        {t('نسخه‌ی Google Play نسخه‌ی ناقص‌تری است: بدون خواندن خودکار پیامک بانک. برای تجربه‌ی کامل، نسخه‌ی گیت‌هاب را نصب کنید.')}
      </p>
      <p className="app-setup-note" dir="ltr">
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">github.com/nos486/realrate</a>
        <br />
        <a href={`${GITHUB_URL}/releases/latest`} target="_blank" rel="noopener noreferrer">github.com/nos486/realrate/releases/latest</a>
      </p>
      <div className="app-setup-actions">
        <Button onClick={close}>{t('متوجه شدم')}</Button>
      </div>
    </AppSheet>
  );
}
