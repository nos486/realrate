/**
 * AiAnalysisWidget.jsx — «تحلیل روز با هوش مصنوعی»: only the day's AI analysis of the news (its
 * headline, summary, key events and points), without the list of news. A key event opens in the
 * news page.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { appPath } from '../../../shared/routes.js';
import Skeleton from '../../../shared/ui/Skeleton.jsx';
import NewsAnalysisCard from '../../news/NewsAnalysisCard.jsx';
import { useNewsToday } from '../../news/useNews.js';

export default function AiAnalysisWidget({ widget }) {
  const { drivers = true, points = true, risk = true } = widget?.config || {};
  const navigate = useNavigate();
  const { analysis, loading } = useNewsToday();
  if (loading && !analysis) return <Skeleton height={160} radius={20} />;
  if (!analysis) return null;
  return (
    <NewsAnalysisCard
      analysis={{
        ...analysis,
        drivers: drivers ? analysis.drivers : [],
        points: points ? analysis.points : [],
        risk: risk ? analysis.risk : '',
      }}
      className="is-dashboard"
      onOpenNews={(id) => () => navigate(appPath(id ? `/news?open=${encodeURIComponent(id)}` : '/news'))}
    />
  );
}
