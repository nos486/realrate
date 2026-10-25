/**
 * AdminBotPage.jsx — The Telegram bot in the admin panel (/admin/bot, ربات تلگرام), laid out like
 * every messenger's page (BotPanelCards.jsx):
 *  - the connection: token, channel and the on/off switch; «تست اتصال» checks the token and the
 *    channel step by step and posts a test message
 *  - the admin's Telegram username: the bot tells the admin about users' requests (joining the pro
 *    group) in a private chat with buttons to approve or reject; the admin sends /start to the bot once,
 *    then manages users there with commands (report, users, user, requests) and gets an optional daily report
 *  - which international feeds are posted to the channel, and the last run with «ارسال الان»
 */

import React from 'react';
import { Send, CheckCircle2, AlertTriangle, UserCheck } from 'lucide-react';
import { Input } from '../../../shared/ui/index.js';
import { getBotSettings, saveBotSettings, testBot, runBotNow } from '../api/adminApi.js';
import { useBotSettings } from '../hooks/useBotSettings.js';
import { AdminCard } from './AdminPage.jsx';
import { BotPage } from './BotPanelCards.jsx';

const TELEGRAM = {
  key: 'bot',
  name: 'تلگرام',
  icon: Send,
  intro: 'ربات هر خبر بین‌المللی (RSS) را که سایت منتشر می‌کند، یک بار در کانال می‌گذارد: همان تیتر و خلاصه‌ی فارسی سایت (یک بار با هوش مصنوعی ترجمه می‌شود) و لینک خبر اصلی. خبرهای غیربازاری و تکراری که سایت منتشر نمی‌کند در کانال هم نمی‌روند. ربات باید در کانال ادمین باشد و اجازه‌ی ارسال پیام داشته باشد.',
  tokenLabel: 'توکن ربات (از BotFather)',
  tokenPlaceholder: '123456789:ABC…',
  tokenEnv: 'TELEGRAM_BOT_TOKEN',
  channelLabel: 'کانال',
  channelPlaceholder: '@mychannel',
};

/** The admin's username: a field of its own on top of every bot's form */
const ADMIN_USERNAME = {
  fromConfig: (config) => ({ adminUsername: config.adminUsername || '' }),
  isDirty: (form, config) => form.adminUsername.trim().replace(/^@/, '') !== (config.adminUsername || ''),
  toPayload: (form) => ({ adminUsername: form.adminUsername.trim() }),
};

const API = { get: getBotSettings, save: saveBotSettings, test: testBot, run: runBotNow };

function TelegramAdminCard({ bot }) {
  const { config, form, setField } = bot;
  return (
    <AdminCard icon={<UserCheck size={18} />} title="حساب تلگرام ادمین" subtitle="درخواست‌های کاربران، دستورهای مدیر و گزارش روزانه">
      <Input
        id="adminBotAdmin"
        label="یوزرنیم تلگرام ادمین (برای دریافت درخواست‌ها)"
        placeholder="@myname"
        value={form.adminUsername}
        onChange={(e) => setField('adminUsername', e.target.value)}
        dir="ltr"
      />
      <small className="admin-news-muted">
        {!config.adminUsername ? 'اگر وارد شود، ربات درخواست کاربران (مثل درخواست پرو) را در تلگرام به همین حساب می‌فرستد و با دکمه‌های تأیید و رد پاسخ می‌دهید.'
          : config.adminLinked ? <><CheckCircle2 size={12} className="is-ok" /> متصل است؛ درخواست‌ها به @{config.adminUsername} می‌رسد.</>
            : <><AlertTriangle size={12} className="is-warn" /> هنوز متصل نیست: با حساب @{config.adminUsername} در تلگرام ربات را باز کنید و /start بزنید (ربات باید روشن و ذخیره‌شده باشد).</>}
      </small>
      <label className="admin-bot-row">
        <input type="checkbox" checked={form.dailyReport} onChange={(e) => setField('dailyReport', e.target.checked)} />
        <span>گزارش روزانه‌ی کاربران هر شب ساعت ۲۱ در تلگرام ادمین</span>
      </label>
      <p className="admin-card-hint">
        مدیر با حساب متصل می‌تواند در ربات دستور بدهد: <bdi dir="ltr">/report</bdi> گزارش کاربران و رشد، <bdi dir="ltr">/users</bdi> جست‌وجو و فهرست کاربران،
        <bdi dir="ltr"> /user</bdi> کارت کاربر با دکمه‌های مسدود کردن، خروج از دستگاه‌ها و گروه‌ها، <bdi dir="ltr">/requests</bdi> درخواست‌های در انتظار.
      </p>
    </AdminCard>
  );
}

export default function AdminBotPage() {
  const bot = useBotSettings({ api: API, name: TELEGRAM.name, extra: ADMIN_USERNAME });
  return <BotPage messenger={TELEGRAM} bot={bot} account={bot.data && <TelegramAdminCard bot={bot} />} />;
}
