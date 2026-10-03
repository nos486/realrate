/**
 * WebPushRemindersSection.jsx — Sealed Web Push notifications settings section
 *
 * For website & PWA users (hidden in native Android app, which uses local notifications).
 * Allows configuring zero-knowledge browser push reminders with per-device AES-GCM sealing.
 */

import React, { useState, useEffect } from 'react';
import { Bell, Send, Check } from 'lucide-react';
import AlertBanner from '../../../shared/ui/AlertBanner.jsx';
import Button from '../../../shared/ui/Button.jsx';
import { isNativeApp } from '../../../shared/native/nativeApp.js';

function Switch({ checked, onChange, disabled, label }) {
  return (
    <label className={`app-switch ${disabled ? 'is-disabled' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="app-switch-track" aria-hidden="true" />
    </label>
  );
}
import {
  isWebPushSupported,
  getWebPushSettings,
  setWebPushSettings,
  enableWebPush,
  disableWebPush,
  triggerTestPush,
} from '../../../shared/push/webPushClient.js';

const PUSH_LEAD_OPTIONS = [
  { days: 7, label: '۷ روز قبل' },
  { days: 3, label: '۳ روز قبل' },
  { days: 1, label: '۱ روز قبل' },
  { days: 0, label: 'روز سررسید' },
];

export default function WebPushRemindersSection() {
  const isNative = isNativeApp();
  const supported = isWebPushSupported();
  const [settings, setSettings] = useState(() => getWebPushSettings());
  const [permission, setPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  if (isNative) return null;

  const handleToggle = async (nextChecked) => {
    setLoading(true);
    setMsg({ text: '', type: '' });
    try {
      if (nextChecked) {
        const res = await enableWebPush({
          leadDays: settings.leadDays,
          showAmount: settings.showAmount,
        });
        setSettings(res.settings);
        if (typeof Notification !== 'undefined') {
          setPermission(Notification.permission);
        }
        setMsg({ text: 'اعلان‌های مرورگر با موفقیت فعال شد.', type: 'success' });
      } else {
        const res = await disableWebPush();
        setSettings(res.settings);
        setMsg({ text: 'اعلان‌های مرورگر غیرفعال شد.', type: 'info' });
      }
    } catch (err) {
      setMsg({ text: err.message || 'خطا در تغییر وضعیت اعلان مرورگر', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLeadDay = (d) => {
    const current = settings.leadDays || [];
    let next;
    if (current.includes(d)) {
      if (current.length === 1) return; // Keep at least one
      next = current.filter((x) => x !== d);
    } else {
      next = [...current, d].sort((a, b) => b - a);
    }
    const updated = setWebPushSettings({ leadDays: next });
    setSettings(updated);
  };

  const handleToggleShowAmount = (show) => {
    const updated = setWebPushSettings({ showAmount: show });
    setSettings(updated);
  };

  const handleTest = async () => {
    setTesting(true);
    setMsg({ text: '', type: '' });
    try {
      await triggerTestPush();
      setMsg({ text: 'اعلان آزمایشی رمزنگاری‌شده ارسال شد.', type: 'success' });
    } catch (err) {
      setMsg({ text: err.message || 'خطا در ارسال اعلان آزمایشی', type: 'error' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      style={{
        marginTop: '28px',
        paddingTop: '24px',
        borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={18} style={{ color: 'var(--accent-blue, #38bdf8)' }} />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>اعلان مرورگر (Web Push)</h3>
        </div>
        {supported && (
          <Switch
            checked={settings.enabled}
            onChange={handleToggle}
            disabled={loading}
            label="اعلان مرورگر"
          />
        )}
      </div>

      {!supported ? (
        <AlertBanner
          type="info"
          message="مرورگر فعلی شما از اعلان‌های وب (Web Push) یا پایگاه داده محلی پشتیبانی نمی‌کند."
        />
      ) : (
        <>
          {permission === 'denied' && (
            <div style={{ marginBottom: '12px' }}>
              <AlertBanner
                type="warning"
                message="مجوز ارسال اعلان در تنظیمات مرورگر شما مسدود شده است. لطفاً از طریق آیکون قفل در نوار آدرس، دسترسی اعلان را مجاز کنید."
              />
            </div>
          )}

          {msg.text && (
            <div style={{ marginBottom: '14px' }}>
              <AlertBanner type={msg.type} message={msg.text} />
            </div>
          )}

          <p style={{ fontSize: '13px', color: 'var(--text-secondary, #94a3b8)', lineHeight: '1.6', margin: '0 0 14px 0' }}>
            دریافت اعلان‌های سررسید روی دسکتاپ یا آیفون (PWA) در ساعت ۰۹:۰۰ صبح.
          </p>

          {settings.enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                  زمان ارسال اعلان:
                </strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {PUSH_LEAD_OPTIONS.map((opt) => {
                    const active = (settings.leadDays || []).includes(opt.days);
                    return (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => handleToggleLeadDay(opt.days)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '16px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          border: active
                            ? '1px solid var(--accent-blue, #38bdf8)'
                            : '1px solid var(--border-color, rgba(255,255,255,0.12))',
                          background: active ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                          color: active ? 'var(--accent-blue, #38bdf8)' : 'var(--text-secondary)',
                          transition: 'all 0.15s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {active && <Check size={12} />}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  borderTop: '1px solid var(--border-color, rgba(255,255,255,0.06))',
                }}
              >
                <div>
                  <strong style={{ fontSize: '13px', display: 'block' }}>نمایش مبلغ در اعلان</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    مبلغ هر قسط یا چک در متن اعلان نمایش داده می‌شود (در حالت حریم خصوصی پنهان می‌ماند).
                  </span>
                </div>
                <Switch
                  checked={settings.showAmount}
                  onChange={handleToggleShowAmount}
                  label="نمایش مبلغ در اعلان"
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  paddingTop: '8px',
                }}
              >
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleTest}
                  loading={testing}
                  icon={<Send size={14} />}
                >
                  ارسال اعلان آزمایشی به این مرورگر
                </Button>
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: '16px',
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(56, 189, 248, 0.06)',
              border: '1px solid rgba(56, 189, 248, 0.15)',
              fontSize: '12px',
              color: 'var(--text-secondary, #94a3b8)',
              lineHeight: '1.6',
            }}
          >
            🔒 <strong>حفظ کامل حریم خصوصی:</strong> بسته‌های اعلان با کلید اختصاصی مرورگر شما (AES-GCM ۲۵۶ بیتی) قفل می‌شوند. سرور عنوان، نام طرف حساب و مبلغ را نمی‌بیند و صرفاً بسته مهروموم‌شده را در موعد مقرر تحویل می‌دهد.
          </div>
        </>
      )}
    </div>
  );
}
