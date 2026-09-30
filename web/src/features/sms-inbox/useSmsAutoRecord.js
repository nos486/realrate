/**
 * useSmsAutoRecord.js — Record small withdrawals by themselves (Android app, when turned on in the
 * app settings): whenever the encrypted data is open and the inbox changes — a message arrives,
 * the app comes back, the setting changes — waiting withdrawals up to the limit become everyday
 * expenses (smsRecord.js). A short message says how many.
 */

import { useEffect } from 'react';
import { useVault } from '../../shared/vault/useVault.js';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { SMS_INBOX_EVENT } from '../../shared/native/smsInbox.js';
import { autoRecordSmallExpenses } from './smsRecord.js';

export function useSmsAutoRecord(enabled) {
  const { status } = useVault();
  const { toast } = useFeedback();
  const unlocked = status === 'unlocked';

  useEffect(() => {
    if (!enabled || !unlocked) return undefined;
    let cancelled = false;
    const run = () => {
      autoRecordSmallExpenses()
        .then((count) => {
          if (cancelled || !count) return;
          bumpVaultEpoch();
          toast.success(`${count.toLocaleString('fa-IR')} هزینه‌ی کوچک از پیامک خودکار ثبت شد.`);
        })
        .catch((err) => console.warn('Automatic SMS recording failed:', err));
    };
    run();
    window.addEventListener(SMS_INBOX_EVENT, run);
    return () => {
      cancelled = true;
      window.removeEventListener(SMS_INBOX_EVENT, run);
    };
  }, [enabled, unlocked, toast]);
}
