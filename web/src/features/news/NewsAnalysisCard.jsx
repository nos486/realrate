/**
 * NewsAnalysisCard.jsx — «تحلیل روز»: the model's view of the day's news, written by the server
 * when new news comes in (api/src/services/news/newsAnalysis.service.js) — a headline, the
 * analysis, where the dollar, gold, coins, the stock index and oil may go, the key points and the
 * main risk
 */

import React from 'react';
import { Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { newsTimeAgo, newsFullTime } from './newsFormat.js';

const ASSETS = { usd: 'دلار', gold: 'طلا', coin: 'سکه', bourse: 'بورس', oil: 'نفت' };
const DIRECTIONS = {
  up: { label: 'صعودی', Icon: TrendingUp },
  down: { label: 'نزولی', Icon: TrendingDown },
  flat: { label: 'خنثی', Icon: Minus },
};
const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

export default function NewsAnalysisCard({ analysis, className = '' }) {
  if (!analysis?.title) return null;
  const outlook = (analysis.outlook || []).filter((o) => ASSETS[o.asset]);

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
                </span>
                {o.note && <small>{o.note}</small>}
              </li>
            );
          })}
        </ul>
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
