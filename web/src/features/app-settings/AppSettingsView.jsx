/**
 * AppSettingsView.jsx — Settings of the Android app (shown only inside the app)
 *
 * - Bank SMS: read them automatically (on opening the app and on every return to it), and read
 *   the last N days now; the withdrawals found wait in everyday expenses to be recorded
 * - Fingerprint: open the encrypted data with the fingerprint instead of the passphrase
 * - The app's version
 */

import React, { useEffect, useState } from 'react';
import { Smartphone, MessageSquareText, Fingerprint, Info, ArrowLeft } from 'lucide-react';
import { AlertBanner, Button, Card, FeaturePageHeader, FilterPills } from '../../shared/ui/index.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useVault } from '../../shared/vault/useVault.js';
import { resolveBank } from '../../shared/banks/index.js';
import { SMS_BANK_IDS } from '../../utils/bankSmsTemplates.js';
import { useSmsInbox } from '../../shared/native/useSmsInbox.js';
import { setSmsSettings, smsPermission, readSmsDays, autoReadSms, SMS_SENDERS } from '../../shared/native/smsInbox.js';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
} from '../../shared/native/biometricUnlock.js';

const DAY_OPTIONS = [7, 30, 90].map((d) => ({ value: d, label: `${d.toLocaleString('fa-IR')} روز` }));
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

export default function AppSettingsView({ onOpenExpenses }) {
  const { toast } = useFeedback();
  const vault = useVault();
  const { pending, settings } = useSmsInbox();
  const [permission, setPermission] = useState('prompt');
  const [days, setDays] = useState(30);
  const [reading, setReading] = useState(false);
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

  /** Ask for the SMS permission when needed; false when refused */
  const ensurePermission = async () => {
    if (permission === 'granted') return true;
    const next = await smsPermission({ request: true });
    setPermission(next);
    if (next !== 'granted') {
      toast.error('اجازه‌ی خواندن پیامک داده نشد. می‌توانید از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها) آن را بدهید.', { duration: 8000 });
      return false;
    }
    return true;
  };

  const handleAuto = async (on) => {
    if (on && !(await ensurePermission())) return;
    setSmsSettings({ auto: on });
    if (on) {
      const added = await autoReadSms();
      toast.success(added ? `${added.toLocaleString('fa-IR')} برداشت جدید پیدا شد.` : 'خواندن خودکار پیامک‌ها روشن شد.');
    }
  };

  const handleReadDays = async () => {
    if (!(await ensurePermission())) return;
    setReading(true);
    try {
      const { read, added } = await readSmsDays(days);
      toast.success(`${read.toLocaleString('fa-IR')} پیامک بانکی خوانده شد؛ ${added.toLocaleString('fa-IR')} برداشت جدید.`);
    } catch (err) {
      toast.error(err?.message || 'خواندن پیامک‌ها ممکن نشد.');
    } finally {
      setReading(false);
    }
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
        subtitle="برداشت‌ها از پیامک بانک خوانده می‌شوند تا فقط دسته‌شان را انتخاب کنید. متن پیامک‌ها روی گوشی می‌ماند."
      >
        <div className="app-setting-row">
          <div>
            <strong>خواندن خودکار</strong>
            <p>هر بار که اپ باز می‌شود، پیامک‌های جدید بانک خوانده می‌شوند.</p>
          </div>
          <Switch checked={settings.auto} onChange={handleAuto} label="خواندن خودکار پیامک" />
        </div>

        <div className="app-setting-row is-stacked">
          <div>
            <strong>خواندن پیامک‌های گذشته</strong>
            <p>پیامک‌های بانک در این بازه یک‌جا خوانده می‌شوند (تکراری‌ها و ثبت‌شده‌ها کنار گذاشته می‌شوند).</p>
          </div>
          <div className="app-setting-actions">
            <FilterPills options={DAY_OPTIONS} activeValue={days} onChange={setDays} size="sm" />
            <Button size="sm" onClick={handleReadDays} loading={reading}>بخوان</Button>
          </div>
        </div>

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
            {pending.length.toLocaleString('fa-IR')} برداشت
            {pending.length > 0 && onOpenExpenses && (
              <Button size="sm" variant="secondary" iconRight={<ArrowLeft size={14} />} onClick={onOpenExpenses}>
                ثبت در هزینه‌ها
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
