/**
 * LandingAnalysis.jsx — The landing page's live «تحلیل روز»: the latest analyst's card, read only
 * when the section scrolls into view (GET /api/news/today, the news page's own answer: kept in
 * Cloudflare's edge cache, so visitors share one read), with a way into the news page. Nothing
 * shows when there is no analysis yet.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import NewsAnalysisCard from './NewsAnalysisCard.jsx';
import { getNewsToday } from './newsApi.js';

/**
 * @param {{ head: React.ReactNode, className?: string, id?: string }} props the section's heading
 * and look: the whole section shows only once there is an analysis
 */
export default function LandingAnalysis({ head, className = '', id }) {
  const ref = useRef(null);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      getNewsToday({ silent: true }).then((res) => setAnalysis(res?.analysis || null)).catch(() => {});
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
    // Near (400px below the screen), or already scrolled past (a jump to the bottom)
    }, { rootMargin: '100000px 0px 400px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} id={id} className={`${className} ${analysis ? '' : 'is-empty'}`} aria-hidden={!analysis}>
      {analysis && (
        <div className="lp-container">
          {head}
          <div className="landing-analysis">
            <NewsAnalysisCard analysis={analysis} />
            <a href="/news" className="lp-more">
              <span>همه‌ی خبرهای مهم بازار</span>
              <ArrowLeft size={16} />
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
