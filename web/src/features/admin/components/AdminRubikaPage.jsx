/**
 * AdminRubikaPage.jsx — The Rubika bot in the admin panel (/admin/rubika, ربات روبیکا), laid out
 * like every messenger's page (BotPanelCards.jsx):
 *  - the connection: token, channel and the on/off switch; «تست اتصال» checks the token and the
 *    channel step by step and posts a test message
 *  - the admin's account: Rubika's updates carry no username, so the panel makes a one-time code
 *    the admin sends to the bot; then requests (joining the pro group) reach them with buttons,
 *    they manage users with commands, and get an optional daily report
 *  - which international feeds are posted, and the last run with «ارسال الان»
 */

import React from 'react';
import { MessageCircle, CheckCircle2, AlertTriangle, Link2 } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getRubikaSettings, saveRubikaSettings, testRubika, runRubikaNow, newRubikaLinkCode } from '../api/adminApi.js';
import { useBotSettings } from '../hooks/useBotSettings.js';
import { AdminCard } from './AdminPage.jsx';
import { BotPage } from './BotPanelCards.jsx';

const RUBIKA = {
  key: 'rubika',
  name: 'روبیکا',
  icon: MessageCircle,
  intro: 'ربات روبیکا همان خبرهای بین‌المللی (RSS) را که سایت منتشر می‌کند، یک بار در کانال روبیکا می‌گذارد: تیتر پررنگ، خلاصه‌ی فارسی سایت و لینک خبر اصلی. صف آن جدا از تلگرام است؛ خطای یکی دیگری را متوقف نمی‌کند. ربات باید در کانال ادمین باشد و اجازه‌ی ارسال پیام داشته باشد.',
  tokenLabel: 'توکن ربات روبیکا (از BotFather روبیکا)',
  tokenPlaceholder: 'توکن ربات',
  tokenEnv: 'RUBIKA_BOT_TOKEN',
  channelLabel: 'کانال روبیکا',
  channelPlaceholder: '@mychannel یا c0…',
  channelHint: 'نام کانال (@mychannel) یا شناسه‌ی آن (با c0 شروع می‌شود). اگر کانال با نام پیدا نشد: بعد از اتصال حساب ادمین، یک پست کانال را برای ربات فوروارد کنید تا شناسه‌اش خودکار ذخیره شود.',
};

const API = { get: getRubikaSettings, save: saveRubikaSettings, test: testRubika, run: runRubikaNow };

function RubikaAdminCard({ bot }) {
  const { toast } = useFeedback();
  const { config, form, setField, busy, guard, setData } = bot;

  const makeCode = guard('link', async () => {
    const res = await newRubikaLinkCode();
    setData((d) => ({ ...d, config: res.config }));
  });

  const unlink = guard('unlink', async () => {
    const res = await saveRubikaSettings({ unlinkAdmin: true });
    setData((d) => ({ ...d, config: res.config }));
    toast.success('اتصال حساب ادمین برداشته شد.');
  });

  return (
    <AdminCard
      icon={<Link2 size={18} />}
      title="حساب روبیکای ادمین"
      subtitle="درخواست‌های کاربران، دستورهای مدیر و گزارش روزانه"
      actions={
        <Button size="sm" variant="secondary" icon={<Link2 size={14} />} loading={busy === 'link'} disabled={Boolean(busy) || !config.tokenSet || !config.enabled} onClick={makeCode}>
          {config.linkCode ? 'کد تازه' : 'ساخت کد اتصال'}
        </Button>
      }
    >
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
          این کد را با حساب خودتان در روبیکا برای ربات بفرستید (تا ۳۰ دقیقه معتبر است و با ۵ کد اشتباه باطل می‌شود):{' '}
          <strong><bdi dir="ltr">{config.linkCode}</bdi></strong>
        </p>
      ) : (
        <p className="admin-card-hint">
          برای اتصال، کد بسازید و آن را در روبیکا برای ربات بفرستید. بعد از اتصال، درخواست کاربران (مثل درخواست پرو) با دکمه‌های تأیید و رد به شما می‌رسد
          و می‌توانید دستور بدهید: <bdi dir="ltr">/report</bdi>، <bdi dir="ltr">/users</bdi>، <bdi dir="ltr">/user</bdi>، <bdi dir="ltr">/requests</bdi>، <bdi dir="ltr">/help</bdi>.
        </p>
      )}
      {!config.enabled && <small className="admin-news-muted">برای اتصال حساب، اول ربات را روشن و ذخیره کنید (ربات خاموش پیامی نمی‌خواند).</small>}
      <label className="admin-bot-row">
        <input type="checkbox" checked={form.dailyReport} onChange={(e) => setField('dailyReport', e.target.checked)} />
        <span>گزارش روزانه‌ی کاربران هر شب ساعت ۲۱ در روبیکای ادمین</span>
      </label>
    </AdminCard>
  );
}

export default function AdminRubikaPage() {
  const bot = useBotSettings({ api: API, name: RUBIKA.name });
  return <BotPage messenger={RUBIKA} bot={bot} account={bot.data && <RubikaAdminCard bot={bot} />} />;
}
