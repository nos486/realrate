/**
 * AdminOutlookPage.jsx — The dollar outlook experiment in the admin panel: each day the model
 * gives three scenarios (up / flat / down) for the dollar a week ahead from the week's news and
 * the recent closes. Here they are scored against the real closes and against a flat guess, so
 * the admin can see whether the model is worth anything before it is shown to anyone.
 */

import React, { useEffect, useState } from 'react';
import { LineChart, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button, AlertBanner, EmptyState } from '../../../shared/ui/index.js';
import { useFeedback } from '../../../shared/ui/FeedbackProvider.jsx';
import { getDollarOutlook, runDollarOutlookNow } from '../api/outlookApi.js';
import { newsTimeAgo } from '../../news/newsFormat.js';

const fa = (n) => Number(n || 0).toLocaleString('fa-IR');
const LABELS = { up: 'صعود', flat: 'ثابت', down: 'نزول' };
const SKIPPED = {
  'too-early': 'هنوز زود است (بعد از ساعت ۲۰ تهران)',
  done: 'امروز نوشته شده است',
  'no-history': 'تاریخچه‌ی دلار کافی نیست',
  'no-news': 'خبری برای هفته نیست',
  'no-model': 'هوش مصنوعی وصل نیست',
};

/** Totals: the model against a flat guess */
function Summary({ summary, flatBandPct }) {
  if (!summary?.n) return <p className="admin-card-hint">هنوز سناریویی به روز نتیجه نرسیده است.</p>;
  const cells = [
    { label: 'سناریوی بررسی‌شده', value: fa(summary.n) },
    { label: 'درصد جهت درست مدل', value: `${fa(summary.hitRate)}٪`, tone: summary.hitRate > summary.baselineHitRate ? 'is-ok' : 'is-warn' },
    { label: 'درصد درست حدس «ثابت»', value: `${fa(summary.baselineHitRate)}٪` },
    { label: 'قیمت داخل بازه', value: `${fa(summary.inRangeRate)}٪` },
    { label: 'خطای مدل (بریر)', value: fa(summary.brier), tone: summary.brier < summary.baselineBrier ? 'is-ok' : 'is-warn' },
    { label: 'خطای حدس «ثابت»', value: fa(summary.baselineBrier) },
  ];
  return (
    <>
      <div className="admin-news-totals" aria-label="نتیجه">
        {cells.map((c) => (
          <div key={c.label} className={c.tone || ''}>
            <strong>{c.value}</strong>
            <small>{c.label}</small>
          </div>
        ))}
      </div>
      <p className="admin-card-hint">«ثابت» یعنی تغییر کمتر از {fa(flatBandPct)}٪ در هر جهت. خطای کمتر بهتر است؛ تا مدل از حدس «ثابت» بهتر نشده، جایی نمایش داده نمی‌شود.</p>
    </>
  );
}

export default function AdminOutlookPage() {
  const toast = useFeedback();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getDollarOutlook()
      .then((res) => alive && setData(res))
      .catch((err) => alive && setError(err?.message || 'بارگذاری نشد.'));
    return () => { alive = false; };
  }, []);

  const run = async () => {
    setBusy(true);
    try {
      const res = await runDollarOutlookNow();
      setData(res);
      if (res.result?.recorded) toast.success('سناریوی امروز نوشته شد.');
      else if (res.result?.reason === 'model-error') toast.error(`مدل خطا داد: ${res.result.error}`, { duration: 8000 });
      else toast.warning(SKIPPED[res.result?.reason] || `نوشته نشد (${res.result?.reason || 'خطا'}).`);
    } catch (err) {
      toast.error(err?.message || 'اجرا نشد.');
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <AlertBanner type="error" message={error} />;
  if (!data) return <div className="require-auth-loading"><div className="spinner-glow" /></div>;

  const { records = [], status } = data;
  return (
    <div className="admin-news">
      <div className="portfolio-stat-card">
        <div className="stat-header">
          <span className="stat-label"><LineChart size={14} /> سناریوی دلار ({fa(data.horizonDays)} روز بعد)</span>
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={busy} disabled={busy || !data.aiConfigured} onClick={run}>
            سناریوی امروز
          </Button>
        </div>
        <p className="admin-card-hint">
          آزمایش فقط برای مدیر: هر شب مدل با خبرهای مهم هفته و قیمت ۳۰ روز اخیر دلار، احتمال صعود، ثبات یا نزول را برای {fa(data.horizonDays)} روز بعد می‌نویسد.
          به کاربران چیزی نشان داده نمی‌شود؛ نتیجه‌ی هر سناریو بعد از رسیدن آن روز با قیمت واقعی سنجیده می‌شود. این پیش‌بینی قطعی یا توصیه نیست.
        </p>
        <div className="admin-news-ai">
          <small>مدل: {data.model}</small>
          {status && (status.ok ? (
            <small><CheckCircle2 size={12} className="is-ok" /> آخرین اجرا {newsTimeAgo(status.at)} بدون خطا.</small>
          ) : (
            <small className="is-warn"><AlertTriangle size={12} /> آخرین اجرا {newsTimeAgo(status.at)}: {status.error}</small>
          ))}
        </div>
        <Summary summary={data.summary} flatBandPct={data.flatBandPct} />
      </div>

      <div className="portfolio-stat-card">
        {records.length === 0 ? (
          <EmptyState title="سناریویی ثبت نشده" description="هر شب بعد از ساعت ۲۰ تهران یکی نوشته می‌شود؛ می‌توانید همین حالا هم بسازید." />
        ) : (
          <div className="admin-news-table-wrap">
            <table className="admin-news-table">
              <caption>سناریوهای ثبت‌شده</caption>
              <thead>
                <tr>
                  <th scope="col">روز</th>
                  <th scope="col">قیمت آن روز</th>
                  <th scope="col">صعود</th>
                  <th scope="col">ثابت</th>
                  <th scope="col">نزول</th>
                  <th scope="col">بازه</th>
                  <th scope="col">نتیجه</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.day} title={r.reason}>
                    <td dir="ltr">{r.day}</td>
                    <td>{fa(Math.round(r.base))}</td>
                    <td>{fa(r.up)}٪</td>
                    <td>{fa(r.flat)}٪</td>
                    <td>{fa(r.down)}٪</td>
                    <td>{fa(r.low)} – {fa(r.high)}</td>
                    <td className={r.score ? (r.score.hit ? 'is-ok' : 'is-warn') : ''}>
                      {r.score ? `${LABELS[r.score.label]} (${fa(r.score.close)})` : `در انتظار ${r.horizon}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="admin-card-hint">با نگه داشتن اشاره‌گر روی هر ردیف دلیل مدل دیده می‌شود.</p>
      </div>
    </div>
  );
}
