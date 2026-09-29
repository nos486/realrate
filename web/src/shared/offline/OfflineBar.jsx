/**
 * OfflineBar.jsx — A thin bar at the top while the app has no connection, or has changes waiting
 * to be sent
 *
 * - offline: «آفلاین» — in the Android app, what you record is kept on the phone and sent later
 *   (with the count waiting); on the website, only that there is no connection
 * - back online with changes waiting: «در حال همگام‌سازی …» until they are sent
 * A change made offline that the server then refuses is reported (it cannot be kept).
 */

import React, { useEffect } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOfflineStatus } from './useOfflineStatus.js';
import { OFFLINE_SYNC_ERROR_EVENT } from './offlineSync.js';
import { useFeedback } from '../ui/FeedbackProvider.jsx';

const fa = (n) => n.toLocaleString('fa-IR');

export default function OfflineBar() {
  const { active, online, pending, syncing } = useOfflineStatus();
  const { toast } = useFeedback();

  useEffect(() => {
    const onRefused = (e) => toast.error(`تغییری که آفلاین ثبت شده بود پذیرفته نشد: ${e.detail?.message || 'خطای سرور'}`, { duration: 8000 });
    window.addEventListener(OFFLINE_SYNC_ERROR_EVENT, onRefused);
    return () => window.removeEventListener(OFFLINE_SYNC_ERROR_EVENT, onRefused);
  }, [toast]);

  if (!online) {
    return (
      <div className="offline-bar is-offline" role="status" aria-live="polite">
        <WifiOff size={15} aria-hidden="true" />
        <span>
          <strong>آفلاین</strong>
          {active
            ? ` — آنچه ثبت می‌کنید روی گوشی ذخیره و پس از اتصال همگام می‌شود${pending ? ` (${fa(pending)} تغییر در انتظار)` : ''}`
            : ' — اتصال اینترنت برقرار نیست'}
        </span>
      </div>
    );
  }
  if (active && pending > 0) {
    return (
      <div className="offline-bar is-syncing" role="status" aria-live="polite">
        <RefreshCw size={15} className={syncing ? 'spin' : ''} aria-hidden="true" />
        <span>در حال همگام‌سازی {fa(pending)} تغییر…</span>
      </div>
    );
  }
  return null;
}
