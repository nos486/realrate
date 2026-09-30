/**
 * AppSettingsView.jsx — Settings of the Android app (shown only inside the app)
 *
 * - Bank SMS: automatic reading on/off (a notification for each bank message as it arrives);
 *   the messages wait on the «پیامک‌های بانکی» page, which also reads older ones on request.
 *   Small withdrawals: recorded by themselves up to an amount (off by default), in a category
 *   that «ثبت سریع» uses too (features/sms-inbox/smsRecord.js)
 * - Fingerprint: open the encrypted data with the fingerprint instead of the passphrase
 * - The app's version
 */

import React, { useEffect, useState } from 'react';
import { Smartphone, MessageSquareText, Fingerprint, Info, ArrowLeft } from 'lucide-react';
import { AlertBanner, Button, Card, FeaturePageHeader } from '../../shared/ui/index.js';
import { NumericInput } from '../../shared/ui/NumericInput.jsx';
import { EXPENSE_CATEGORIES, getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { resolveBank } from '../../shared/banks/index.js';
import { SMS_BANK_IDS } from '../../utils/bankSmsTemplates.js';
import { useSmsInbox } from '../../shared/native/useSmsInbox.js';
import { setSmsSettings, smsPermission, enableSmsReading, SMS_SENDERS, QUICK_RECORD_MAX } from '../../shared/native/smsInbox.js';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
} from '../../shared/native/biometricUnlock.js';

const SUPPORTED_BANKS = SMS_BANK_IDS.map((id) => resolveBank({ bankId: id }).shortName).join('، ');

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
          {EXPENSE_CATEGORIES.map(({ value, label, Icon, color }) => (
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

        <SmsRecordSettings key={settings.autoRecordMax} settings={settings} />

        {permission === 'denied' && (
          <AlertBanner type="warning" message="اجازه‌ی خواندن پیامک داده نشده است. از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها ← پیامک) آن را بدهید." />
        )}

        <dl className="app-setting-facts">
          <dt>بانک‌ها</dt>
          <dd>{SUPPORTED_BANKS} <small dir="ltr">({SMS_SENDERS.join('، ')})</small></dd>
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
        <dl className="app-setting-facts">
          <dt>نسخه</dt>
          <dd dir="ltr">{version || '—'}</dd>
        </dl>
      </Card>
    </div>
  );
}
