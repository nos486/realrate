/**
 * NewsWidget.jsx — «آخرین اخبار»: the latest headlines (the widget's `count` option); the card
 * hides itself for users without the news (Pro, Persian only)
 */

import React from 'react';
import NewsCard from '../../news/NewsCard.jsx';

export default function NewsWidget({ widget }) {
  return <NewsCard count={widget.config?.count || 5} showAnalysis={widget.config?.analysis !== false} className="is-dashboard" />;
}
