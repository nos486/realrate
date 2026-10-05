/**
 * NewsCard.jsx — «آخرین اخبار» on the home page (the website's and the app's): the latest few
 * headlines (one line each) with their source and time; an item or «همه» opens the news page.
 * On the website's home (`is-web-home`) the four latest stand side by side. Above them, the
 * headline of the day's AI analysis.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Newspaper, Sparkles } from 'lucide-react';
import Skeleton from '../../shared/ui/Skeleton.jsx';
import { appPath } from '../../shared/routes.js';
import { useNews, useNewsToday } from './useNews.js';
import { newsTimeAgo, newsSource, newsFullTime } from './newsFormat.js';

export default function NewsCard({ count = 4, className = '' }) {
  const navigate = useNavigate();
  const { items, loading } = useNews({ limit: count });
  const { analysis } = useNewsToday();
  const open = (id) => navigate(appPath(id ? `/news?open=${encodeURIComponent(id)}` : '/news'));

  // Nothing published yet (or the list couldn't be read): no empty card on the home page
  if (!loading && !items.length) return null;

  return (
    <section className={`news-card ${className}`} aria-label="آخرین اخبار">
      <header className="news-card-head">
        <h2>
          <Newspaper size={16} aria-hidden="true" />
          آخرین اخبار
        </h2>
        <button type="button" className="news-card-more" onClick={() => open()}>
          همه <ChevronLeft size={16} />
        </button>
      </header>
      {/* The day's analysis in one line (the news page has all of it) */}
      {analysis?.title && (
        <button type="button" className="news-card-analysis" onClick={() => open()} title={analysis.title}>
          <Sparkles size={14} aria-hidden="true" />
          <span className="news-card-analysis-label">تحلیل روز</span>
          <span className="news-card-analysis-text">{analysis.title}</span>
        </button>
      )}
      {loading ? (
        <div className="news-card-list">
          {Array.from({ length: Math.min(count, 3) }, (_, i) => <Skeleton key={i} height={46} radius={12} />)}
        </div>
      ) : (
        <ul className="news-card-list">
          {items.slice(0, count).map((n) => (
            <li key={n.id}>
              <button type="button" className="news-card-row" onClick={() => open(n.id)}>
                <span className={`news-dot is-${n.importance >= 3 ? 'high' : n.importance === 2 ? 'mid' : 'low'}`} aria-hidden="true" />
                <span className="news-card-text">
                  <strong title={n.title}>{n.title}</strong>
                  <small>
                    <bdi>{newsSource(n)}</bdi> · <time dateTime={new Date(n.publishedAt).toISOString()} title={newsFullTime(n.publishedAt)}>{newsTimeAgo(n.publishedAt)}</time>
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
