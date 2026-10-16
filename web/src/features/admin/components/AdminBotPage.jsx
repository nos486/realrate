/**
 * AdminBotPage.jsx — The Telegram bot in the admin panel (ربات تلگرام):
 *  - the connection: token (never shown back, only whether one is set), channel, and the on/off switch
 *  - «تست اتصال»: checks the token and the channel step by step and posts a test message
 *  - which international feeds are posted to the channel (all by default)
 *  - the last run: what was sent, what waits, the last error; «ارسال الان» posts the waiting news
 * - the admin's Telegram username: the bot tells the admin about users' requests (joining the pro
 *   group) in a private chat with buttons to approve or reject; the admin sends /start to the bot once
 * The bot's features are listed here as they are added (today: the international news the site publishes, in Persian).
 */

import { intlLocale } from '../../../utils/i18n.js';
import React, { useEffect, useState } from 'react';
import { Send, Save, PlugZap, RefreshCw, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { Button, Input, AlertBanner } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getBotSettings, saveBotSettings, testBot, runBotNow } from '../api/adminApi.js';
import { newsTimeAgo } from '../../news/newsFormat.js';

const fa = (n) => Number(n || 0).toLocaleString(intlLocale());
const SOURCES = { env: 'متغیر محیطی (TELEGRAM_BOT_TOKEN)', admin: 'ذخیره‌شده از همین صفحه' };

