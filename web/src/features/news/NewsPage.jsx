/**
 * NewsPage.jsx — «اخبار»: market news picked from Telegram news channels
 *
 * Only what can move the dollar, gold, coins, metals, the stock index or the economy is published
 * (the server picks and summarizes it with AI, api/src/services/news/news.service.js).
 *
 *   ┌──────────────┬──────────────────────────┬────────────────────────┐
 *   │ مهم‌ترین‌های   │ filters · list · pages   │ تحلیل روز (AI)         │   wide screens: three columns;
 *   │ امروز / هفته  │                          │ (stays in place)       │
 *   └──────────────┴──────────────────────────┴────────────────────────┘
 * The topics are a bar of their own above the columns. A medium screen: the top news above the
 * list, the analysis beside them (in place). A phone: the analysis, then the list (no top lists).
 * The analysis stays in place while the list scrolls; the top news scroll with it. Each item shows its headline, summary,
 * source and time; a tap opens the post's full text and image (no link out to Telegram: the news is
 * read here). An item of the top lists or of the analysis that isn't on the list's page opens in a
 * window of its own. The list comes in pages; new news comes in by itself every minute.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Newspaper, Share2, EyeOff, ChevronDown, Sparkles, Flame, CalendarDays, Bell, BellOff } from 'lucide-react';
import { FeaturePageHeader, FilterPills, EmptyState, AlertBanner, Pagination, Modal } from '../../shared/ui/index.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useAuth } from '../auth/index.js';
import { useNews, useNewsToday } from './useNews.js';
import { setNewsHidden } from './newsApi.js';
import NewsAnalysisCard from './NewsAnalysisCard.jsx';
import { newsAlertsSupported, getNewsAlertsEnabled, setNewsAlertsEnabled } from './newsAlerts.js';
import { NEWS_CATEGORIES, newsTimeAgo, newsFullTime, newsSource } from './newsFormat.js';

const PAGE_SIZE = 12;
const FRESH_MS = 30 * 60000;

const FILTERS = [
  { value: 'all', label: 'همه' },
  { value: 'important', label: 'مهم‌ها' },
  ...Object.entries(NEWS_CATEGORIES).map(([value, label]) => ({ value, label })),
];

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
    // The link is to the item here, not to its post on Telegram
    const link = `${window.location.origin}/news?open=${encodeURIComponent(item.id)}`;
    const text = `${item.title}\n\n${item.summary || ''}\n\n${link}`;
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

/** A list of the most important news (today's, the week's), most important first */
function TopList({ title, Icon, items, loading, onOpen }) {
  if (!loading && !items.length) return null;
  return (
    <section className="news-today" aria-label={title}>
      <h2 className="news-today-head">
        <Icon size={16} aria-hidden="true" />
        {title}
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
  const { items, total, loading, error, removeItem } = useNews(query);
  const today = useNewsToday();

  // Opened from the home card: that item is open and in view
  useEffect(() => {
    if (!openParam || loading || today.loading) return;
    if (!openById(openParam)) setOpenId(openParam);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    // Once, when the list is there
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, loading, today.loading]);

  const changeFilter = (value) => {
    setFilter(value);
    setPage(1);
  };
  const changePage = (next) => {
    setPage(next);
    listRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // An item of the top lists: open it in the list when it is on this page, else in a window
  const [shownItem, setShownItem] = useState(null);
  const openTop = (item) => {
    if (items.some((n) => n.id === item.id)) {
      setOpenId(item.id);
      document.getElementById(domId(item.id))?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      setShownItem(item);
    }
  };
  // An item by its id (the analysis's news, a link from the home card or a notification)
  const findItem = (id) => items.find((n) => n.id === id) || today.top.find((n) => n.id === id) || today.week.find((n) => n.id === id);
  const openById = (id) => {
    const item = findItem(id);
    if (item) openTop(item);
    return Boolean(item);
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

      {/* The topics: a bar of their own above the columns, so the list, the top news and the
          analysis start level */}
      <nav className="news-filters" aria-label="موضوع خبرها">
        <FilterPills options={FILTERS} activeValue={filter} onChange={changeFilter} size="sm" />
      </nav>

      <div className="news-layout">
        {/* Today's and the week's most important news: a narrow column */}
        <aside className="news-layout-rail" aria-label="مهم‌ترین خبرها">
          <TopList title="مهم‌ترین‌های امروز" Icon={Flame} items={today.top} loading={today.loading} onOpen={openTop} />
          <TopList title="مهم‌ترین‌های هفته" Icon={CalendarDays} items={today.week} loading={today.loading} onOpen={openTop} />
        </aside>

        {/* The day's analysis: stays in view while the list scrolls */}
        <aside className="news-layout-side" aria-label="تحلیل روز">
          <NewsAnalysisCard analysis={today.analysis} onOpenNews={(id) => (findItem(id) ? () => openById(id) : null)} />
        </aside>

        <div className="news-layout-main" ref={listRef}>
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
              <div className="news-list">
                {items.map((item) => (
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
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={changePage} label="صفحه‌های اخبار" />
            </>
          )}
        </div>
      </div>

      <Modal isOpen={Boolean(shownItem)} onClose={() => setShownItem(null)} title="خبر" icon={<Newspaper size={18} />} maxWidth="640px">
        {shownItem && (
          <NewsItem item={shownItem} open onToggle={() => {}} isAdmin={isAdmin} onHide={(item) => { setShownItem(null); hide(item); }} />
        )}
      </Modal>
    </div>
  );
}
