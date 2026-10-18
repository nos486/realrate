/**
 * SmsWidget.jsx — «پیامک‌های بانکی»: how many bank messages the Android app read and are waiting
 * to be recorded; opens the inbox. Nothing shows when none wait.
 */

import { t } from '../../../utils/i18n.js';
import React, { useEffect, useState } from 'react';
import { ChevronLeft, MessageSquareText } from 'lucide-react';
import { getPendingSms, SMS_INBOX_EVENT } from '../../../shared/native/smsInbox.js';
import { useDashboardData } from '../DashboardContext.js';
import { wholeText } from '../dashboardFormat.js';

export default function SmsWidget() {
  const { open } = useDashboardData();
  const [list, setList] = useState(() => getPendingSms());
  useEffect(() => {
    const update = () => setList(getPendingSms());
    window.addEventListener(SMS_INBOX_EVENT, update);
    return () => window.removeEventListener(SMS_INBOX_EVENT, update);
  }, []);
  if (list.length === 0) return null;
  return (
    <button type="button" className="app-home-card app-home-sms" onClick={() => open('sms')}>
      <span className="app-home-sms-icon"><MessageSquareText size={20} /></span>
      <span className="app-home-sms-text">
        <strong>{t('{n} پیامک بانکی منتظر ثبت', { n: wholeText(list.length) })}</strong>
        <small>{t('با یک ضربه دسته را انتخاب کنید')}</small>
      </span>
      <ChevronLeft size={18} />
    </button>
  );
}
