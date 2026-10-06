/**
 * NewsAnalysisCard.jsx — «تحلیل روز»: the model's reading of the day's news, written by the server
 * when new news comes in (api/src/services/news/newsAnalysis.service.js) — a headline, the
 * analysis, the day's most important news and their impact, the key points and what to watch.
 * No forecast of any market: the day's news alone can't call one (an older analysis's `outlook`
 * is not shown).
 */

import React from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { newsTimeAgo, newsFullTime } from './newsFormat.js';

const IMPACT = { 1: 'اثر کم', 2: 'اثر متوسط', 3: 'اثر زیاد' };
const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

export default function NewsAnalysisCard({ analysis, className = '' }) {
  if (!analysis?.title) return null;

  return (
    <section className={`news-analysis ${className}`} aria-label="تحلیل روز">
      <header className="news-analysis-head">
        <span className="news-analysis-badge">
          <Sparkles size={14} aria-hidden="true" />
          تحلیل روز با هوش مصنوعی
        </span>
        <time dateTime={new Date(analysis.at).toISOString()} title={newsFullTime(analysis.at)}>
          {newsTimeAgo(analysis.at)}{analysis.newsCount ? ` · بر اساس ${fa(analysis.newsCount)} خبر` : ''}
        </time>
      </header>

      <h2 className="news-analysis-title">{analysis.title}</h2>
      <p className="news-analysis-summary">{analysis.summary}</p>

      {analysis.drivers?.length > 0 && (
        <div className="news-analysis-drivers">
          <h3>مهم‌ترین خبرهای امروز</h3>
          <ol>
            {analysis.drivers.map((n) => (
              <li key={n.id}>
                <span className={`news-analysis-impact is-${n.impact}`}>{IMPACT[n.impact]}</span>
                {n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer">{n.title}</a> : <span>{n.title}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {analysis.points?.length > 0 && (
        <ul className="news-analysis-points">
          {analysis.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {analysis.risk && (
        <p className="news-analysis-risk">
          <AlertTriangle size={14} aria-hidden="true" />
          <span><strong>زیر نظر بگیرید:</strong> {analysis.risk}</span>
        </p>
      )}

      <p className="news-analysis-note">این تحلیل را هوش مصنوعی از خبرهای امروز نوشته است و توصیه‌ی خرید یا فروش نیست.</p>
    </section>
  );
}
