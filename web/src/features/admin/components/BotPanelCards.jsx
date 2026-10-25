/**
 * BotPanelCards.jsx — What every messenger's bot page shares (ربات تلگرام, ربات روبیکا), so the two
 * pages are laid out alike (hooks/useBotSettings.js holds their state):
 *  - BotPage: the page itself: «ذخیره» and «تست اتصال» in the header, the connection and the
 *    admin's account on one side, the feeds and the last run on the other
 *  - BotConnectionCard: the on/off switch, token (never shown back, only whether one is set),
 *    channel, and what «تست اتصال» found
 *  - BotFeedsCard: which international feeds the bot posts to its channel (all by default)
 *  - BotStatusCard: the last run (what was sent, what waits, the last error) and «ارسال الان»
 */

import { intlLocale } from '../../../utils/i18n.js';
import React from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, KeyRound, PlugZap, Save, Rss, History } from 'lucide-react';
import { Button, Input } from '../../../shared/ui/index.js';
import { newsTimeAgo } from '../../news/newsFormat.js';
import AdminPage, { AdminCard, AdminSwitch } from './AdminPage.jsx';

const fa = (n) => Number(n || 0).toLocaleString(intlLocale());

/**
 * @typedef {{ key: string, name: string, icon: import('react').ComponentType<any>, intro: string,
 *   tokenLabel: string, tokenPlaceholder: string, tokenEnv: string, channelLabel: string,
 *   channelPlaceholder: string, channelHint?: string }} Messenger
 *   key: its section in adminSections.js and the inputs' ids; name: its name in the texts (تلگرام)
 */

/**
 * @param {{ messenger: Messenger, bot: ReturnType<typeof import('../hooks/useBotSettings.js').useBotSettings>,
 *   account: import('react').ReactNode }} props
 *   account: the card that links the admin's own account to the bot
 */
export function BotPage({ messenger, bot, account }) {
  const { data, config, form, error, load, busy, dirty, save, test, run, setField } = bot;
  return (
    <AdminPage
      section={messenger.key}
      loading={!data}
      error={data ? '' : error}
      onRetry={load}
      actions={data && (
        <>
          <Button variant="secondary" icon={<PlugZap size={16} />} loading={busy === 'test'} disabled={Boolean(busy) || dirty || !config.tokenSet || !config.channel} onClick={test}>
            تست اتصال
          </Button>
          <Button icon={<Save size={16} />} loading={busy === 'save'} disabled={!dirty || Boolean(busy)} onClick={save}>
            ذخیره
          </Button>
        </>
      )}
    >
      {data && (
        <>
          {dirty && <p className="admin-unsaved" role="status">تغییرات ذخیره نشده‌اند؛ برای تست اتصال، اول ذخیره کنید.</p>}
          <div className="admin-columns">
            <div className="admin-stack">
              <BotConnectionCard messenger={messenger} bot={bot} />
              {account}
            </div>
            <div className="admin-stack">
              <BotFeedsCard
                feeds={data.feeds}
                allFeeds={form.allFeeds}
                onAllFeeds={(on) => setField('allFeeds', on)}
                feedIds={form.feedIds}
                onFeedIds={(ids) => setField('feedIds', ids)}
              />
              <BotStatusCard status={data.status} messenger={messenger.name} busy={busy === 'run'} disabled={Boolean(busy)} onRun={run} />
            </div>
          </div>
        </>
      )}
    </AdminPage>
  );
}

