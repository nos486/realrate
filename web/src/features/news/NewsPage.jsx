/**
 * NewsPage.jsx — «اخبار»: market news picked from Telegram news channels
 *
 * Only what can move the dollar, gold, coins, metals, the stock index or the economy is published
 * (the server picks and summarizes it with AI, api/src/services/news/news.service.js).
 *
 *   ┌──────────────────────────────┬──────────────────┐
 *   │ تحلیل روز (AI)               │ مهم‌ترین‌های امروز │   large screens: two columns,
 *   │ filters · list · pages       │ (sticky)          │   today's top on the left
 *   └──────────────────────────────┴──────────────────┘
 * On a phone: the analysis, today's top, then the list. Each item shows its headline, summary,
 * source and time; a tap opens the post's full text and its link on Telegram. The list comes in
 * pages; new news comes in by itself every minute.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Newspaper, ExternalLink, Share2, EyeOff, ChevronDown, Sparkles, Flame } from 'lucide-react';
import { FeaturePageHeader, FilterPills, EmptyState, AlertBanner, Pagination } from '../../shared/ui/index.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useAuth } from '../auth/index.js';
import { useNews, useNewsToday } from './useNews.js';
import { setNewsHidden } from './newsApi.js';
import NewsAnalysisCard from './NewsAnalysisCard.jsx';
import { NEWS_CATEGORIES, newsTimeAgo, newsFullTime, newsSource } from './newsFormat.js';

const PAGE_SIZE = 12;
const FRESH_MS = 30 * 60000;

const FILTERS = [
  { value: 'all', label: 'همه' },
  { value: 'important', label: 'مهم‌ها' },
  ...Object.entries(NEWS_CATEGORIES).map(([value, label]) => ({ value, label })),
];

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
  const { items, total, loading, error, removeItem } = useNews(query);
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
      />

      <div className="news-layout">
        <NewsAnalysisCard analysis={today.analysis} className="news-layout-analysis" />

        <aside className="news-layout-aside">
          <TodayTop items={today.top} loading={today.loading} onOpen={openTop} />
        </aside>

        <div className="news-layout-main" ref={listRef}>
          <div className="news-filters">
            <FilterPills options={FILTERS} activeValue={filter} onChange={changeFilter} size="sm" />
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
    </div>
  );
}
