import { useEffect, useState } from 'react';
import { getPendingSms, getSmsSettings, SMS_INBOX_EVENT } from './smsInbox.js';

/** The bank SMS inbox and its settings, kept up to date (Android app) */
export function useSmsInbox() {
  const [snapshot, setSnapshot] = useState(() => ({ pending: getPendingSms(), settings: getSmsSettings() }));
  useEffect(() => {
    const refresh = () => setSnapshot({ pending: getPendingSms(), settings: getSmsSettings() });
    window.addEventListener(SMS_INBOX_EVENT, refresh);
    return () => window.removeEventListener(SMS_INBOX_EVENT, refresh);
  }, []);
  return snapshot;
}
