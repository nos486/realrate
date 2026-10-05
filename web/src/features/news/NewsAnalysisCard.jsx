/**
 * NewsAnalysisCard.jsx — «تحلیل روز»: the model's view of the day's news, written by the server
 * when new news comes in (api/src/services/news/newsAnalysis.service.js) — a headline, the
 * analysis, where the dollar, gold, coins, the stock index and oil may go (with how sure the
 * model is), the day's most important news and their impact, the key points and the main risk
 *
 * `compact` (the news page's side panel): the headline and the directions first, the rest behind
 * «ادامه‌ی تحلیل».
 */

import React, { useState } from 'react';
import { Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronDown } from 'lucide-react';
import { newsTimeAgo, newsFullTime } from './newsFormat.js';

const ASSETS = { usd: 'دلار', gold: 'طلا', coin: 'سکه', bourse: 'بورس', oil: 'نفت' };
const DIRECTIONS = {
  up: { label: 'صعودی', Icon: TrendingUp },
  down: { label: 'نزولی', Icon: TrendingDown },
  flat: { label: 'خنثی', Icon: Minus },
};
const CONFIDENCE = { 1: 'اطمینان کم', 2: 'اطمینان متوسط', 3: 'اطمینان زیاد' };
const IMPACT = { 1: 'اثر کم', 2: 'اثر متوسط', 3: 'اثر زیاد' };
const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

export default function NewsAnalysisCard({ analysis, className = '', compact = false }) {
  const [expanded, setExpanded] = useState(false);
  if (!analysis?.title) return null;
  const outlook = (analysis.outlook || []).filter((o) => ASSETS[o.asset]);
  const full = !compact || expanded;
  const hasMore = Boolean(analysis.summary || analysis.drivers?.length || analysis.points?.length || analysis.risk);

  return (
    <section className={`news-analysis ${compact ? 'is-compact' : ''} ${className}`} aria-label="تحلیل روز">
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
      {full && <p className="news-analysis-summary">{analysis.summary}</p>}

      {outlook.length > 0 && (
        <ul className="news-analysis-outlook">
          {outlook.map((o) => {
            const d = DIRECTIONS[o.direction] || DIRECTIONS.flat;
            return (
              <li key={o.asset} className={`is-${o.direction}`} title={o.note}>
                <span className="news-analysis-asset">{ASSETS[o.asset]}</span>
                <span className="news-analysis-dir">
                  <d.Icon size={14} aria-hidden="true" />
                  {d.label}
                  {CONFIDENCE[o.confidence] && (
                    <span className={`news-analysis-conf is-${o.confidence}`} title={CONFIDENCE[o.confidence]} aria-label={CONFIDENCE[o.confidence]}>
                      {[1, 2, 3].map((i) => <i key={i} className={i <= o.confidence ? 'is-on' : ''} />)}
                    </span>
                  )}
                </span>
                {o.note && full && <small>{o.note}</small>}
              </li>
            );
          })}
        </ul>
      )}

      {full && analysis.drivers?.length > 0 && (
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

      {full && analysis.points?.length > 0 && (
        <ul className="news-analysis-points">
          {analysis.points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {full && analysis.risk && (
        <p className="news-analysis-risk">
          <AlertTriangle size={14} aria-hidden="true" />
          <span><strong>زیر نظر بگیرید:</strong> {analysis.risk}</span>
        </p>
      )}

      {compact && hasMore && (
        <button type="button" className="news-analysis-more" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'بستن تحلیل' : 'ادامه‌ی تحلیل'}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}

      {full && <p className="news-analysis-note">این تحلیل را هوش مصنوعی از خبرهای امروز نوشته است و توصیه‌ی خرید یا فروش نیست.</p>}
    </section>
  );
}
