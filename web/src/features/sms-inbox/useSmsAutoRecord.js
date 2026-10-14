/**
 * useSmsAutoRecord.js — Record small withdrawals by themselves (Android app, when turned on in the
 * app settings): whenever the encrypted data is open and the inbox changes — a message arrives,
 * the app comes back, the setting changes — waiting withdrawals up to the limit become everyday
 * expenses, and deposits up to theirs incomes (smsRecord.js). A short message says how many.
 */

import { intlLocale } from '../../utils/i18n.js';
import { useEffect } from 'react';
import { useVault } from '../../shared/vault/useVault.js';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { SMS_INBOX_EVENT } from '../../shared/native/smsInbox.js';
import { autoRecordSms } from './smsRecord.js';

/** How long after the app opens, or after the last inbox change, recording starts (ms) */
const START_DELAY_MS = 1500;

export function useSmsAutoRecord(enabled) {
  const { status } = useVault();
  const { toast } = useFeedback();
  const unlocked = status === 'unlocked';

  useEffect(() => {
    if (!enabled || !unlocked) return undefined;
    let cancelled = false;
    let timer = null;
    const run = () => {
      autoRecordSms()
        .then((count) => {
          if (cancelled || !count) return;
          bumpVaultEpoch();
          toast.success(`${count.toLocaleString(intlLocale())} تراکنش کوچک از پیامک خودکار ثبت شد.`);
        })
        .catch((err) => console.warn('Automatic SMS recording failed:', err));
    };
    // Not at once: the screen opens first, and a burst of inbox changes becomes one run
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(run, START_DELAY_MS);
    };
    schedule();
    window.addEventListener(SMS_INBOX_EVENT, schedule);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(SMS_INBOX_EVENT, schedule);
    };
  }, [enabled, unlocked, toast]);
}