export default function AdminBotPage() {
  const { toast } = useFeedback();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [channel, setChannel] = useState('');
  const [token, setToken] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [allFeeds, setAllFeeds] = useState(true);
  const [feedIds, setFeedIds] = useState([]);
  const [busy, setBusy] = useState(null);
  const [check, setCheck] = useState(null);

  const apply = (res) => {
    setData(res);
    setEnabled(res.config.enabled);
    setChannel(res.config.channel);
    setAdminUsername(res.config.adminUsername || '');
    setAllFeeds(!res.config.feeds);
    setFeedIds(res.config.feeds || res.feeds.map((f) => f.id));
    setToken('');
  };

  useEffect(() => {
    getBotSettings().then(apply).catch((err) => setError(err?.message || 'خوانده نشد.'));
  }, []);

  const guard = (kind, fn) => async () => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(err?.message || 'انجام نشد.');
    } finally {
      setBusy(null);
    }
  };

  const config = data?.config;
  const savedFeeds = config?.feeds || null;
  const dirty = Boolean(data) && (
    enabled !== config.enabled
    || channel.trim() !== config.channel
    || adminUsername.trim().replace(/^@/, '') !== (config.adminUsername || '')
    || token.trim() !== ''
    || allFeeds !== !savedFeeds
    || (!allFeeds && JSON.stringify([...feedIds].sort()) !== JSON.stringify([...(savedFeeds || [])].sort()))
  );

  const save = guard('save', async () => {
    const res = await saveBotSettings({
      enabled,
      channel: channel.trim(),
      adminUsername: adminUsername.trim(),
      feeds: allFeeds ? null : feedIds,
      ...(token.trim() ? { token: token.trim() } : {}),
    });
    apply(res);
    setCheck(null);
    if (res.webhook && !res.webhook.ok) toast.warning(`تنظیمات ذخیره شد، ولی اتصال تلگرام به سرور برقرار نشد: ${res.webhook.error}`);
    else toast.success('تنظیمات ربات ذخیره شد.');
  });

  const test = guard('test', async () => {
    const res = await testBot();
    setCheck(res);
    if (res.ok) toast.success('اتصال برقرار است و پیام آزمایشی در کانال فرستاده شد.');
    else toast.error(res.error);
  });

  const run = guard('run', async () => {
    const res = await runBotNow();
    setData((d) => ({ ...d, status: res.status, config: res.config }));
    if (res.result?.skipped) toast.warning('ربات خاموش است.');
    else toast.success(`${fa(res.result?.sent)} خبر فرستاده شد، ${fa(res.result?.waiting)} در صف.`);
  });

  if (error && !data) return <AlertBanner type="error" message={error} />;
  if (!data) return <div className="require-auth-loading"><div className="spinner-glow" /></div>;

  const status = data.status;
  const toggleFeed = (id) => setFeedIds(feedIds.includes(id) ? feedIds.filter((x) => x !== id) : [...feedIds, id]);

  return (
    <div className="admin-news">
      <div className="portfolio-stat-card">
        <div className="stat-header">
          <span className="stat-label"><Send size={14} /> ربات تلگرام</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="فعال بودن ربات"
            className={`admin-switch ${enabled ? 'is-on' : ''}`}
            onClick={() => setEnabled(!enabled)}
          >
            <span className="admin-switch-thumb" />
          </button>
        </div>
        <p className="admin-card-hint">
          ربات هر خبر بین‌المللی (RSS) را که سایت منتشر می‌کند، یک بار در کانال می‌گذارد: همان تیتر و خلاصه‌ی فارسی سایت
          (یک بار با هوش مصنوعی ترجمه می‌شود) و لینک خبر اصلی. خبرهای غیربازاری و تکراری که سایت منتشر نمی‌کند در کانال هم نمی‌روند. ربات باید در کانال ادمین باشد و اجازه‌ی ارسال پیام داشته باشد.
        </p>

        <Input
          id="adminBotToken"
          type="password"
          label="توکن ربات (از BotFather)"
          placeholder={config.tokenSet ? 'ذخیره شده است؛ برای تغییر، توکن تازه را وارد کنید' : '123456789:ABC…'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          dir="ltr"
        />
        <small className="admin-news-muted">
          <KeyRound size={12} />{' '}
          {config.tokenSet ? `توکن تنظیم است: ${SOURCES[config.tokenSource]}` : 'توکن تنظیم نشده است.'}
          {config.tokenSet && config.tokenSource === 'admin' && (
            <>{' '}<button type="button" className="admin-bot-link" onClick={guard('remove', async () => { apply(await saveBotSettings({ token: null, enabled: false })); toast.success('توکن پاک شد.'); })}>پاک کردن</button></>
          )}
        </small>

        <Input
          id="adminBotChannel"
          label="کانال"
          placeholder="@mychannel"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          dir="ltr"
        />

        <Input
          id="adminBotAdmin"
          label="یوزرنیم تلگرام ادمین (برای دریافت درخواست‌ها)"
          placeholder="@myname"
          value={adminUsername}
          onChange={(e) => setAdminUsername(e.target.value)}
          dir="ltr"
        />
        <small className="admin-news-muted">
          {!config.adminUsername ? 'اگر وارد شود، ربات درخواست کاربران (مثل درخواست پرو) را در تلگرام به همین حساب می‌فرستد و با دکمه‌های تأیید و رد پاسخ می‌دهید.'
            : config.adminLinked ? <><CheckCircle2 size={12} className="is-ok" /> متصل است؛ درخواست‌ها به @{config.adminUsername} می‌رسد.</>
              : <><AlertTriangle size={12} className="is-warn" /> هنوز متصل نیست: با حساب @{config.adminUsername} در تلگرام ربات را باز کنید و /start بزنید (ربات باید روشن و ذخیره‌شده باشد).</>}
        </small>

        <div className="admin-news-save">
          <Button size="sm" icon={<Save size={14} />} loading={busy === 'save'} disabled={!dirty || Boolean(busy)} onClick={save}>
            ذخیره
          </Button>
          <Button size="sm" variant="secondary" icon={<PlugZap size={14} />} loading={busy === 'test'} disabled={Boolean(busy) || dirty || !config.tokenSet || !config.channel} onClick={test}>
            تست اتصال
          </Button>
        </div>
        {dirty && <small className="admin-news-muted">برای تست اتصال، اول ذخیره کنید.</small>}
        {check && (
          <p className={check.ok ? 'admin-news-ai is-ok' : 'admin-news-error'}>
            {check.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
            <span>
              {check.ok ? `متصل است: ربات @${check.bot.username} در «${check.chat.title}»` : check.error}
              {check.bot?.username && !check.ok && <small> ربات شناخته‌شده: @{check.bot.username}</small>}
            </span>
          </p>
        )}
      </div>

      <div className="portfolio-stat-card">
        <div className="stat-header">
          <span className="stat-label">خبرگزاری‌هایی که در کانال می‌روند</span>
        </div>
        <label className="admin-bot-row">
          <input type="checkbox" checked={allFeeds} onChange={(e) => setAllFeeds(e.target.checked)} />
          <span>همه‌ی خبرگزاری‌ها (فهرست صفحه‌ی اخبار)</span>
        </label>
        {!allFeeds && data.feeds.map((f) => (
          <label key={f.id} className="admin-bot-row">
            <input type="checkbox" checked={feedIds.includes(f.id)} onChange={() => toggleFeed(f.id)} />
            <span><bdi>{f.title}</bdi> <small dir="ltr">{f.id}</small>{f.enabled ? '' : ' (در اخبار غیرفعال است)'}</span>
          </label>
        ))}
        <p className="admin-card-hint">خبرگزاری‌ها را در بخش «اخبار» اضافه یا کم کنید. خبری که پیش از روشن شدن ربات آمده باشد فرستاده نمی‌شود.</p>
      </div>

      <div className="portfolio-stat-card">
        <div className="stat-header">
          <span className="stat-label">آخرین ارسال</span>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={busy === 'run'} disabled={Boolean(busy)} onClick={run}>
            ارسال الان
          </Button>
        </div>
        {status ? (
          <>
            <p className="admin-card-hint">
              {status.lastSentAt ? `آخرین خبر ${newsTimeAgo(status.lastSentAt)} فرستاده شد` : 'هنوز خبری فرستاده نشده'}
              {' · '}{fa(status.sentTotal)} خبر در مجموع · {fa(status.waiting)} در صف
            </p>
            {status.error && (
              <p className="admin-news-error">
                <AlertTriangle size={14} aria-hidden="true" />
                <span><strong>خطای تلگرام:</strong> <bdi dir="ltr">{status.error}</bdi></span>
              </p>
            )}
          </>
        ) : (
          <p className="admin-card-hint">هنوز اجرایی نبوده است.</p>
        )}
      </div>
    </div>
  );
}
