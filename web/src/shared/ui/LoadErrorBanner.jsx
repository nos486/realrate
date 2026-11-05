/**
 * LoadErrorBanner.jsx — The error banner of a list that failed to load: the reason, «تلاش مجدد»,
 * and an offline-aware text
 *
 * One component for every page that reads its data when opened (expenses, incomes, cheques,
 * goals, …), so a failed read looks the same everywhere. While the device has no connection the
 * banner says so instead of the raw error, and when the connection comes back the read is tried
 * again once on its own.
 */

import { t } from '../../utils/i18n.js';
import React, { useEffect, useRef } from 'react';
import AlertBanner from './AlertBanner.jsx';
import Button from './Button.jsx';
import { useOfflineStatus } from '../offline/useOfflineStatus.js';

/**
 * @param {{ error?: string|null, onRetry?: (() => void)|null, onClose?: (() => void)|null }} props
 *   `onRetry`: reads the data again (no button when absent, e.g. the list on screen is usable)
 */
export default function LoadErrorBanner({ error, onRetry = null, onClose = null }) {
  const { online } = useOfflineStatus();
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      if (error && onRetry) onRetry();
    }
  }, [online, error, onRetry]);

  if (!error) return null;
  return (
    <AlertBanner
      type="error"
      message={online ? error : t('اتصال اینترنت برقرار نیست؛ با وصل شدن دوباره خودکار تلاش می‌شود.')}
      onClose={onClose}
      action={onRetry ? <Button size="sm" variant="secondary" onClick={onRetry}>{t('تلاش مجدد')}</Button> : null}
    />
  );
}
