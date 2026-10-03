/**
 * EmailRemindersSection.jsx — Account email reminder settings for loans, cheques and fixed incomes
 *
 * Configures server-side daily email reminders at 08:00 Asia/Tehran.
 * Zero-knowledge guarantee: emails only ever include counts and item kinds; titles, counterparties,
 * banks and amounts are encrypted on the client and never visible to the server.
 */

import React, { useEffect, useState } from 'react';
import { Mail, CheckCircle2, AlertTriangle, Send, ShieldAlert, Calendar } from 'lucide-react';
import Button from '../../../shared/ui/Button.jsx';
import AlertBanner from '../../../shared/ui/AlertBanner.jsx';
import {
  fetchAlertEmailPrefs,
  saveAlertEmailPrefs,
  sendTestAlertEmail,
} from '../../../shared/alerts/emailAlertsApi.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';

const SOURCE_OPTIONS = [
  { id: 'loan', label: 'اقساط وام' },
  { id: 'cheque', label: 'چک‌ها' },
  { id: 'recurring_income', label: 'درآمد ثابت' },
];

const LEAD_DAY_OPTIONS = [
  { days: 7, label: '۷ روز قبل' },
  { days: 3, label: '۳ روز قبل' },
  { days: 1, label: '۱ روز قبل' },
  { days: 0, label: 'روز سررسید' },
];

