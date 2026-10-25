/**
 * BotPanelCards.jsx — The cards every messenger's bot page shares (ربات تلگرام, ربات روبیکا):
 *  - BotFeedsCard: which international feeds the bot posts to its channel (all by default)
 *  - BotStatusCard: the last run (what was sent, what waits, the last error) and «ارسال الان»
 */

import { intlLocale } from '../../../utils/i18n.js';
import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '../../../shared/ui/index.js';
import { newsTimeAgo } from '../../news/newsFormat.js';

const fa = (n) => Number(n || 0).toLocaleString(intlLocale());

/**
 * @param {{ feeds: Array<{ id: string, title: string, enabled: boolean }>, allFeeds: boolean,
 *   onAllFeeds: (on: boolean) => void, feedIds: string[], onFeedIds: (ids: string[]) => void }} props
 */
export function BotFeedsCard({ feeds, allFeeds, onAllFeeds, feedIds, onFeedIds }) {
  const toggleFeed = (id) => onFeedIds(feedIds.includes(id) ? feedIds.filter((x) => x !== id) : [...feedIds, id]);
  return (
    <div className="portfolio-stat-card">
      <div className="stat-header">
        <span className="stat-label">خبرگزاری‌هایی که در کانال می‌روند</span>
      </div>
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
    </div>
  );
}

/**
 * @param {{ status: object|null, messenger: string, busy: boolean, disabled: boolean, onRun: () => void }} props
 *   messenger: its name in the error line (تلگرام, روبیکا)
 */
export function BotStatusCard({ status, messenger, busy, disabled, onRun }) {
  return (
    <div className="portfolio-stat-card">
      <div className="stat-header">
        <span className="stat-label">آخرین ارسال</span>
        <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={busy} disabled={disabled} onClick={onRun}>
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
              <span><strong>خطای {messenger}:</strong> <bdi dir="ltr">{status.error}</bdi></span>
            </p>
          )}
        </>
      ) : (
        <p className="admin-card-hint">هنوز اجرایی نبوده است.</p>
      )}
    </div>
  );
}
