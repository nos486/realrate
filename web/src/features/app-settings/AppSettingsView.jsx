/**
 * AppSettingsView.jsx — Settings of the Android app (shown only inside the app)
 *
 * - Bank SMS: automatic reading on/off (a notification for each bank message as it arrives);
 *   the messages wait on the «پیامک‌های بانکی» page, which also reads older ones on request.
 *   Small withdrawals: recorded by themselves up to an amount (off by default), in a category
 *   that «ثبت سریع» uses too (features/sms-inbox/smsRecord.js)
 * - Fingerprint: open the encrypted data with the fingerprint instead of the passphrase
 * - The app's version and its updates: automatic check on/off, «بررسی به‌روزرسانی» (shared/native/appUpdate.js)
 */

import React, { useEffect, useState } from 'react';
import { Smartphone, MessageSquareText, Fingerprint, Info, ArrowLeft, RefreshCw, Download, Bell } from 'lucide-react';
import { AlertBanner, Button, Card, FeaturePageHeader } from '../../shared/ui/index.js';
import { NumericInput } from '../../shared/ui/NumericInput.jsx';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { useCategories } from '../../shared/categories/useCategories.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { resolveBank, BankLogo } from '../../shared/banks/index.js';
import { BANK_SMS_TEMPLATES } from '../../utils/bankSmsTemplates.js';
import { useSmsInbox } from '../../shared/native/useSmsInbox.js';
import { setSmsSettings, setSmsBankEnabled, smsPermission, enableSmsReading, QUICK_RECORD_MAX } from '../../shared/native/smsInbox.js';
import {
  getDueNotificationSettings,
  setDueNotificationSettings,
  checkNotificationPermission,
  requestNotificationPermission,
} from '../../shared/native/dueNotifications.js';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
} from '../../shared/native/biometricUnlock.js';
import { useAppUpdate } from '../../shared/native/useAppUpdate.js';
import { checkForUpdate, setAutoUpdateCheck, openUpdatePrompt } from '../../shared/native/appUpdate.js';


/**
 * The banks whose messages are read: all by default; one turned off is neither read nor notified,
 * and its waiting messages leave the inbox
 */