export default function EmailRemindersSection() {
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const [emailConfigured, setEmailConfigured] = useState(true);
  const [emailVerified, setEmailVerified] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [sources, setSources] = useState(['loan', 'cheque', 'recurring_income']);
  const [leadDays, setLeadDays] = useState([1, 0]);
  const [sendOverdue, setSendOverdue] = useState(true);
  const [includeChequeDirection, setIncludeChequeDirection] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAlertEmailPrefs()
      .then((data) => {
        if (!active) return;
        setEmailConfigured(Boolean(data.emailConfigured));
        setEmailVerified(Boolean(data.emailVerified));
        setUserEmail(data.email || '');

        const prefs = data.prefs || {};
        setEnabled(Boolean(prefs.enabled));
        if (Array.isArray(prefs.sources)) setSources(prefs.sources);
        if (Array.isArray(prefs.leadDays)) setLeadDays(prefs.leadDays);
        if (prefs.sendOverdue !== undefined) setSendOverdue(Boolean(prefs.sendOverdue));
        if (prefs.includeChequeDirection !== undefined) setIncludeChequeDirection(Boolean(prefs.includeChequeDirection));
      })
      .catch((err) => {
        if (!active) return;
        setMessage({ text: 'خطا در دریافت تنظیمات یادآوری ایمیلی: ' + err.message, type: 'error' });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const toggleSource = (id) => {
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleLeadDay = (d) => {
    setLeadDays((prev) =>
      prev.includes(d) ? prev.filter((day) => day !== d) : [...prev, d]
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      await saveAlertEmailPrefs({
        enabled,
        sources,
        leadDays,
        sendOverdue,
        includeChequeDirection,
      });
      setMessage({ text: 'تنظیمات یادآوری ایمیلی با موفقیت ذخیره شد.', type: 'success' });
      toast.success('تنظیمات یادآوری ایمیلی ذخیره شد.');
    } catch (err) {
      setMessage({ text: err.message || 'خطا در ذخیره تنظیمات', type: 'error' });
      toast.error(err.message || 'خطا در ذخیره تنظیمات');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    try {
      await sendTestAlertEmail();
      toast.success(`یک ایمیل آزمایشی به ${userEmail} ارسال شد.`);
    } catch (err) {
      toast.error(err.message || 'ارسال ایمیل آزمایشی با خطا مواجه شد.');
    } finally {
      setTesting(false);
    }
  };

  const isFormDisabled = loading || saving || !emailConfigured || !emailVerified;

  return (
    <div className="account-settings-section" style={{ marginTop: '28px', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))', paddingTop: '22px' }}>
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <span>
          <Mail size={18} style={{ verticalAlign: 'middle', marginLeft: '6px', display: 'inline', color: 'var(--accent-blue, #38bdf8)' }} />
          یادآوری ایمیلی
        </span>
        {userEmail && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', direction: 'ltr' }}>
            {userEmail}
          </span>
        )}
      </div>

      {message.text && (
        <AlertBanner
          type={message.type}
          message={message.text}
          onClose={() => setMessage({ text: '', type: '' })}
          style={{ marginBottom: '16px' }}
        />
      )}

      {!emailConfigured && (
        <div style={{ background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <AlertTriangle size={18} style={{ color: '#eab308', flexShrink: 0 }} />
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            ارسال ایمیل هنوز روی سرور پیکربندی نشده است.
          </span>
        </div>
      )}

      {emailConfigured && !emailVerified && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '12px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <ShieldAlert size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            برای فعال‌سازی و دریافت یادآوری‌ها، لطفاً ابتدا ایمیل حساب خود را تأیید کنید.
          </span>
        </div>
      )}

      <div style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.15)', borderRadius: '8px', padding: '12px', marginBottom: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.7' }}>
        <strong>حفظ حریم خصوصی:</strong> در ایمیل فقط تعداد و نوع موارد می‌آید؛ مبلغ و عنوان در دستگاه شما رمزنگاری شده‌اند و سرور هرگز آن‌ها را نمی‌بیند.
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        {/* Master Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-secondary, rgba(255,255,255,0.03))', borderRadius: '8px' }}>
          <div>
            <strong style={{ fontSize: '14px', display: 'block' }}>ارسال روزانه خلاصه سررسیدها به ایمیل</strong>
            <small style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
              هر روز ساعت ۰۸:۰۰ صبح به وقت تهران در صورت وجود سررسید جدید
            </small>
          </div>
          <label className={`app-switch ${isFormDisabled ? 'is-disabled' : ''}`}>
            <input
              type="checkbox"
              role="switch"
              checked={enabled}
              disabled={isFormDisabled}
              onChange={(e) => setEnabled(e.target.checked)}
              aria-label="ارسال روزانه خلاصه سررسیدها به ایمیل"
            />
            <span className="app-switch-track" aria-hidden="true" />
          </label>
        </div>

        {enabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '0 4px' }}>
            {/* Sources Multi-select */}
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                موارد مشمول یادآوری:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isFormDisabled}
                    onClick={() => toggleSource(opt.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      border: sources.includes(opt.id)
                        ? '1px solid var(--accent-blue, #38bdf8)'
                        : '1px solid var(--border-color, rgba(255,255,255,0.12))',
                      background: sources.includes(opt.id)
                        ? 'rgba(56, 189, 248, 0.15)'
                        : 'transparent',
                      color: sources.includes(opt.id)
                        ? 'var(--accent-blue, #38bdf8)'
                        : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* When to remind */}
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                زمان ارسال یادآوری:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {LEAD_DAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    disabled={isFormDisabled}
                    onClick={() => toggleLeadDay(opt.days)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      border: leadDays.includes(opt.days)
                        ? '1px solid var(--accent-blue, #38bdf8)'
                        : '1px solid var(--border-color, rgba(255,255,255,0.12))',
                      background: leadDays.includes(opt.days)
                        ? 'rgba(56, 189, 248, 0.15)'
                        : 'transparent',
                      color: leadDays.includes(opt.days)
                        ? 'var(--accent-blue, #38bdf8)'
                        : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Overdue Items Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <div>
                <strong style={{ fontSize: '13px', display: 'block' }}>ایمیل برای موارد سررسیدگذشته</strong>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  یادآوری اقساط و مواردی که سررسید آنها رد شده و هنوز ثبت نشده‌اند
                </small>
              </div>
              <label className={`app-switch ${isFormDisabled ? 'is-disabled' : ''}`}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={sendOverdue}
                  disabled={isFormDisabled}
                  onChange={(e) => setSendOverdue(e.target.checked)}
                  aria-label="ایمیل برای موارد سررسیدگذشته"
                />
                <span className="app-switch-track" aria-hidden="true" />
              </label>
            </div>

            {/* Cheque Direction Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <div>
                <strong style={{ fontSize: '13px', display: 'block' }}>نوع چک (صادره/دریافتی) در ایمیل بیاید</strong>
                <small style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                  در صورت فعال‌بودن، جهت چک بدون مبلغ و عنوان به صورت متن ساده در سرور ذخیره می‌شود
                </small>
              </div>
              <label className={`app-switch ${isFormDisabled ? 'is-disabled' : ''}`}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={includeChequeDirection}
                  disabled={isFormDisabled}
                  onChange={(e) => setIncludeChequeDirection(e.target.checked)}
                  aria-label="نوع چک در ایمیل بیاید"
                />
                <span className="app-switch-track" aria-hidden="true" />
              </label>
            </div>
          </div>
        )}

        {/* Buttons Row */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            disabled={isFormDisabled}
            style={{ flex: 1, minWidth: '160px' }}
          >
            ذخیره تنظیمات یادآوری
          </Button>

          {emailConfigured && emailVerified && (
            <Button
              type="button"
              variant="secondary"
              loading={testing}
              disabled={isFormDisabled}
              onClick={handleSendTest}
              icon={<Send size={15} />}
            >
              ارسال ایمیل آزمایشی
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
