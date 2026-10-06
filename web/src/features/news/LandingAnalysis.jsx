/**
 * LandingAnalysis.jsx — The landing page's live «تحلیل روز»: the latest analyst's card, read only
 * when the section scrolls into view (GET /api/news/analysis: a KV copy, cached at the edge — no
 * database read), with a way into the news page. Nothing shows when there is no analysis yet.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import NewsAnalysisCard from './NewsAnalysisCard.jsx';
import { getLatestNewsAnalysis } from './newsApi.js';

export default function LandingAnalysis() {
  const ref = useRef(null);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      getLatestNewsAnalysis().then((res) => setAnalysis(res?.analysis || null)).catch(() => {});
    };
    if (typeof IntersectionObserver !== 'function') {
      load();
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        load();
        observer.disconnect();
      }
    }, { rootMargin: '300px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="landing-analysis">
      {analysis && (
        <>
          <NewsAnalysisCard analysis={analysis} />
          <a href="/news" className="features-view-all-link">
            <span>همه‌ی خبرهای مهم بازار و تحلیل روز</span>
            <ArrowLeft size={16} />
          </a>
        </>
      )}
    </div>
  );
}