function SmsBankSettings({ settings }) {
  const off = new Set(settings.disabledBanks);
  return (
    <div className="app-setting-banks">
      <strong>بانک‌ها</strong>
      <p>پیامک‌های کدام بانک‌ها خوانده شود؟ بانکی را که خاموش کنید، پیامکش خوانده نمی‌شود و اعلانی نمی‌آید.</p>
      <ul>
        {BANK_SMS_TEMPLATES.map(({ bankId, senders = [] }) => {
          const bank = resolveBank({ bankId });
          return (
            <li key={bankId} className={off.has(bankId) ? 'is-off' : ''}>
              <BankLogo bank={bank} size={28} />
              <span className="app-setting-bank-name">
                <b>{bank.name || bank.shortName}</b>
                <small dir="ltr">{senders.join('، ')}</small>
              </span>
              <Switch checked={!off.has(bankId)} onChange={(on) => setSmsBankEnabled(bankId, on)} label={`خواندن پیامک ${bank.shortName}`} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Switch({ checked, onChange, disabled, label }) {
  return (
    <label className={`app-switch ${disabled ? 'is-disabled' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="app-switch-track" aria-hidden="true" />
    </label>
  );
}

function formatTime(ms) {
  if (!ms) return 'هنوز خوانده نشده';
  return new Date(ms).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' });
}

const faNum = (n) => Number(n || 0).toLocaleString('fa-IR');
const digits = (v) => Number(String(v ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, '')) || 0;

/** Small withdrawals: recorded by themselves up to an amount, and the category used for them */
function SmsRecordSettings({ settings }) {
  const categories = useCategories('expense', { keep: settings.recordCategory });
  const [max, setMax] = useState(String(settings.autoRecordMax));
  const saveMax = () => {
    const value = digits(max);
    if (value > 0) setSmsSettings({ autoRecordMax: value });
    else setMax(String(settings.autoRecordMax));
  };
  return (
    <div className="app-setting-block">
      <div className="app-setting-row">
        <div>
          <strong>ثبت خودکار هزینه‌های کوچک</strong>
          <p>برداشت‌های تا مبلغ زیر، بدون پرسیدن، در هزینه‌های روزمره ثبت می‌شوند (وقتی اطلاعات رمزنگاری‌شده باز است).</p>
        </div>
        <Switch checked={settings.autoRecord} onChange={(on) => setSmsSettings({ autoRecord: on })} label="ثبت خودکار هزینه‌های کوچک" />
      </div>
      {settings.autoRecord && (
        <div className="app-setting-field">
          <label htmlFor="sms-auto-max">تا مبلغ</label>
          <NumericInput
            id="sms-auto-max"
            value={max}
            onValueChange={setMax}
            onBlur={saveMax}
            affix="تومان"
          />
        </div>
      )}
      <div className="app-setting-field">
        <span>دسته‌ی ثبت خودکار و «ثبت سریع»</span>
        <div className="app-category-chips" role="radiogroup" aria-label="دسته‌ی هزینه">
          {categories.map(({ value, label, Icon, color }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={settings.recordCategory === value}
              className={`app-category-chip ${settings.recordCategory === value ? 'is-active' : ''}`}
              style={{ '--chip-color': color }}
              onClick={() => setSmsSettings({ recordCategory: value })}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <small>
          «ثبت سریع» کنار برداشت‌های تا {faNum(QUICK_RECORD_MAX)} تومان در صفحه‌ی پیامک‌ها می‌آید و با یک ضربه در
          «{getExpenseCategory(settings.recordCategory).label}» ثبت می‌کند. بعداً می‌توانید دسته را در فهرست هزینه‌ها عوض کنید.
        </small>
      </div>
    </div>
  );
}

const faVersion = (v) => String(v || '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/** «به‌روزرسانی»: automatic check on/off, and a check right now */
function AppUpdateSettings() {
  const { toast } = useFeedback();
  const update = useAppUpdate();
  const checking = update.status === 'checking';
  const hasUpdate = Boolean(update.release && update.installedVersion) && update.status !== 'latest';

  const handleCheck = async () => {
    const result = await checkForUpdate({ manual: true });
    if (result.status === 'latest') toast.success('آخرین نسخه‌ی اپ نصب است.');
    else if (result.status === 'error') toast.error(result.error || 'بررسی به‌روزرسانی ممکن نشد.');
  };

  return (
    <>
      <div className="app-setting-row">
        <div>
          <strong>بررسی خودکار به‌روزرسانی</strong>
          <p>با باز شدن اپ، اگر نسخه‌ی جدیدی منتشر شده باشد خبر می‌دهد تا با یک ضربه دانلود و نصب شود.</p>
        </div>
        <Switch checked={update.settings.auto} onChange={setAutoUpdateCheck} label="بررسی خودکار به‌روزرسانی" />
      </div>
      <div className="app-setting-row">
        <div>
          <strong>{hasUpdate ? `نسخه‌ی ${faVersion(update.release.version)} آماده است` : 'به‌روزرسانی'}</strong>
          <p>{update.settings.lastCheck ? `آخرین بررسی: ${formatTime(update.settings.lastCheck)}` : 'هنوز بررسی نشده'}</p>
        </div>
        {hasUpdate ? (
          <Button size="sm" icon={<Download size={14} />} onClick={openUpdatePrompt}>به‌روزرسانی</Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={checking} onClick={handleCheck}>
            بررسی به‌روزرسانی
          </Button>
        )}
      </div>
    </>
  );
}

const DUE_LEAD_OPTIONS = [
  { days: 7, label: '۷ روز قبل' },
  { days: 3, label: '۳ روز قبل' },
  { days: 1, label: '۱ روز قبل' },
  { days: 0, label: 'روز سررسید' },
];

function DueNotificationSettings() {
  const { toast } = useFeedback();
  const [settings, setSettings] = useState(getDueNotificationSettings);
  const [permission, setPermission] = useState('granted');

  useEffect(() => {
    checkNotificationPermission().then(setPermission);
  }, []);

  const handleToggleEnabled = async (on) => {
    if (on && permission !== 'granted') {
      const res = await requestNotificationPermission();
      setPermission(res);
      if (res !== 'granted') {
        toast.error('مجوز ارسال اعلان به برنامه داده نشده است.');
        return;
      }
    }
    const next = setDueNotificationSettings({ enabled: on });
    setSettings(next);
  };

  const handleToggleLeadDay = (day) => {
    const prev = settings.leadDays || [];
    const nextDays = prev.includes(day)
      ? prev.filter((d) => d !== day)
      : [...prev, day];
    const next = setDueNotificationSettings({ leadDays: nextDays });
    setSettings(next);
  };

  const handleToggleShowAmount = (on) => {
    const next = setDueNotificationSettings({ showAmount: on });
    setSettings(next);
  };

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    if (res === 'granted') {
      toast.success('مجوز ارسال اعلان فعال شد.');
    } else {
      toast.error('مجوز ارسال اعلان رد شد.');
    }
  };

  return (
    <Card
      className="app-settings-card"
      padding="lg"
      icon={<Bell size={18} />}
      title="یادآوری سررسید"
      subtitle="اعلان روی همین گوشی برای اقساط وام و چک‌ها. عناوین و مبالغ فقط روی گوشی پردازش می‌شوند."
    >
      <div className="app-setting-row">
        <div>
          <strong>اعلان‌های سررسید روی گوشی</strong>
          <p>ارسال اعلان در ساعت ۰۹:۰۰ صبح روزهای انتخابی قبل از سررسید و صبح بعد از سررسید برای موارد معوق.</p>
        </div>
        <Switch
          checked={settings.enabled}
          onChange={handleToggleEnabled}
          label="اعلان‌های سررسید روی گوشی"
        />
      </div>

      {permission !== 'granted' && (
        <div style={{ marginTop: '12px' }}>
          <AlertBanner
            type="warning"
            message="مجوز ارسال اعلان به برنامه داده نشده است."
            action={
              <Button size="sm" variant="secondary" onClick={handleRequestPermission}>
                درخواست مجوز
              </Button>
            }
          />
        </div>
      )}

      {settings.enabled && (
        <>
          <div style={{ marginTop: '16px' }}>
            <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
              زمان ارسال اعلان:
            </strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {DUE_LEAD_OPTIONS.map((opt) => {
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
                      border: active ? '1px solid var(--accent-blue, #38bdf8)' : '1px solid var(--border-color, rgba(255,255,255,0.12))',
                      background: active ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                      color: active ? 'var(--accent-blue, #38bdf8)' : 'var(--text-secondary)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="app-setting-row" style={{ marginTop: '14px', borderTop: '1px solid var(--border-color, rgba(255,255,255,0.06))', paddingTop: '14px' }}>
            <div>
              <strong>نمایش مبلغ در اعلان</strong>
              <p>در صورت فعال بودن، مبلغ هر قسط، چک یا درآمد در متن اعلان نشان داده می‌شود (در حالت حریم خصوصی پنهان می‌ماند).</p>
            </div>
            <Switch
              checked={settings.showAmount}
              onChange={handleToggleShowAmount}
              label="نمایش مبلغ در اعلان"
            />
          </div>
        </>
      )}
    </Card>
  );
}

export default function AppSettingsView({ onOpenSms }) {
  const { toast } = useFeedback();
  const vault = useVault();
  const { pending, settings } = useSmsInbox();
  const [permission, setPermission] = useState('prompt');
  const [bio, setBio] = useState({ available: false, enabled: false, busy: false });
  const [version, setVersion] = useState('');

  useEffect(() => {
    smsPermission().then(setPermission);
    Promise.all([isBiometricAvailable(), isBiometricEnabled(vault.userId)])
      .then(([available, enabled]) => setBio((b) => ({ ...b, available, enabled })));
    import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => setVersion(`${info.version} (${info.build})`))
      .catch(() => {});
  }, [vault.userId]);

  const handleAuto = async (on) => {
    if (!on) {
      setSmsSettings({ auto: false });
      return;
    }
    const { permission: next } = await enableSmsReading();
    setPermission(next);
    if (next !== 'granted') {
      toast.error('اجازه‌ی خواندن پیامک داده نشد. می‌توانید از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها) آن را بدهید.', { duration: 8000 });
      return;
    }
    toast.success('از این پس پیامک‌های بانک خودکار خوانده می‌شوند.');
  };

  const handleBiometric = async (on) => {
    setBio((b) => ({ ...b, busy: true }));
    try {
      if (on) {
        await enableBiometric();
        toast.success('از این پس اطلاعات رمزنگاری‌شده با اثر انگشت باز می‌شود.');
      } else {
        await disableBiometric();
      }
      setBio((b) => ({ ...b, enabled: on }));
    } catch (err) {
      if (err?.code !== 'CANCELED') toast.error(err?.message || 'فعال کردن اثر انگشت ممکن نشد.');
    } finally {
      setBio((b) => ({ ...b, busy: false }));
    }
  };

  const vaultUnlocked = vault.status === 'unlocked';

  return (
    <div className="app-settings-page">
      <FeaturePageHeader icon={<Smartphone size={24} />} title="تنظیمات اپ" subtitle="پیامک‌های بانکی، اثر انگشت و نسخه‌ی اپ" />

      <Card
        className="app-settings-card"
        padding="lg"
        icon={<MessageSquareText size={18} />}
        title="پیامک‌های بانکی"
        subtitle="برداشت‌ها و واریزها از پیامک بانک خوانده می‌شوند تا فقط دسته‌شان را انتخاب کنید. متن پیامک‌ها روی گوشی می‌ماند."
      >
        <div className="app-setting-row">
          <div>
            <strong>خواندن خودکار و اعلان</strong>
            <p>فقط با رسیدن پیامک برداشت یا واریز اعلانی می‌آید (پیامک‌های دیگر خوانده نمی‌شوند)؛ با ضربه روی آن، مبلغ و تاریخ آماده‌ی ثبت است.</p>
          </div>
          <Switch checked={settings.auto && permission === 'granted'} onChange={handleAuto} label="خواندن خودکار پیامک" />
        </div>

        <SmsBankSettings settings={settings} />

        <SmsRecordSettings key={settings.autoRecordMax} settings={settings} />

        {permission === 'denied' && (
          <AlertBanner type="warning" message="اجازه‌ی خواندن پیامک داده نشده است. از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها ← پیامک) آن را بدهید." />
        )}

        <dl className="app-setting-facts">
          <dt>آخرین خواندن</dt>
          <dd>{formatTime(settings.lastRead)}</dd>
          <dt>منتظر ثبت</dt>
          <dd>
            {pending.length.toLocaleString('fa-IR')} پیامک
            {onOpenSms && (
              <Button size="sm" variant="secondary" iconRight={<ArrowLeft size={14} />} onClick={onOpenSms}>
                پیامک‌های بانکی
              </Button>
            )}
          </dd>
        </dl>
      </Card>

      <DueNotificationSettings />

      <Card
        className="app-settings-card"
        padding="lg"
        icon={<Fingerprint size={18} />}
        title="اثر انگشت"
        subtitle="یک بار با رمز عبور رمزنگاری باز کنید؛ از آن به بعد اثر انگشت کافی است. کلید روی همین گوشی و در بخش امن اندروید نگه داشته می‌شود."
      >
        {!bio.available ? (
          <AlertBanner type="info" message="اثر انگشت یا تشخیص چهره روی این گوشی فعال نیست (از تنظیمات گوشی اضافه کنید)." />
        ) : (
          <>
            <div className="app-setting-row">
              <div>
                <strong>باز کردن با اثر انگشت</strong>
                <p>{bio.enabled ? 'فعال است.' : 'غیرفعال'}</p>
              </div>
              <Switch
                checked={bio.enabled}
                onChange={handleBiometric}
                disabled={bio.busy || (!bio.enabled && !vaultUnlocked)}
                label="باز کردن با اثر انگشت"
              />
            </div>
            {!bio.enabled && !vaultUnlocked && (
              <AlertBanner type="info" message="برای فعال کردن، ابتدا اطلاعات رمزنگاری‌شده را با رمز عبور باز کنید." />
            )}
          </>
        )}
      </Card>

      <Card className="app-settings-card" padding="lg" icon={<Info size={18} />} title="درباره اپ">
        <AppUpdateSettings />
        <dl className="app-setting-facts">
          <dt>نسخه</dt>
          <dd dir="ltr">{version || '—'}</dd>
        </dl>
      </Card>
    </div>
  );
}
