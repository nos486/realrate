/**
 * NewsPage.jsx — «اخبار»: market news picked from Telegram news channels
 *
 * Only what can move the dollar, gold, coins, metals, the stock index or the economy is published
 * (the server picks and summarizes it with AI, api/src/services/news/news.service.js).
 *
 *   ┌──────────────────────────────┬──────────────────────┐
 *   │ main prices (live, change)   │ تحلیل روز (AI)       │   large screens: two columns; the
 *   │ filters · live status        │ امروز در یک نگاه     │   side panel on the left (sticky,
 *   │ list, by day · pages         │ مهم‌ترین‌های امروز    │   scrolls on its own)
 *   └──────────────────────────────┴──────────────────────┘
 * On a phone: the main prices, the analysis (compact) and today's top three, then the list. Each item shows
 * its headline, summary, source and time; a tap opens the post's full text and its link on
 * Telegram. The list comes in pages, grouped by day; new news comes in by itself every minute.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Newspaper, ExternalLink, Share2, EyeOff, ChevronDown, Sparkles, Flame, Bell, BellOff, BarChart3 } from 'lucide-react';
import { FeaturePageHeader, FilterPills, EmptyState, AlertBanner, Pagination } from '../../shared/ui/index.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useAuth } from '../auth/index.js';
import { useNews, useNewsToday } from './useNews.js';
import { setNewsHidden } from './newsApi.js';
import NewsAnalysisCard from './NewsAnalysisCard.jsx';
import { usePricing } from '../market/context/PricingContext.jsx';
import { priceIdOfNews } from './newsPrice.js';
import { newsAlertsSupported, getNewsAlertsEnabled, setNewsAlertsEnabled } from './newsAlerts.js';
import { NEWS_CATEGORIES, newsTimeAgo, newsFullTime, newsSource, newsClock, newsDayKey, newsDayLabel } from './newsFormat.js';

const PAGE_SIZE = 12;
const FRESH_MS = 30 * 60000;

const FILTERS = [
  { value: 'all', label: 'همه' },
  { value: 'important', label: 'مهم‌ها' },
  ...Object.entries(NEWS_CATEGORIES).map(([value, label]) => ({ value, label })),
];

const fa = (n, digits = 0) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: digits });

/** The live price of what a news item is about, with its change («دلار ۱۰۵٬۰۰۰ ▲ ۰٫۵٪») */
function NewsPriceChip({ item }) {
  const pricing = usePricing();
  const id = priceIdOfNews(item);
  const book = id ? pricing?.priceBook?.items?.[id] : null;
  if (!book || !(Number(book.price) > 0)) return null;
  const change = Number(book.params?.changePercent);
  const hasChange = Number.isFinite(change) && Math.abs(change) >= 0.01;
  const usd = book.unit === 'دلار';
  return (
    <span className={`news-price ${hasChange ? (change > 0 ? 'is-up' : 'is-down') : ''}`} title="قیمت لحظه‌ای و تغییر نسبت به جلسه‌ی قبل">
      <span className="news-price-name">{book.name}</span>
      <strong>{fa(book.price, usd ? 2 : 0)}</strong>
      {hasChange && <em>{change > 0 ? '▲' : '▼'} {fa(Math.abs(change), 2)}٪</em>}
    </span>
  );
}

/** The main prices at a glance, live from the price book, with their change */
const STRIP_IDS = ['usd', 'eur', 'gold_18k', 'full_coin', 'ons_gold', 'usdt'];

function MarketStrip({ className = '' }) {
  const pricing = usePricing();
  const items = STRIP_IDS.map((id) => pricing?.priceBook?.items?.[id]).filter((b) => b && Number(b.price) > 0);
  if (!items.length) return null;
  return (
    <div className={`news-market ${className}`} role="list" aria-label="قیمت‌های اصلی">
      {items.map((b) => {
        const change = Number(b.params?.changePercent);
        const hasChange = Number.isFinite(change) && Math.abs(change) >= 0.01;
        const usd = b.unit === 'دلار';
        return (
          <span key={b.id} role="listitem" className={`news-market-item ${hasChange ? (change > 0 ? 'is-up' : 'is-down') : ''}`}>
            <small>{b.name}</small>
            <strong>{fa(b.price, usd ? 2 : 0)}</strong>
            <em>{hasChange ? `${change > 0 ? '▲' : '▼'} ${fa(Math.abs(change), 2)}٪` : '—'}</em>
          </span>
        );
      })}
    </div>
  );
}

