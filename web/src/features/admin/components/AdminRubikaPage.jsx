/**
 * AdminRubikaPage.jsx — The Rubika bot in the admin panel (ربات روبیکا), built like the Telegram
 * bot's page (AdminBotPage.jsx):
 *  - the connection: token (never shown back, only whether one is set), channel, and the on/off switch
 *  - «تست اتصال»: checks the token and the channel step by step and posts a test message
 *  - the admin's account: Rubika's updates carry no username, so the panel makes a one-time code
 *    the admin sends to the bot; then requests (joining the pro group) reach them with buttons,
 *    they manage users with commands, and get an optional daily report
 *  - which international feeds are posted, and the last run (shared cards, BotPanelCards.jsx)
 */

import { intlLocale } from '../../../utils/i18n.js';
import React, { useEffect, useState } from 'react';
import { MessageCircle, Save, PlugZap, CheckCircle2, AlertTriangle, KeyRound, Link2 } from 'lucide-react';
import { Button, Input, AlertBanner } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getRubikaSettings, saveRubikaSettings, testRubika, runRubikaNow, newRubikaLinkCode } from '../api/adminApi.js';
import { BotFeedsCard, BotStatusCard } from './BotPanelCards.jsx';

const fa = (n) => Number(n || 0).toLocaleString(intlLocale());
const SOURCES = { env: 'متغیر محیطی (RUBIKA_BOT_TOKEN)', admin: 'ذخیره‌شده از همین صفحه' };