/** @param {{ messenger: Messenger, bot: object }} props */
export function BotConnectionCard({ messenger, bot }) {
  const { config, form, setField, check, removeToken } = bot;
  const Icon = messenger.icon;
  const sources = { env: `متغیر محیطی (${messenger.tokenEnv})`, admin: 'ذخیره‌شده از همین صفحه' };
  return (
    <AdminCard
      icon={<Icon size={18} />}
      title="اتصال و کانال"
      actions={<AdminSwitch checked={form.enabled} label={`فعال بودن ربات ${messenger.name}`} onChange={(on) => setField('enabled', on)} />}
    >
      <p className="admin-card-hint">{messenger.intro}</p>

      <Input
        id={`admin-${messenger.key}-token`}
        type="password"
        label={messenger.tokenLabel}
        placeholder={config.tokenSet ? 'ذخیره شده است؛ برای تغییر، توکن تازه را وارد کنید' : messenger.tokenPlaceholder}
        value={form.token}
        onChange={(e) => setField('token', e.target.value)}
        autoComplete="off"
        dir="ltr"
      />
      <small className="admin-news-muted">
        <KeyRound size={12} />{' '}
        {config.tokenSet ? `توکن تنظیم است: ${sources[config.tokenSource] || ''}` : 'توکن تنظیم نشده است.'}
        {config.tokenSet && config.tokenSource === 'admin' && (
          <>{' '}<button type="button" className="admin-bot-link" onClick={removeToken}>پاک کردن</button></>
        )}
      </small>

      <Input
        id={`admin-${messenger.key}-channel`}
        label={messenger.channelLabel}
        placeholder={messenger.channelPlaceholder}
        value={form.channel}
        onChange={(e) => setField('channel', e.target.value)}
        dir="ltr"
      />
      {messenger.channelHint && <small className="admin-news-muted">{messenger.channelHint}</small>}

      {check && (
        <p className={check.ok ? 'admin-news-ai is-ok' : 'admin-news-error'}>
          {check.ok ? <CheckCircle2 size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
          <span>
            {check.ok ? `متصل است: ربات ${check.bot.username ? `@${check.bot.username}` : check.bot.name} در «${check.chat.title}»` : check.error}
            {check.bot?.username && !check.ok && <small> ربات شناخته‌شده: @{check.bot.username}</small>}
          </span>
        </p>
      )}
    </AdminCard>
  );
}

/**
 * @param {{ feeds: Array<{ id: string, title: string, enabled: boolean }>, allFeeds: boolean,
 *   onAllFeeds: (on: boolean) => void, feedIds: string[], onFeedIds: (ids: string[]) => void }} props
 */
export function BotFeedsCard({ feeds, allFeeds, onAllFeeds, feedIds, onFeedIds }) {
  const toggleFeed = (id) => onFeedIds(feedIds.includes(id) ? feedIds.filter((x) => x !== id) : [...feedIds, id]);
  return (
    <AdminCard icon={<Rss size={18} />} title="خبرگزاری‌های کانال" subtitle="کدام خبرها در کانال فرستاده شوند">
      <label className="admin-bot-row">
        <input type="checkbox" checked={allFeeds} onChange={(e) => onAllFeeds(e.target.checked)} />
        <span>همه‌ی خبرگزاری‌ها (فهرست صفحه‌ی اخبار)</span>
      </label>
      {!allFeeds && feeds.map((f) => (
        <label key={f.id} className="admin-bot-row">
          <input type="checkbox" checked={feedIds.includes(f.id)} onChange={() => toggleFeed(f.id)} />
          <span><bdi>{f.title}</bdi> <small dir="ltr">{f.id}</small>{f.enabled ? '' : ' (در اخبار غیرفعال است)'}</span>
        </label>
      ))}
      <p className="admin-card-hint">خبرگزاری‌ها را در بخش «اخبار» اضافه یا کم کنید. خبری که پیش از روشن شدن ربات آمده باشد فرستاده نمی‌شود.</p>
    </AdminCard>
  );
}

/**
 * @param {{ status: object|null, messenger: string, busy: boolean, disabled: boolean, onRun: () => void }} props
 *   messenger: its name in the error line (تلگرام, روبیکا)
 */
export function BotStatusCard({ status, messenger, busy, disabled, onRun }) {
  return (
    <AdminCard
      icon={<History size={18} />}
      title="آخرین ارسال"
      actions={
        <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={busy} disabled={disabled} onClick={onRun}>
          ارسال الان
        </Button>
      }
    >
      {status ? (
        <>
          <p className="admin-card-hint">
            {status.lastSentAt ? `آخرین خبر ${newsTimeAgo(status.lastSentAt)} فرستاده شد` : 'هنوز خبری فرستاده نشده'}
            {' · '}{fa(status.sentTotal)} خبر در مجموع · {fa(status.waiting)} در صف
          </p>
          {status.error && (
            <p className="admin-news-error">
              <AlertTriangle size={14} aria-hidden="true" />
              <span><strong>خطای {messenger}:</strong> <bdi dir="ltr">{status.error}</bdi></span>
            </p>
          )}
        </>
      ) : (
        <p className="admin-card-hint">هنوز اجرایی نبوده است.</p>
      )}
    </AdminCard>
  );
}
