/**
 * AppSettingsView.jsx — Settings of the Android app (shown only inside the app)
 *
 * - Bank SMS: automatic reading on/off (a notification for each bank message as it arrives);
 *   the messages wait on the «پیامک‌های بانکی» page, which also reads older ones on request.
 *   Small withdrawals: recorded by themselves up to an amount (off by default), in a category
 *   that «ثبت سریع» uses too (features/sms-inbox/smsRecord.js)
 * - «حذف ثبت‌های خودکار پیامک»: deletes the expenses and incomes made from bank SMS in a date range
 *   (never hand-entered ones), after showing how many and asking to confirm (smsRecordsCleanup.js)
 * - Fingerprint: open the encrypted data with the fingerprint instead of the passphrase
 * - The app's version and its updates: automatic check on/off, «بررسی به‌روزرسانی» (shared/native/appUpdate.js)
 */

import { getLocale, intlLocale, t } from '../../utils/i18n.js';
import { toPersianDigits } from '../../shared/utils/formatters.js';
import React, { useEffect, useState } from 'react';
import LanguageSwitch from '../../shared/i18n/LanguageSwitch.jsx';
import { useFeature } from '../../shared/features/useFeature.js';
import ProLockedCard from '../../shared/plan/ProLockedCard.jsx';
import { Languages, Smartphone, MessageSquareText, Trash2, Fingerprint, Info, ArrowLeft, RefreshCw, Download, Bell, LayoutGrid, Plus, X } from 'lucide-react';
import { AlertBanner, Button, Card, FeaturePageHeader } from '../../shared/ui/index.js';
import { NumericInput } from '../../shared/ui/NumericInput.jsx';
import { getExpenseCategory } from '../expenses/constants/expenseCategories.js';
import { getIncomeCategory } from '../incomes/constants/incomeCategories.js';
import { useCategories } from '../../shared/categories/useCategories.js';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { DateField } from '../../shared/form/index.js';
import { getTodayShamsi, shamsiToGregorian } from '../portfolio/components/ShamsiDatePicker.jsx';
import { bumpVaultEpoch } from '../../shared/vault/vaultStore.js';
import { findSmsRecords, deleteSmsRecords } from './smsRecordsCleanup.js';
import { useVault } from '../../shared/vault/useVault.js';
import { resolveBank, BankLogo } from '../../shared/banks/index.js';
import { BANK_SMS_TEMPLATES } from '../../utils/bankSmsTemplates.js';
import { smsEnabled, selfUpdateEnabled } from '../../shared/native/nativeApp.js';
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
import { usePricing } from '../market/context/PricingContext.jsx';
import AssetPickerModal from '../home/AssetPickerModal.jsx';
import {
  WIDGET_KINDS,
  WIDGET_MAX_ITEMS,
  WIDGET_DEFAULT_ITEMS,
  getWidgetFavorites,
  setWidgetFavorites,
  requestPinWidget,
} from '../../shared/native/widgets.js';
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
      <strong>{t('بانک‌ها')}</strong>
      <p>{t('پیامک‌های کدام بانک‌ها خوانده شود؟ بانکی را که خاموش کنید، پیامکش خوانده نمی‌شود و اعلانی نمی‌آید.')}</p>
      <ul>
        {BANK_SMS_TEMPLATES.map(({ bankId, senders = [] }) => {
          const bank = resolveBank({ bankId });
          return (
            <li key={bankId} className={off.has(bankId) ? 'is-off' : ''}>
              <BankLogo bank={bank} size={28} />
              <span className="app-setting-bank-name">
                <b>{bank.name || bank.shortName}</b>
                <small dir="ltr">{senders.join(t('، '))}</small>
              </span>
              <Switch checked={!off.has(bankId)} onChange={(on) => setSmsBankEnabled(bankId, on)} label={t('خواندن پیامک {bank}', { bank: bank.shortName })} />
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
  if (!ms) return t('هنوز خوانده نشده');
  return new Date(ms).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' });
}

const faNum = (n) => Number(n || 0).toLocaleString(intlLocale());
const digits = (v) => Number(String(v ?? '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d]/g, '')) || 0; // i18n-ignore

/** Small withdrawals: recorded by themselves up to an amount, the «ثبت سریع» button, and the category used for them */
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
          <strong>{t('ثبت خودکار هزینه‌های کوچک')}</strong>
          <p>{t('برداشت‌های تا مبلغ زیر، بدون پرسیدن، در هزینه‌های روزمره ثبت می‌شوند (وقتی اطلاعات رمزنگاری‌شده باز است).')}</p>
        </div>
        <Switch checked={settings.autoRecord} onChange={(on) => setSmsSettings({ autoRecord: on })} label={t('ثبت خودکار هزینه‌های کوچک')} />
      </div>
      {settings.autoRecord && (
        <div className="app-setting-field">
          <label htmlFor="sms-auto-max">{t('تا مبلغ')}</label>
          <NumericInput
            id="sms-auto-max"
            value={max}
            onValueChange={setMax}
            onBlur={saveMax}
            affix={t('تومان')}
          />
        </div>
      )}
      <div className="app-setting-row">
        <div>
          <strong>{t('دکمه‌ی «ثبت سریع»')}</strong>
          <p>{t('کنار برداشت‌های تا {max} تومان در صفحه‌ی پیامک‌ها، به‌جای «ثبت»، دکمه‌ای می‌آید که بدون فرم و با یک ضربه ثبت می‌کند.', { max: faNum(QUICK_RECORD_MAX) })}</p>
        </div>
        <Switch checked={settings.quickRecord} onChange={(on) => setSmsSettings({ quickRecord: on })} label={t('دکمه‌ی ثبت سریع')} />
      </div>
      <div className="app-setting-field">
        <span>{t('دسته‌ی ثبت خودکار و «ثبت سریع»')}</span>
        <div className="app-category-chips" role="radiogroup" aria-label={t('دسته‌ی هزینه')}>
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
          {t('ثبت خودکار و «ثبت سریع» در «{category}» ثبت می‌کنند. بعداً می‌توانید دسته را در فهرست هزینه‌ها عوض کنید.', { category: getExpenseCategory(settings.recordCategory).label })}
        </small>
      </div>
    </div>
  );
}

/** Small deposits: recorded by themselves up to an amount, as incomes of a chosen category */
function SmsIncomeRecordSettings({ settings }) {
  const categories = useCategories('income', { keep: settings.incomeCategory });
  const [max, setMax] = useState(String(settings.autoRecordIncomeMax));
  const saveMax = () => {
    const value = digits(max);
    if (value > 0) setSmsSettings({ autoRecordIncomeMax: value });
    else setMax(String(settings.autoRecordIncomeMax));
  };
  return (
    <div className="app-setting-block">
      <div className="app-setting-row">
        <div>
          <strong>{t('ثبت خودکار واریزهای کوچک')}</strong>
          <p>{t('واریزهای تا مبلغ زیر، بدون پرسیدن، به‌عنوان درآمد در دسته‌ی انتخابی ثبت می‌شوند (وقتی اطلاعات رمزنگاری‌شده باز است). واریزهای بزرگ‌تر در صفحه‌ی پیامک‌ها می‌مانند تا خودتان تعیین کنید (درآمد، وام، دنگ یا انتقال).')}</p>
        </div>
        <Switch checked={settings.autoRecordIncome} onChange={(on) => setSmsSettings({ autoRecordIncome: on })} label={t('ثبت خودکار واریزهای کوچک')} />
      </div>
      {settings.autoRecordIncome && (
        <>
          <div className="app-setting-field">
            <label htmlFor="sms-auto-income-max">{t('تا مبلغ')}</label>
            <NumericInput
              id="sms-auto-income-max"
              value={max}
              onValueChange={setMax}
              onBlur={saveMax}
              affix={t('تومان')}
            />
          </div>
          <div className="app-setting-field">
            <span>{t('دسته‌ی واریزهای خودکار')}</span>
            <div className="app-category-chips" role="radiogroup" aria-label={t('دسته‌ی درآمد')}>
              {categories.map(({ value, label, Icon, color }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={settings.incomeCategory === value}
                  className={`app-category-chip ${settings.incomeCategory === value ? 'is-active' : ''}`}
                  style={{ '--chip-color': color }}
                  onClick={() => setSmsSettings({ incomeCategory: value })}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            <small>
              {t('واریزهای کوچک در «{category}» ثبت می‌شوند. بعداً می‌توانید دسته را در فهرست درآمدها عوض کنید.', { category: getIncomeCategory(settings.incomeCategory).label })}
            </small>
          </div>
        </>
      )}
    </div>
  );
}

const faVersion = (v) => toPersianDigits(String(v || ''));

/** «به‌روزرسانی»: automatic check on/off, and a check right now */
function AppUpdateSettings() {
  const { toast } = useFeedback();
  const update = useAppUpdate();
  const checking = update.status === 'checking';
  const hasUpdate = Boolean(update.release && update.installedVersion) && update.status !== 'latest';

  const handleCheck = async () => {
    const result = await checkForUpdate({ manual: true });
    if (result.status === 'latest') toast.success(t('آخرین نسخه‌ی اپ نصب است.'));
    else if (result.status === 'error') toast.error(result.error || t('بررسی به‌روزرسانی ممکن نشد.'));
  };

  return (
    <>
      <div className="app-setting-row">
        <div>
          <strong>{t('بررسی خودکار به‌روزرسانی')}</strong>
          <p>{t('با باز شدن اپ، اگر نسخه‌ی جدیدی منتشر شده باشد خبر می‌دهد تا با یک ضربه دانلود و نصب شود.')}</p>
        </div>
        <Switch checked={update.settings.auto} onChange={setAutoUpdateCheck} label={t('بررسی خودکار به‌روزرسانی')} />
      </div>
      <div className="app-setting-row">
        <div>
          <strong>{hasUpdate ? t('نسخه‌ی {version} آماده است', { version: faVersion(update.release.version) }) : t('به‌روزرسانی')}</strong>
          <p>{update.settings.lastCheck ? t('آخرین بررسی: {time}', { time: formatTime(update.settings.lastCheck) }) : t('هنوز بررسی نشده')}</p>
        </div>
        {hasUpdate ? (
          <Button size="sm" icon={<Download size={14} />} onClick={openUpdatePrompt}>{t('به‌روزرسانی')}</Button>
        ) : (
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={checking} onClick={handleCheck}>
            {t('بررسی به‌روزرسانی')}
          </Button>
        )}
      </div>
    </>
  );
}

/** «ویجت»: place the home-screen widget and pick the items whose prices it lists */
function WidgetSettings() {
  const { toast } = useFeedback();
  const pricing = usePricing();
  const [chosen, setChosen] = useState([]);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    getWidgetFavorites().then(setChosen);
  }, []);

  const shown = chosen.length ? chosen : WIDGET_DEFAULT_ITEMS;
  const save = (ids) => setWidgetFavorites(ids).then(setChosen);
  const toggle = (id, add) => {
    // The first pick starts from the list shown until now, so a default isn't lost by surprise
    const base = chosen.length ? chosen : WIDGET_DEFAULT_ITEMS;
    if (add && base.length >= WIDGET_MAX_ITEMS) {
      toast.error(t('حداکثر {max} مورد در ویجت جا می‌شود.', { max: faNum(WIDGET_MAX_ITEMS) }));
      return;
    }
    save(add ? [...base, id] : base.filter((x) => x !== id));
  };
  const handlePin = async () => {
    const requested = await requestPinWidget();
    if (!requested) toast.info(t('ویجت را از لیست ویجت‌های گوشی (نگه داشتن روی صفحه‌ی اصلی ← ویجت‌ها ← RealRate) اضافه کنید.'));
  };

  return (
    <Card
      className="app-settings-card"
      padding="lg"
      icon={<LayoutGrid size={18} />}
      title={t('ویجت صفحه‌ی اصلی')}
      subtitle={t('قیمت دارایی‌های موردعلاقه و خبرهای هوش مصنوعی را بدون باز کردن اپ روی صفحه‌ی اصلی گوشی ببین. ویجت خودش را هر ۱۰ دقیقه و با ضربه روی دکمه‌ی تازه‌سازی به‌روز می‌کند.')}
    >
      {WIDGET_KINDS.map((kind) => (
        <div className="app-setting-row" key={kind.key}>
          <div>
            <strong>{kind.label}</strong>
            <p>{kind.hint}</p>
          </div>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={handlePin}>
            {t('افزودن')}
          </Button>
        </div>
      ))}
      <div className="app-setting-block">
        <strong>{t('دارایی‌های ویجت')}</strong>
        <p>{chosen.length ? t('به ترتیب نمایش:') : t('تا انتخاب نکنی، این‌ها نشان داده می‌شوند:')}</p>
        <div className="app-category-chips">
          {shown.map((id) => (
            <span className="app-category-chip is-active" key={id}>
              {pricing?.getAsset?.(id)?.name || id}
              {chosen.length > 0 && (
                <button type="button" className="app-chip-remove" aria-label={t('حذف')} onClick={() => toggle(id, false)}>
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setPicking(true)}>
          {t('انتخاب دارایی‌ها')}
        </Button>
      </div>
      <AssetPickerModal
        isOpen={picking}
        section={{ title: t('ویجت'), items: shown }}
        onClose={() => setPicking(false)}
        onToggle={toggle}
      />
    </Card>
  );
}

const DUE_LEAD_OPTIONS = [
  { days: 7, label: t('۷ روز قبل') },
  { days: 3, label: t('۳ روز قبل') },
  { days: 1, label: t('۱ روز قبل') },
  { days: 0, label: t('روز سررسید') },
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
        toast.error(t('مجوز ارسال اعلان به برنامه داده نشده است.'));
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
      toast.success(t('مجوز ارسال اعلان فعال شد.'));
    } else {
      toast.error(t('مجوز ارسال اعلان رد شد.'));
    }
  };

  return (
    <Card
      className="app-settings-card"
      padding="lg"
      icon={<Bell size={18} />}
      title={t('یادآوری سررسید')}
      subtitle={t('اعلان روی همین گوشی برای اقساط وام و چک‌ها. عناوین و مبالغ فقط روی گوشی پردازش می‌شوند.')}
    >
      <div className="app-setting-row">
        <div>
          <strong>{t('اعلان‌های سررسید روی گوشی')}</strong>
          <p>{t('ارسال اعلان در ساعت ۰۹:۰۰ صبح روزهای انتخابی قبل از سررسید و صبح بعد از سررسید برای موارد معوق.')}</p>
        </div>
        <Switch
          checked={settings.enabled}
          onChange={handleToggleEnabled}
          label={t('اعلان‌های سررسید روی گوشی')}
        />
      </div>

      {permission !== 'granted' && (
        <div style={{ marginTop: '12px' }}>
          <AlertBanner
            type="warning"
            message={t('مجوز ارسال اعلان به برنامه داده نشده است.')}
            action={
              <Button size="sm" variant="secondary" onClick={handleRequestPermission}>
                {t('درخواست مجوز')}
              </Button>
            }
          />
        </div>
      )}

      {settings.enabled && (
        <>
          <div style={{ marginTop: '16px' }}>
            <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
              {t('زمان ارسال اعلان:')}
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
              <strong>{t('نمایش مبلغ در اعلان')}</strong>
              <p>{t('در صورت فعال بودن، مبلغ هر قسط، چک یا درآمد در متن اعلان نشان داده می‌شود (در حالت حریم خصوصی پنهان می‌ماند).')}</p>
            </div>
            <Switch
              checked={settings.showAmount}
              onChange={handleToggleShowAmount}
              label={t('نمایش مبلغ در اعلان')}
            />
          </div>
        </>
      )}
    </Card>
  );
}

/** «حذف ثبت‌های خودکار پیامک»: count, confirm, then delete what SMS made in a date range */
function SmsRecordsCleanup({ vaultUnlocked }) {
  const { toast, confirm } = useFeedback();
  const [fromShamsi, setFromShamsi] = useState(getTodayShamsi());
  const [toShamsi, setToShamsi] = useState(getTodayShamsi());
  const [busy, setBusy] = useState(false);
  const fromIso = shamsiToGregorian(fromShamsi);
  const toIso = shamsiToGregorian(toShamsi);
  const valid = Boolean(fromIso && toIso && fromIso <= toIso);

  const handleDelete = async () => {
    setBusy(true);
    try {
      const found = await findSmsRecords(fromIso, toIso);
      const count = found.expenses.length + found.incomes.length;
      if (!count) {
        toast.success(t('در این بازه ثبت خودکاری از پیامک نیست.'));
        return;
      }
      const ok = await confirm({
        title: t('حذف ثبت‌های خودکار پیامک'),
        message: t('{expenses} هزینه و {incomes} درآمد که از پیامک بانک ساخته شده‌اند حذف می‌شوند. موردهای دستی دست نمی‌خورند. ادامه می‌دهید؟', { expenses: found.expenses.length.toLocaleString(intlLocale()), incomes: found.incomes.length.toLocaleString(intlLocale()) }),
        confirmLabel: t('حذف'),
        danger: true,
      });
      if (!ok) return;
      const deleted = await deleteSmsRecords(found);
      bumpVaultEpoch();
      toast.success(t('{n} مورد حذف شد.', { n: deleted.toLocaleString(intlLocale()) }));
    } catch (err) {
      toast.error(err?.message || t('حذف ممکن نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      className="app-settings-card"
      padding="lg"
      icon={<Trash2 size={18} />}
      title={t('حذف ثبت‌های خودکار پیامک')}
      subtitle={t('هزینه‌ها و درآمدهایی که خودکار از پیامک بانک ساخته شده‌اند، در یک بازه حذف می‌شوند. موردهای واردشده با دست هرگز حذف نمی‌شوند.')}
    >
      <div className="sms-read-range">
        <DateField label={t('از تاریخ')} value={fromShamsi} onChange={setFromShamsi} />
        <DateField label={t('تا تاریخ')} value={toShamsi} onChange={setToShamsi} />
        {!valid && <p className="expense-form-hint is-warning">{t('تاریخ «از» باید پیش از «تا» (یا همان روز) باشد.')}</p>}
      </div>
      {!vaultUnlocked && <AlertBanner type="info" message={t('برای حذف، ابتدا اطلاعات رمزنگاری‌شده را باز کنید.')} />}
      <div className="app-setting-actions">
        <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={handleDelete} loading={busy} disabled={!valid || !vaultUnlocked}>
          {t('شمارش و حذف')}
        </Button>
      </div>
    </Card>
  );
}

const GITHUB_URL = 'https://github.com/nos486/realrate';

export default function AppSettingsView({ onOpenSms }) {
  const hasWidget = useFeature('widget');
  const { toast } = useFeedback();
  const vault = useVault();
  const { pending, settings } = useSmsInbox();
  const [permission, setPermission] = useState('prompt');
  const [bio, setBio] = useState({ available: false, enabled: false, busy: false });
  const [version, setVersion] = useState('');
  const [packageId, setPackageId] = useState('');

  useEffect(() => {
    smsPermission().then(setPermission);
    Promise.all([isBiometricAvailable(), isBiometricEnabled(vault.userId)])
      .then(([available, enabled]) => setBio((b) => ({ ...b, available, enabled })));
    import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => {
        setVersion(`${info.version} (${info.build})`);
        setPackageId(info.id || '');
      })
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
      toast.error(t('اجازه‌ی خواندن پیامک داده نشد. می‌توانید از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها) آن را بدهید.'), { duration: 8000 });
      return;
    }
    toast.success(t('از این پس پیامک‌های بانک خودکار خوانده می‌شوند.'));
  };

  const handleBiometric = async (on) => {
    setBio((b) => ({ ...b, busy: true }));
    try {
      if (on) {
        await enableBiometric();
        toast.success(t('از این پس اطلاعات رمزنگاری‌شده با اثر انگشت باز می‌شود.'));
      } else {
        await disableBiometric();
      }
      setBio((b) => ({ ...b, enabled: on }));
    } catch (err) {
      if (err?.code !== 'CANCELED') toast.error(err?.message || t('فعال کردن اثر انگشت ممکن نشد.'));
    } finally {
      setBio((b) => ({ ...b, busy: false }));
    }
  };

  const vaultUnlocked = vault.status === 'unlocked';

  return (
    <div className="app-settings-page">
      <FeaturePageHeader icon={<Smartphone size={24} />} title={t('تنظیمات اپ')} subtitle={t('پیامک‌های بانکی، اثر انگشت و نسخه‌ی اپ')} />

      {smsEnabled() && (
        <Card
          className="app-settings-card"
          padding="lg"
          icon={<MessageSquareText size={18} />}
          title={t('پیامک‌های بانکی')}
          subtitle={t('برداشت‌ها و واریزها از پیامک بانک خوانده می‌شوند تا فقط دسته‌شان را انتخاب کنید. متن پیامک‌ها روی گوشی می‌ماند.')}
        >
          <div className="app-setting-row">
            <div>
              <strong>{t('خواندن خودکار و اعلان')}</strong>
              <p>{t('فقط با رسیدن پیامک برداشت یا واریز اعلانی می‌آید (پیامک‌های دیگر خوانده نمی‌شوند)؛ با ضربه روی آن، مبلغ و تاریخ آماده‌ی ثبت است.')}</p>
            </div>
            <Switch checked={settings.auto && permission === 'granted'} onChange={handleAuto} label={t('خواندن خودکار پیامک')} />
          </div>

          <SmsBankSettings settings={settings} />

          <SmsRecordSettings key={settings.autoRecordMax} settings={settings} />
          <SmsIncomeRecordSettings key={`income-${settings.autoRecordIncomeMax}`} settings={settings} />

          {permission === 'denied' && (
            <AlertBanner type="warning" message={t('اجازه‌ی خواندن پیامک داده نشده است. از تنظیمات گوشی (برنامه‌ها ← RealRate ← مجوزها ← پیامک) آن را بدهید.')} />
          )}

          <dl className="app-setting-facts">
            <dt>{t('آخرین خواندن')}</dt>
            <dd>{formatTime(settings.lastRead)}</dd>
            <dt>{t('منتظر ثبت')}</dt>
            <dd>
              {t('{n} پیامک', { n: pending.length.toLocaleString(intlLocale()) })}
              {onOpenSms && (
                <Button size="sm" variant="secondary" iconRight={<ArrowLeft size={14} />} onClick={onOpenSms}>
                  {t('پیامک‌های بانکی')}
                </Button>
              )}
            </dd>
          </dl>
        </Card>
      )}

      {smsEnabled() && <SmsRecordsCleanup vaultUnlocked={vaultUnlocked} />}

      <DueNotificationSettings />

      {hasWidget ? <WidgetSettings /> : (
        <ProLockedCard title={t('ویجت')} text={t('ویجت صفحه‌ی اصلی گوشی در پلن رایگان بسته است؛ با Pro قیمت‌ها، خبر و تحلیل را روی صفحه‌ی گوشی ببینید.')} />
      )}

      <Card
        className="app-settings-card"
        padding="lg"
        icon={<Fingerprint size={18} />}
        title={t('اثر انگشت')}
        subtitle={t('یک بار با رمز عبور رمزنگاری باز کنید؛ از آن به بعد اثر انگشت کافی است. کلید روی همین گوشی و در بخش امن اندروید نگه داشته می‌شود.')}
      >
        {!bio.available ? (
          <AlertBanner type="info" message={t('اثر انگشت یا تشخیص چهره روی این گوشی فعال نیست (از تنظیمات گوشی اضافه کنید).')} />
        ) : (
          <>
            <div className="app-setting-row">
              <div>
                <strong>{t('باز کردن با اثر انگشت')}</strong>
                <p>{bio.enabled ? t('فعال است.') : t('غیرفعال')}</p>
              </div>
              <Switch
                checked={bio.enabled}
                onChange={handleBiometric}
                disabled={bio.busy || (!bio.enabled && !vaultUnlocked)}
                label={t('باز کردن با اثر انگشت')}
              />
            </div>
            {!bio.enabled && !vaultUnlocked && (
              <AlertBanner type="info" message={t('برای فعال کردن، ابتدا اطلاعات رمزنگاری‌شده را با رمز عبور باز کنید.')} />
            )}
          </>
        )}
      </Card>

      <Card className="app-settings-card" padding="lg" icon={<Languages size={18} />} title={t('زبان')}>
        <LanguageSwitch />
      </Card>

      <Card className="app-settings-card" padding="lg" icon={<Info size={18} />} title={t('درباره اپ')}>
        {selfUpdateEnabled() && <AppUpdateSettings />}
        <dl className="app-setting-facts">
          <dt>{t('نسخه')}</dt>
          <dd dir="ltr">{version || '—'}</dd>
          <dt>{t('حریم خصوصی')}</dt>
          <dd dir="ltr"><a href={getLocale() === 'en' ? 'https://realrate.geekio.org/en/privacy' : 'https://realrate.geekio.org/privacy'} target="_blank" rel="noopener noreferrer">{getLocale() === 'en' ? 'realrate.geekio.org/en/privacy' : 'realrate.geekio.org/privacy'}</a></dd>
          {packageId && (
            <>
              <dt>{t('نام پکیج')}</dt>
              <dd dir="ltr">{packageId}</dd>
            </>
          )}
        </dl>
        {/* The store build has no SMS permission: point to the full build for the rest */}
        {!smsEnabled() && (
          <>
            <AlertBanner
              type="info"
              message={t('این نسخه بدون پیامک است. برای داشتن ویژگی‌های بیشتر (مثل خواندن خودکار پیامک بانک) نسخه‌ی گیت‌هاب را نصب کنید.')}
            />
            <dl className="app-setting-facts">
              <dt>{t('پروژه در گیت‌هاب')}</dt>
              <dd dir="ltr"><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">github.com/nos486/realrate</a></dd>
              <dt>{t('دانلود آخرین نسخه')}</dt>
              <dd dir="ltr"><a href={`${GITHUB_URL}/releases/latest`} target="_blank" rel="noopener noreferrer">github.com/nos486/realrate/releases/latest</a></dd>
            </dl>
          </>
        )}
      </Card>
    </div>
  );
}