export default function AdminRubikaPage() {
  const { toast } = useFeedback();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [channel, setChannel] = useState('');
  const [token, setToken] = useState('');
  const [dailyReport, setDailyReport] = useState(false);
  const [allFeeds, setAllFeeds] = useState(true);
  const [feedIds, setFeedIds] = useState([]);
  const [busy, setBusy] = useState(null);
  const [check, setCheck] = useState(null);

  const apply = (res) => {
    setData(res);
    setEnabled(res.config.enabled);
    setChannel(res.config.channel);
    setDailyReport(res.config.dailyReport === true);
    setAllFeeds(!res.config.feeds);
    setFeedIds(res.config.feeds || res.feeds.map((f) => f.id));
    setToken('');
  };

  useEffect(() => {
    getRubikaSettings().then(apply).catch((err) => setError(err?.message || 'خوانده نشد.'));
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
    || dailyReport !== (config.dailyReport === true)
    || token.trim() !== ''
    || allFeeds !== !savedFeeds
    || (!allFeeds && JSON.stringify([...feedIds].sort()) !== JSON.stringify([...(savedFeeds || [])].sort()))
  );

  const save = guard('save', async () => {
    const res = await saveRubikaSettings({
      enabled,
      channel: channel.trim(),
      dailyReport,
      feeds: allFeeds ? null : feedIds,
      ...(token.trim() ? { token: token.trim() } : {}),
    });
    apply(res);
    setCheck(null);
    if (res.webhook && !res.webhook.ok) toast.warning(`تنظیمات ذخیره شد، ولی اتصال روبیکا به سرور برقرار نشد: ${res.webhook.error}`);
    else toast.success('تنظیمات ربات روبیکا ذخیره شد.');
  });

  const test = guard('test', async () => {
    const res = await testRubika();
    setCheck(res);
    if (res.ok) toast.success('اتصال برقرار است و پیام آزمایشی در کانال فرستاده شد.');
    else toast.error(res.error);
  });

  const run = guard('run', async () => {
    const res = await runRubikaNow();
    setData((d) => ({ ...d, status: res.status, config: res.config }));
    if (res.result?.skipped) toast.warning('ربات روبیکا خاموش است.');
    else toast.success(`${fa(res.result?.sent)} خبر فرستاده شد، ${fa(res.result?.waiting)} در صف.`);
  });

  const makeCode = guard('link', async () => {
    const res = await newRubikaLinkCode();
    setData((d) => ({ ...d, config: res.config }));
  });

  const unlink = guard('unlink', async () => {
    const res = await saveRubikaSettings({ unlinkAdmin: true });
    setData((d) => ({ ...d, config: res.config }));
    toast.success('اتصال حساب ادمین برداشته شد.');
  });

  if (error && !data) return <AlertBanner type="error" message={error} />;
  if (!data) return <div className="require-auth-loading"><div className="spinner-glow" /></div>;

  return (
    <div className="admin-news">
      <div className="portfolio-stat-card">
        <div className="stat-header">
          <span className="stat-label"><MessageCircle size={14} /> ربات روبیکا</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="فعال بودن ربات روبیکا"
            className={`admin-switch ${enabled ? 'is-on' : ''}`}
            onClick={() => setEnabled(!enabled)}
          >
            <span className="admin-switch-thumb" />
          </button>
        </div>
        <p className="admin-card-hint">
          ربات روبیکا همان خبرهای بین‌المللی (RSS) را که سایت منتشر می‌کند، یک بار در کانال روبیکا می‌گذارد: تیتر پررنگ، خلاصه‌ی فارسی سایت و لینک خبر اصلی.
          صف آن جدا از تلگرام است؛ خطای یکی دیگری را متوقف نمی‌کند. ربات باید در کانال ادمین باشد و اجازه‌ی ارسال پیام داشته باشد.
        </p>

        <Input
          id="adminRubikaToken"
          type="password"
          label="توکن ربات روبیکا (از BotFather روبیکا)"
          placeholder={config.tokenSet ? 'ذخیره شده است؛ برای تغییر، توکن تازه را وارد کنید' : 'توکن ربات'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          dir="ltr"
        />
        <small className="admin-news-muted">
          <KeyRound size={12} />{' '}
          {config.tokenSet ? `توکن تنظیم است: ${SOURCES[config.tokenSource]}` : 'توکن تنظیم نشده است.'}
          {config.tokenSet && config.tokenSource === 'admin' && (
            <>{' '}<button type="button" className="admin-bot-link" onClick={guard('remove', async () => { apply(await saveRubikaSettings({ token: null, enabled: false })); toast.success('توکن پاک شد.'); })}>پاک کردن</button></>
          )}
        </small>

        <Input
          id="adminRubikaChannel"
          label="کانال روبیکا"
          placeholder="@mychannel یا c0…"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          dir="ltr"
        />
        <small className="admin-news-muted">
          نام کانال (@mychannel) یا شناسه‌ی آن (با c0 شروع می‌شود). اگر کانال با نام پیدا نشد: بعد از اتصال حساب ادمین (پایین)، یک پست کانال را برای ربات فوروارد کنید تا شناسه‌اش خودکار ذخیره شود.
        </small>

        <label className="admin-bot-row">
          <input type="checkbox" checked={dailyReport} onChange={(e) => setDailyReport(e.target.checked)} />
          <span>گزارش روزانه‌ی کاربران هر شب ساعت ۲۱ در روبیکای ادمین</span>
        </label>

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
              {check.ok ? `متصل است: ربات ${check.bot.username ? `@${check.bot.username}` : check.bot.name} در «${check.chat.title}»` : check.error}
              {check.bot?.username && !check.ok && <small> ربات شناخته‌شده: @{check.bot.username}</small>}
            </span>
          </p>
        )}
      </div>

      <div className="portfolio-stat-card">
        <div className="stat-header">
          <span className="stat-label"><Link2 size={14} /> حساب روبیکای ادمین</span>
        </div>
        {config.adminLinked ? (
          <small className="admin-news-muted">
            <CheckCircle2 size={12} className="is-ok" /> متصل است؛ درخواست‌ها و گزارش‌ها به همین حساب می‌رسد.{' '}
            <button type="button" className="admin-bot-link" onClick={unlink}>قطع اتصال</button>
          </small>
        ) : (
          <small className="admin-news-muted">
            <AlertTriangle size={12} className="is-warn" /> هنوز حسابی متصل نیست.
          </small>
        )}
        {config.linkCode ? (
          <p className="admin-card-hint">
            این کد را با حساب خودتان در روبیکا برای ربات بفرستید (تا ۳۰ دقیقه معتبر است؛ ربات باید روشن و ذخیره‌شده باشد):{' '}
            <strong><bdi dir="ltr">{config.linkCode}</bdi></strong>
          </p>
        ) : (
          <p className="admin-card-hint">
            برای اتصال، کد بسازید و آن را در روبیکا برای ربات بفرستید. بعد از اتصال، درخواست کاربران (مثل درخواست پرو) با دکمه‌های تأیید و رد به شما می‌رسد
            و می‌توانید دستور بدهید: <bdi dir="ltr">/report</bdi>، <bdi dir="ltr">/users</bdi>، <bdi dir="ltr">/user</bdi>، <bdi dir="ltr">/requests</bdi>، <bdi dir="ltr">/help</bdi>.
          </p>
        )}
        <div className="admin-news-save">
          <Button size="sm" variant="secondary" icon={<Link2 size={14} />} loading={busy === 'link'} disabled={Boolean(busy) || !config.tokenSet} onClick={makeCode}>
            {config.linkCode ? 'کد تازه' : 'ساخت کد اتصال'}
          </Button>
        </div>
      </div>

      <BotFeedsCard feeds={data.feeds} allFeeds={allFeeds} onAllFeeds={setAllFeeds} feedIds={feedIds} onFeedIds={setFeedIds} />
      <BotStatusCard status={data.status} messenger="روبیکا" busy={busy === 'run'} disabled={Boolean(busy)} onRun={run} />
    </div>
  );
}
