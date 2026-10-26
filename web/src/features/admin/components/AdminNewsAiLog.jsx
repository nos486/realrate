/**
 * AdminNewsAiLog.jsx — «درخواست‌های ردشده» in the admin's news section: every post the news model
 * was sent in the last 24 hours that wasn't published, newest first — why (the request failed, the
 * answer was unreadable or left it out, the model rejected it, foreign words, set aside), the
 * post's text as it was sent, and the error and the model's answer. A pill per reason filters it.
 */

import { intlLocale } from '../../../utils/i18n.js';
import React, { useCallback, useEffect, useState } from 'react';
import { Ban, RefreshCw } from 'lucide-react';
import { Button, EmptyState, FilterPills } from '../../../shared/ui/index.js';
import { getNewsAiLog } from '../../news/newsApi.js';
import { newsTimeAgo, newsClock } from '../../news/newsFormat.js';
import { AdminCard, AdminNotice, AdminStatus } from './AdminPage.jsx';

const fa = (n) => Number(n || 0).toLocaleString(intlLocale());

/** The reasons, in the order the pills show them (the server's NEWS_AI_LOG_REASONS) */
const AI_LOG_REASONS = {
  error: { label: 'خطای درخواست', hint: 'Workers AI درخواست را رد کرد یا جواب نداد؛ پست دوباره فرستاده می‌شود.', tone: 'error' },
  unreadable: { label: 'جواب نامفهوم', hint: 'جواب مدل JSON قابل خواندن نداشت؛ پست دوباره فرستاده می‌شود.', tone: 'error' },
  missed: { label: 'جاافتاده در جواب', hint: 'مدل در جوابش دربارهٔ این پست چیزی نگفت (احتمالاً سقف توکن)؛ دوباره فرستاده می‌شود.', tone: 'warn' },
  gaveUp: { label: 'کنارگذاشته', hint: 'چند درخواست پشت سر هم برای این پست خطا داد و دیگر فرستاده نمی‌شود.', tone: 'error' },
  foreign: { label: 'کلمهٔ غیرفارسی', hint: 'ترجمهٔ مدل برای خبر بین‌المللی کلمهٔ غیرفارسی داشت و منتشر نشد.', tone: 'warn' },
  rejected: { label: 'رد مدل', hint: 'مدل پست را خواند و آن را خبر مؤثر بر بازار ندانست.', tone: null },
};
const ORDER = Object.keys(AI_LOG_REASONS);

/** One logged post: when, why, its source, the text sent, the error and the model's answer */
function LogRow({ row }) {
  const reason = AI_LOG_REASONS[row.reason] || { label: row.reason, tone: null };
  return (
    <li className={`admin-news-ailog-row ${reason.tone ? `is-${reason.tone}` : ''}`.trim()}>
      <div className="admin-news-ailog-head">
        <span className="admin-news-ailog-reason">{reason.label}</span>
        <a href={row.url} target="_blank" rel="noopener noreferrer"><bdi>{row.post}</bdi></a>
        {row.source === 'world' && <span className="admin-news-ailog-tag">بین‌الملل</span>}
        {row.tries > 0 && <span className="admin-news-ailog-tag">تلاش {fa(row.tries)}</span>}
        <small>{newsClock(row.at)} · {newsTimeAgo(row.at)}</small>
      </div>
      {row.error && <p className="admin-news-ailog-error"><bdi dir="ltr">{row.error}</bdi></p>}
      <details>
        <summary>متن فرستاده‌شده{row.answer ? ' و جواب مدل' : ''}</summary>
        <pre className="admin-news-ailog-text">{row.text}</pre>
        {row.answer && (
          <>
            <h4>جواب مدل</h4>
            <pre className="admin-news-ailog-text" dir="ltr">{row.answer}</pre>
          </>
        )}
        {row.requestId && <AdminStatus>درخواست <bdi dir="ltr">{row.requestId}</bdi></AdminStatus>}
      </details>
    </li>
  );
}

export default function AdminNewsAiLog() {
  const [reason, setReason] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (which) => {
    setLoading(true);
    try {
      setData(await getNewsAiLog(which));
      setError('');
    } catch (err) {
      setError(err?.message || 'خوانده نشد.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load(reason);
  }, [load, reason]);

  const counts = data?.counts || {};
  const total = ORDER.reduce((sum, k) => sum + (counts[k] || 0), 0);
  const failed = total - (counts.rejected || 0);
  const items = data?.items || [];
  const options = [
    { value: '', label: 'همه', badge: fa(total) },
    ...ORDER.filter((k) => counts[k]).map((k) => ({ value: k, label: AI_LOG_REASONS[k].label, badge: fa(counts[k]) })),
  ];

  return (
    <AdminCard
      icon={<Ban size={18} />}
      title="درخواست‌های ردشده"
      subtitle={`${data?.hours ? fa(data.hours) : '۲۴'} ساعت اخیر · ${data?.model || 'مدل'}`}
      actions={(
        <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} loading={loading} onClick={() => load(reason)}>
          تازه کردن
        </Button>
      )}
    >
      {error && <AdminNotice tone="error">{error}</AdminNotice>}
      {data && (
        <>
          <div className="admin-news-totals" aria-label="خلاصه">
            <div className={failed ? 'is-warn' : ''}>
              <strong>{fa(failed)}</strong>
              <small>خطا یا جواب ناقص</small>
            </div>
            <div>
              <strong>{fa(counts.rejected)}</strong>
              <small>رد مدل</small>
            </div>
          </div>
          {options.length > 1 && (
            <FilterPills size="sm" options={options} activeValue={reason} onChange={setReason} />
          )}
          {reason && AI_LOG_REASONS[reason] && <p className="admin-card-hint">{AI_LOG_REASONS[reason].hint}</p>}
          {items.length ? (
            <ul className="admin-news-ailog" aria-label="درخواست‌های ردشده">
              {items.map((row) => <LogRow key={row.id} row={row} />)}
            </ul>
          ) : (
            <EmptyState title="در این بازه چیزی نیست" description="هر پستی که به مدل فرستاده شود و منتشر نشود، اینجا ثبت می‌شود." />
          )}
          {items.length >= (data.limit || Infinity) && (
            <p className="admin-card-hint">فقط {fa(data.limit)} مورد آخر نشان داده شده است.</p>
          )}
        </>
      )}
    </AdminCard>
  );
}
