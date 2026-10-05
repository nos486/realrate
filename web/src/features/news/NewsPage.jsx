/**
 * NewsPage.jsx — «اخبار»: market news picked from Telegram news channels
 *
 * Only what can move the dollar, gold, coins, metals or the economy is published (the server picks
 * and summarizes it with AI, api/src/services/news/news.service.js). Each item shows its headline,
 * a short summary, its source and time; a tap opens the post's full text and its link on Telegram.
 * Filters: all, important only, or one subject. New news comes in by itself every minute.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Newspaper, ExternalLink, Share2, EyeOff, ChevronDown, Sparkles } from 'lucide-react';
import { FeaturePageHeader, FilterPills, EmptyState, AlertBanner } from '../../shared/ui/index.js';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import { useFeedback } from '../../shared/ui/FeedbackProvider.jsx';
import { useAuth } from '../auth/index.js';
import { useNews } from './useNews.js';
import { setNewsHidden } from './newsApi.js';
import { NEWS_CATEGORIES, newsTimeAgo, newsFullTime, newsSource } from './newsFormat.js';

const FILTERS = [
  { value: 'all', label: 'همه' },
  { value: 'important', label: 'مهم‌ها' },
  ...Object.entries(NEWS_CATEGORIES).map(([value, label]) => ({ value, label })),
];

function NewsItem({ item, open, onToggle, isAdmin, onHide }) {
  const { toast } = useFeedback();
  const showSummary = item.summary && item.summary !== item.title;

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
    <article
      id={`news-${item.id.replace('/', '-')}`}
      className={`news-item ${open ? 'is-open' : ''} ${item.importance >= 3 ? 'is-important' : ''}`}
    >
      <button type="button" className="news-item-main" onClick={onToggle} aria-expanded={open}>
        <span className="news-item-tags">
          {item.importance >= 3 && <span className="news-tag is-important">مهم</span>}
          <span className={`news-tag is-${item.category}`}>{NEWS_CATEGORIES[item.category] || 'اقتصاد'}</span>
        </span>
        <h3 className="news-item-title">{item.title}</h3>
        {showSummary && <p className="news-item-summary">{item.summary}</p>}
        <span className="news-item-meta">
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

export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { toast } = useFeedback();
  const [filter, setFilter] = useState('all');
  const openParam = searchParams.get('open');
  const [openId, setOpenId] = useState(openParam);

  const query = useMemo(() => ({
    limit: 20,
    important: filter === 'important',
    category: filter !== 'all' && filter !== 'important' ? filter : '',
  }), [filter]);
  const { items, loading, error, hasMore, loadingMore, loadMore, removeItem } = useNews(query);

  // Opened from the home card: that item is open and in view
  useEffect(() => {
    if (!openParam || loading) return;
    setOpenId(openParam);
    const el = document.getElementById(`news-${openParam.replace('/', '-')}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
    // Once, when the list is there
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, loading]);

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
        subtitle="خبرهای مهم دلار، طلا، فلزات و اقتصاد — هر دقیقه از کانال‌های خبری"
      />

      <div className="news-filters">
        <FilterPills options={FILTERS} activeValue={filter} onChange={setFilter} size="sm" />
      </div>

      {error && !items.length && <AlertBanner type="warning" message={error} />}

      {loading ? (
        <div className="news-list">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={96} radius={16} />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="خبری نیست"
          description={filter === 'all' ? 'به‌زودی خبرهای مهم بازار اینجا می‌آید.' : 'در این دسته فعلاً خبری نیست.'}
        />
      ) : (
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
          {hasMore && (
            <button type="button" className="news-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'در حال خواندن…' : 'خبرهای قبلی'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