/** «امروز در یک نگاه»: today's count, the important ones, and each subject (a tap filters the list) */
function TodayStats({ stats, active, onFilter }) {
  if (!stats?.total) return null;
  const rows = Object.entries(NEWS_CATEGORIES)
    .map(([value, label]) => ({ value, label, count: stats.byCategory?.[value] || 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <section className="news-stats" aria-label="امروز در یک نگاه">
      <h2 className="news-today-head">
        <BarChart3 size={16} aria-hidden="true" />
        امروز در یک نگاه
      </h2>
      <div className="news-stats-totals">
        <button type="button" className={active === 'all' ? 'is-active' : ''} onClick={() => onFilter('all')}>
          <strong>{fa(stats.total)}</strong>
          <small>خبر</small>
        </button>
        <button type="button" className={`is-hot ${active === 'important' ? 'is-active' : ''}`} onClick={() => onFilter('important')}>
          <strong>{fa(stats.important)}</strong>
          <small>مهم</small>
        </button>
      </div>
      <ul className="news-stats-bars">
        {rows.map((r) => (
          <li key={r.value}>
            <button type="button" className={active === r.value ? 'is-active' : ''} onClick={() => onFilter(r.value)} aria-pressed={active === r.value}>
              <span className="news-stats-label">{r.label}</span>
              <span className="news-stats-bar"><i className={`is-${r.value}`} style={{ width: `${Math.max(6, (r.count / max) * 100)}%` }} /></span>
              <span className="news-stats-count">{fa(r.count)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The list's live status: it refreshes itself every minute */
function LiveStatus({ updatedAt }) {
  if (!updatedAt) return null;
  return (
    <span className="news-live" title="خبرهای تازه هر دقیقه خودشان می‌آیند">
      <i aria-hidden="true" />
      به‌روز · {newsClock(updatedAt)}
    </span>
  );
}

/** The page's items under a heading per day («امروز», «دیروز», «یکشنبه ۱۲ مهر») */
function groupByDay(items) {
  const groups = [];
  for (const item of items) {
    const key = newsDayKey(item.publishedAt);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: newsDayLabel(item.publishedAt), items: [item] });
  }
  return groups;
}

/** «اعلان خبرهای مهم»: on or off for this device */
function NewsAlertsToggle() {
  const { toast } = useFeedback();
  const [enabled, setEnabled] = useState(null);
  const [busy, setBusy] = useState(false);
  const supported = newsAlertsSupported();

  useEffect(() => {
    if (supported) getNewsAlertsEnabled().then(setEnabled).catch(() => setEnabled(false));
  }, [supported]);
  if (!supported || enabled === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const next = await setNewsAlertsEnabled(!enabled);
      setEnabled(next);
      toast.success(next ? 'اعلان خبرهای مهم روشن شد.' : 'اعلان خبرهای مهم خاموش شد.');
    } catch (err) {
      toast.error(err?.message || 'تغییر نکرد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={`news-alerts-toggle ${enabled ? 'is-on' : ''}`} onClick={toggle} disabled={busy} aria-pressed={enabled}>
      {enabled ? <Bell size={16} /> : <BellOff size={16} />}
      <span>{enabled ? 'اعلان خبرهای مهم: روشن' : 'اعلان خبرهای مهم'}</span>
    </button>
  );
}

const domId = (id) => `news-${String(id).replace('/', '-')}`;

function NewsItem({ item, open, onToggle, isAdmin, onHide }) {
  const { toast } = useFeedback();
  const showSummary = item.summary && item.summary !== item.title;
  const fresh = Date.now() - item.publishedAt < FRESH_MS;

  const share = async (e) => {
    e.stopPropagation();
    const text = `${item.title}\n\n${item.summary || ''}\n\nمنبع: ${newsSource(item)}\n${item.url}`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success('متن خبر کپی شد.');
      }
    } catch { /* closed by the user */ }
  };

  return (
    <article id={domId(item.id)} className={`news-item ${open ? 'is-open' : ''} ${item.importance >= 3 ? 'is-important' : ''}`}>
      <button type="button" className="news-item-main" onClick={onToggle} aria-expanded={open}>
        <span className="news-item-tags">
          {item.importance >= 3 && <span className="news-tag is-important">مهم</span>}
          <span className={`news-tag is-${item.category}`}>{NEWS_CATEGORIES[item.category] || 'اقتصاد'}</span>
          {fresh && <span className="news-tag is-fresh">تازه</span>}
        </span>
        <h3 className="news-item-title">{item.title}</h3>
        {showSummary && <p className="news-item-summary">{item.summary}</p>}
        <NewsPriceChip item={item} />
        <span className="news-item-meta">
          <span className="news-source-avatar" aria-hidden="true">{newsSource(item).replace(/^@/, '').slice(0, 1)}</span>
          <bdi className="news-item-source">{newsSource(item)}</bdi>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(item.publishedAt).toISOString()} title={newsFullTime(item.publishedAt)}>
            {newsTimeAgo(item.publishedAt)}
          </time>
          <ChevronDown size={16} className="news-item-chevron" aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="news-item-body">
          {item.image && <img className="news-item-image" src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
          {item.text && <p className="news-item-text">{item.text}</p>}
          <div className="news-item-actions">
            <a className="news-action" href={item.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} />
              مشاهده در تلگرام
            </a>
            <button type="button" className="news-action" onClick={share}>
              <Share2 size={15} />
              اشتراک‌گذاری
            </button>
            {isAdmin && (
              <button type="button" className="news-action is-danger" onClick={(e) => { e.stopPropagation(); onHide(item); }}>
                <EyeOff size={15} />
                حذف از اخبار
              </button>
            )}
          </div>
          <p className="news-item-footnote">
            {item.ai && <><Sparkles size={12} aria-hidden="true" /> تیتر و خلاصه با هوش مصنوعی · </>}
            {newsFullTime(item.publishedAt)} · <bdi dir="ltr">@{item.channel}</bdi>
          </p>
        </div>
      )}
    </article>
  );
}

/** «مهم‌ترین‌های امروز»: today's news, most important first */
function TodayTop({ items, loading, onOpen }) {
  if (!loading && !items.length) return null;
  return (
    <section className="news-today" aria-label="مهم‌ترین‌های امروز">
      <h2 className="news-today-head">
        <Flame size={16} aria-hidden="true" />
        مهم‌ترین‌های امروز
      </h2>
      {loading ? (
        <div className="news-today-list">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={52} radius={12} />)}
        </div>
      ) : (
        <ol className="news-today-list">
          {items.map((n, i) => (
            <li key={n.id}>
              <button type="button" className="news-today-row" onClick={() => onOpen(n)}>
                <span className={`news-today-rank ${n.importance >= 3 ? 'is-high' : ''}`}>{(i + 1).toLocaleString('fa-IR')}</span>
                <span className="news-today-text">
                  <strong>{n.title}</strong>
                  <small><bdi>{newsSource(n)}</bdi> · {newsTimeAgo(n.publishedAt)}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { toast } = useFeedback();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const openParam = searchParams.get('open');
  const [openId, setOpenId] = useState(openParam);
  const listRef = useRef(null);

  const query = useMemo(() => ({
    limit: PAGE_SIZE,
    page,
    important: filter === 'important',
    category: filter !== 'all' && filter !== 'important' ? filter : '',
  }), [filter, page]);
  const { items, total, loading, error, updatedAt, removeItem } = useNews(query);
  const today = useNewsToday();

  // Opened from the home card: that item is open and in view
  useEffect(() => {
    if (!openParam || loading) return;
    setOpenId(openParam);
    document.getElementById(domId(openParam))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    // Once, when the list is there
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, loading]);

  const changeFilter = (value) => {
    setFilter(value);
    setPage(1);
  };
  const changePage = (next) => {
    setPage(next);
    listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // An item of today's top: open it in the list when it is on this page, else on Telegram
  const openTop = (item) => {
    if (items.some((n) => n.id === item.id)) {
      setOpenId(item.id);
      document.getElementById(domId(item.id))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  };

  const hide = async (item) => {
    try {
      await setNewsHidden(item.id, true);
      removeItem(item.id);
      toast.success('خبر حذف شد.');
    } catch (err) {
      toast.error(err?.message || 'حذف نشد.');
    }
  };

  return (
    <div className="news-page">
      <FeaturePageHeader
        icon={<Newspaper size={22} />}
        title="اخبار"
        subtitle="خبرهای مهم دلار، طلا، بورس و اقتصاد — هر دقیقه از کانال‌های خبری"
        actions={<NewsAlertsToggle />}
      />

      <div className="news-layout">
        <aside className="news-layout-aside" aria-label="تحلیل و خلاصه‌ی امروز">
          <MarketStrip className="is-phone" />
          <NewsAnalysisCard analysis={today.analysis} compact />
          <TodayStats stats={today.stats} active={filter} onFilter={changeFilter} />
          <TodayTop items={today.top} loading={today.loading} onOpen={openTop} />
        </aside>

        <div className="news-layout-main" ref={listRef}>
          <MarketStrip className="is-wide" />

          <div className="news-toolbar">
            <div className="news-filters">
              <FilterPills options={FILTERS} activeValue={filter} onChange={changeFilter} size="sm" />
            </div>
            <LiveStatus updatedAt={updatedAt} />
          </div>

          {error && !items.length && <AlertBanner type="warning" message={error} />}

          {loading ? (
            <div className="news-list">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={110} radius={16} />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="خبری نیست"
              description={filter === 'all' ? 'به‌زودی خبرهای مهم بازار اینجا می‌آید.' : 'در این دسته فعلاً خبری نیست.'}
            />
          ) : (
            <>
              {groupByDay(items).map((group) => (
                <section key={group.key} className="news-day" aria-label={group.label}>
                  <h2 className="news-day-head">{group.label}</h2>
                  <div className="news-list">
                    {group.items.map((item) => (
                      <NewsItem
                        key={item.id}
                        item={item}
                        open={openId === item.id}
                        onToggle={() => setOpenId((id) => (id === item.id ? null : item.id))}
                        isAdmin={isAdmin}
                        onHide={hide}
                      />
                    ))}
                  </div>
                </section>
              ))}
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={changePage} label="صفحه‌های اخبار" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
